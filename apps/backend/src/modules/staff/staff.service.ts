import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { todayLimaDateString } from '../../utils/timezone';
import { treasuryService } from '../treasury/treasury.service';
import { attendanceService, parseSchedule, toMinutes, type WorkSchedule } from '../attendance/attendance.service';
import {
  attendanceDiscounts, computeTotals, periodBase, periodFamilyAllowance, round2, suggestBenefit,
  vacationDaysEarned, vacationDaysPerYear, RMV, addDays, nextPeriod, nextPeriodStart,
  type CalcEmployee, type PayFrequency, type PayrollKind,
} from './payroll-calc';

export interface EmployeeInput {
  firstName: string; lastName: string; docNumber?: string | null; phone?: string | null; position?: string | null;
  startDate: string; endDate?: string | null; isActive?: boolean; userId?: string | null;
  employmentType: 'INFORMAL' | 'PLANILLA'; laborRegime?: 'MICRO' | 'GENERAL' | null; payFrequency: PayFrequency;
  salary: number; pensionSystem?: 'NONE' | 'ONP' | 'AFP'; afpName?: string | null; afpRate?: number | null;
  familyAllowance?: boolean; discountAbsences?: boolean; discountLateness?: boolean; notes?: string | null;
}

export interface PaymentInput {
  kind: PayrollKind;
  periodStart: string; periodEnd: string;
  daysScheduled?: number; daysWorked?: number; lateMinutes?: number;
  baseAmount: number; familyAllowance?: number; bonus?: number;
  absenceDiscount?: number; lateDiscount?: number;
  advanceIds?: string[];
  otherDiscount?: number; otherDiscountNote?: string | null;
  method: string; cashSessionId?: string; notes?: string | null;
}

const KIND_LABEL: Record<PayrollKind, string> = {
  REGULAR: 'Sueldo', GRATIFICACION: 'Gratificación', CTS: 'CTS', VACACIONES: 'Vacaciones', LIQUIDACION: 'Liquidación',
};

const dateOnly = (d: string) => new Date(`${d}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();

function scheduledDaysIn(schedule: WorkSchedule | null, from: string, to: string): { days: number; minutesPerDay: number } {
  if (!schedule) return { days: 0, minutesPerDay: 0 };
  let days = 0; let minutes = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay() || 7;
    const day = schedule.days[String(wd) as keyof WorkSchedule['days']];
    if (!day) continue;
    days += 1;
    const lunch = day.lunchStart && day.lunchEnd ? toMinutes(day.lunchEnd) - toMinutes(day.lunchStart) : 0;
    minutes += toMinutes(day.end) - toMinutes(day.start) - lunch;
  }
  return { days, minutesPerDay: days ? Math.round(minutes / days) : 0 };
}

function calcEmployee(e: {
  employmentType: string; laborRegime: string | null; payFrequency: string; salary: Prisma.Decimal | number;
  pensionSystem: string; afpRate: Prisma.Decimal | number | null; familyAllowance: boolean;
}): CalcEmployee {
  return {
    employmentType: e.employmentType as CalcEmployee['employmentType'],
    laborRegime: e.laborRegime as CalcEmployee['laborRegime'],
    payFrequency: e.payFrequency as PayFrequency,
    salary: Number(e.salary),
    pensionSystem: e.pensionSystem as CalcEmployee['pensionSystem'],
    afpRate: e.afpRate != null ? Number(e.afpRate) : null,
    familyAllowance: e.familyAllowance,
  };
}

export class StaffService {
  private validate(input: Partial<EmployeeInput>) {
    if (input.docNumber && !/^\d{8}$|^[A-Z0-9]{9,12}$/i.test(input.docNumber)) {
      throw new BusinessError('El DNI debe tener 8 dígitos (o el carné de extranjería de 9 a 12 caracteres).');
    }
    if (input.salary !== undefined && !(input.salary > 0)) throw new BusinessError('Escribe cuánto gana.');
    if (input.employmentType === 'PLANILLA') {
      if (!input.laborRegime) throw new BusinessError('Elige el régimen laboral del trabajador en planilla.');
      if (!input.docNumber) throw new BusinessError('Para la planilla necesitas el DNI del trabajador.');
      if (input.pensionSystem === 'AFP' && !(Number(input.afpRate) > 0)) {
        throw new BusinessError('Escribe el % que descuenta su AFP (sale en su estado de cuenta, suele ser cerca de 11.4%).');
      }
    }
  }

  private data(input: Partial<EmployeeInput>): Prisma.EmployeeUncheckedUpdateInput {
    const planilla = input.employmentType === 'PLANILLA';
    return {
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(input.docNumber !== undefined ? { docNumber: input.docNumber?.trim().toUpperCase() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.position !== undefined ? { position: input.position?.trim() || null } : {}),
      ...(input.startDate ? { startDate: dateOnly(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate ? dateOnly(input.endDate) : null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.userId !== undefined ? { userId: input.userId || null } : {}),
      ...(input.employmentType ? {
        employmentType: input.employmentType,
        laborRegime: planilla ? input.laborRegime ?? null : null,
        pensionSystem: planilla ? input.pensionSystem ?? 'NONE' : 'NONE',
        afpName: planilla && input.pensionSystem === 'AFP' ? input.afpName?.trim() || null : null,
        afpRate: planilla && input.pensionSystem === 'AFP' ? input.afpRate ?? null : null,
        familyAllowance: planilla ? !!input.familyAllowance : false,
      } : {}),
      ...(input.payFrequency ? { payFrequency: input.payFrequency } : {}),
      ...(input.salary !== undefined ? { salary: input.salary } : {}),
      ...(input.discountAbsences !== undefined ? { discountAbsences: input.discountAbsences } : {}),
      ...(input.discountLateness !== undefined ? { discountLateness: input.discountLateness } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    };
  }

  private async assertUnique(input: Partial<EmployeeInput>, id?: string) {
    if (input.docNumber) {
      const dup = await prisma.employee.findFirst({ where: { docNumber: input.docNumber.trim().toUpperCase(), NOT: id ? { id } : undefined } });
      if (dup) throw new BusinessError(`Ya hay un trabajador con ese DNI (${fullName(dup)}).`);
    }
    if (input.userId) {
      const dup = await prisma.employee.findFirst({ where: { userId: input.userId, NOT: id ? { id } : undefined } });
      if (dup) throw new BusinessError(`Ese usuario ya está ligado a ${fullName(dup)}.`);
    }
  }

  async create(input: EmployeeInput) {
    this.validate(input);
    await this.assertUnique(input);
    return prisma.employee.create({ data: this.data(input) as Prisma.EmployeeUncheckedCreateInput });
  }

  async update(id: string, input: Partial<EmployeeInput>) {
    const current = await prisma.employee.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Trabajador');
    const merged = {
      employmentType: current.employmentType, laborRegime: current.laborRegime, docNumber: current.docNumber,
      pensionSystem: current.pensionSystem, afpRate: current.afpRate != null ? Number(current.afpRate) : null,
      ...input,
    } as Partial<EmployeeInput>;
    this.validate(merged);
    await this.assertUnique(input, id);
    // Cambiar a informal/planilla rehace los campos de ley con los datos completos.
    return prisma.employee.update({ where: { id }, data: this.data(input.employmentType ? merged : input) });
  }

  async list(includeInactive = false) {
    const employees = await prisma.employee.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        user: { select: { id: true, username: true, workSchedule: true } },
        advances: { where: { voidedAt: null, paymentId: null }, select: { amount: true } },
        payments: {
          where: { voidedAt: null, kind: 'REGULAR' }, orderBy: { periodEnd: 'desc' }, take: 1,
          select: { periodEnd: true, netAmount: true, paidAt: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    });
    const today = todayLimaDateString();
    return employees.map((e) => {
      const last = e.payments[0];
      const next = nextPeriod(e.payFrequency, nextPeriodStart(e.payFrequency, ymd(e.startDate), last ? ymd(last.periodEnd) : null, today));
      return {
        ...e,
        salary: Number(e.salary),
        afpRate: e.afpRate != null ? Number(e.afpRate) : null,
        user: e.user ? { id: e.user.id, username: e.user.username, hasSchedule: !!parseSchedule(e.user.workSchedule) } : null,
        pendingAdvances: round2(e.advances.reduce((s, a) => s + Number(a.amount), 0)),
        advances: undefined,
        payments: undefined,
        lastPayment: last ? { periodEnd: ymd(last.periodEnd), netAmount: Number(last.netAmount), paidAt: last.paidAt } : null,
        nextPeriod: next,
        // Ya terminó el periodo que toca pagar (o termina hoy).
        payDue: e.isActive && next.to <= today,
        belowMinimumWage: e.employmentType === 'PLANILLA' && Number(e.salary) < RMV,
      };
    });
  }

  async get(id: string) {
    const e = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true, workSchedule: true } },
        advances: { orderBy: { givenAt: 'desc' }, take: 50 },
        payments: { orderBy: { paidAt: 'desc' }, take: 50 },
      },
    });
    if (!e) throw new NotFoundError('Trabajador');
    return e;
  }

  /* ── Adelantos ─────────────────────────────────────────────────────────── */

  async giveAdvance(employeeId: string, userId: string, input: { amount: number; method: string; cashSessionId?: string; notes?: string | null }) {
    const e = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw new NotFoundError('Trabajador');
    if (!e.isActive) throw new BusinessError('Este trabajador está de baja.');
    if (!(input.amount > 0)) throw new BusinessError('El monto debe ser mayor a 0.');
    return prisma.$transaction(async (tx) => {
      const expense = await treasuryService.createExpense({
        category: 'PERSONNEL', description: `Adelanto a ${fullName(e)}`, amount: input.amount,
        method: input.method, cashSessionId: input.cashSessionId, payeeName: fullName(e), payeeTaxId: e.docNumber ?? undefined,
        notes: input.notes ?? undefined, userId,
      }, tx);
      return tx.employeeAdvance.create({
        data: {
          employeeId, amount: input.amount, method: input.method as never, notes: input.notes ?? null,
          expenseId: expense.id, userId,
        },
      });
    });
  }

  async voidAdvance(id: string, userId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const adv = await tx.employeeAdvance.findUnique({ where: { id } });
      if (!adv) throw new NotFoundError('Adelanto');
      if (adv.voidedAt) throw new BusinessError('Este adelanto ya fue anulado.');
      if (adv.paymentId) throw new BusinessError('Este adelanto ya se descontó en un pago. Anula ese pago primero.');
      if (adv.expenseId) await treasuryService.voidExpense(adv.expenseId, userId, `Adelanto anulado: ${reason}`, tx);
      return tx.employeeAdvance.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    });
  }

  /* ── Pago ──────────────────────────────────────────────────────────────── */

  /** Propuesta del pago: periodo, asistencia, descuentos y adelantos. */
  async preview(employeeId: string, params: { kind?: PayrollKind; from?: string; to?: string; vacationDays?: number }) {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, workSchedule: true } } },
    });
    if (!e) throw new NotFoundError('Trabajador');
    const kind = params.kind ?? 'REGULAR';
    const calc = calcEmployee(e);
    const today = todayLimaDateString();
    const advances = await prisma.employeeAdvance.findMany({
      where: { employeeId, voidedAt: null, paymentId: null }, orderBy: { givenAt: 'asc' },
    });
    const pendingAdvances = advances.map((a) => ({ id: a.id, amount: Number(a.amount), givenAt: a.givenAt, notes: a.notes }));

    if (kind !== 'REGULAR') {
      const s = suggestBenefit(calc, kind, { startDate: ymd(e.startDate), today, vacationDays: params.vacationDays });
      const from = params.from ?? today; const to = params.to ?? today;
      const totals = computeTotals(calc, {
        kind, baseAmount: s.baseAmount, familyAllowance: 0, bonus: s.bonus, absenceDiscount: 0, lateDiscount: 0,
        advancesDeducted: 0, otherDiscount: 0,
      });
      return {
        kind, periodStart: from, periodEnd: to, attendance: null, note: s.note,
        daysScheduled: 0, daysWorked: kind === 'VACACIONES' ? params.vacationDays ?? vacationDaysPerYear(calc.laborRegime) : 0,
        lateMinutes: 0, baseAmount: s.baseAmount, familyAllowance: 0, bonus: s.bonus, absenceDiscount: 0, lateDiscount: 0,
        pendingAdvances, ...totals,
      };
    }

    let from = params.from; let to = params.to;
    if (!from || !to) {
      const last = await prisma.payrollPayment.findFirst({
        where: { employeeId, voidedAt: null, kind: 'REGULAR' }, orderBy: { periodEnd: 'desc' },
      });
      const p = nextPeriod(e.payFrequency, nextPeriodStart(e.payFrequency, ymd(e.startDate), last ? ymd(last.periodEnd) : null, today));
      from = from ?? p.from; to = to ?? p.to;
    }
    if (to < from) throw new BusinessError('El fin del periodo no puede ser antes del inicio.');

    const base = periodBase(calc);
    const family = periodFamilyAllowance(calc);
    const schedule = e.user ? parseSchedule(e.user.workSchedule) : null;
    let attendance: null | { scheduledDays: number; daysWorked: number; absences: number; lateMinutes: number; minutesPerDay: number } = null;
    let daysScheduled = 0; let daysWorked = 0; let lateMinutes = 0; let absenceDiscount = 0; let lateDiscount = 0;

    if (e.user && schedule) {
      const sched = scheduledDaysIn(schedule, from, to);
      const report = await attendanceService.report({ from, to: to < today ? to : today, userId: e.user.id });
      const mine = report.summary.find((r) => r.userId === e.user!.id);
      attendance = {
        scheduledDays: sched.days, daysWorked: mine?.daysWorked ?? 0, absences: mine?.absences ?? 0,
        lateMinutes: mine?.lateMinutes ?? 0, minutesPerDay: sched.minutesPerDay,
      };
      daysScheduled = sched.days; daysWorked = attendance.daysWorked; lateMinutes = attendance.lateMinutes;
      const d = attendanceDiscounts({
        base, scheduledDays: sched.days, absences: attendance.absences, lateMinutes: attendance.lateMinutes,
        minutesPerDay: sched.minutesPerDay, discountAbsences: e.discountAbsences, discountLateness: e.discountLateness,
      });
      absenceDiscount = d.absenceDiscount; lateDiscount = d.lateDiscount;
    }

    if (!attendance) {
      // Sin asistencia: se propone de lunes a sábado del periodo, editable.
      for (let d = from; d <= to; d = addDays(d, 1)) if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) daysWorked += 1;
    }
    const advancesDeducted = round2(pendingAdvances.reduce((s, a) => s + a.amount, 0));
    const totals = computeTotals(calc, {
      kind, baseAmount: base, familyAllowance: family, bonus: 0, absenceDiscount, lateDiscount, advancesDeducted, otherDiscount: 0,
    });
    return {
      kind, periodStart: from, periodEnd: to, attendance,
      note: e.user && schedule ? null : 'Sin horario en Asistencia: revisa los días trabajados a mano.',
      daysScheduled, daysWorked, lateMinutes, baseAmount: base, familyAllowance: family, bonus: 0,
      absenceDiscount, lateDiscount, pendingAdvances, advancesDeducted, ...totals,
    };
  }

  private async nextNumber(tx: Prisma.TransactionClient) {
    const last = await tx.payrollPayment.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const n = last ? Number(last.number.replace(/\D/g, '')) + 1 : 1;
    return `PG-${String(n).padStart(6, '0')}`;
  }

  async pay(employeeId: string, userId: string, input: PaymentInput) {
    const e = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw new NotFoundError('Trabajador');
    if (input.periodEnd < input.periodStart) throw new BusinessError('El fin del periodo no puede ser antes del inicio.');
    if (!(input.baseAmount >= 0)) throw new BusinessError('El monto base no es válido.');
    const calc = calcEmployee(e);

    if (input.kind === 'REGULAR') {
      const overlap = await prisma.payrollPayment.findFirst({
        where: {
          employeeId, voidedAt: null, kind: 'REGULAR',
          periodStart: { lte: dateOnly(input.periodEnd) }, periodEnd: { gte: dateOnly(input.periodStart) },
        },
      });
      if (overlap) throw new BusinessError(`Ese periodo ya se pagó (${overlap.number}). Anúlalo si hay que corregirlo.`);
    }

    return prisma.$transaction(async (tx) => {
      const advances = input.advanceIds?.length
        ? await tx.employeeAdvance.findMany({ where: { id: { in: input.advanceIds }, employeeId, voidedAt: null, paymentId: null } })
        : [];
      if (input.advanceIds && advances.length !== input.advanceIds.length) {
        throw new BusinessError('Algún adelanto ya se descontó o fue anulado. Vuelve a abrir el pago.');
      }
      const advancesDeducted = round2(advances.reduce((s, a) => s + Number(a.amount), 0));
      const values = {
        kind: input.kind,
        baseAmount: round2(input.baseAmount),
        familyAllowance: round2(input.familyAllowance ?? 0),
        bonus: round2(input.bonus ?? 0),
        absenceDiscount: round2(input.absenceDiscount ?? 0),
        lateDiscount: round2(input.lateDiscount ?? 0),
        advancesDeducted,
        otherDiscount: round2(input.otherDiscount ?? 0),
      };
      const totals = computeTotals(calc, values);
      if (totals.grossAmount <= 0) throw new BusinessError('El pago queda en cero o negativo. Revisa los descuentos.');
      if (totals.netAmount < 0) {
        throw new BusinessError(`Los adelantos y descuentos (S/ ${(advancesDeducted + values.otherDiscount).toFixed(2)}) superan lo que le toca. Quita algún adelanto para descontarlo en el siguiente pago.`);
      }

      const number = await this.nextNumber(tx);
      const name = fullName(e);
      const label = `${KIND_LABEL[input.kind]} ${name} (${input.periodStart === input.periodEnd ? input.periodStart : `${input.periodStart} al ${input.periodEnd}`})`;
      const period = input.periodEnd.slice(0, 7);

      const netExpense = totals.netAmount > 0
        ? await treasuryService.createExpense({
          category: 'PERSONNEL', description: `${label} ${number}`, amount: totals.netAmount, method: input.method,
          cashSessionId: input.cashSessionId, payeeName: name, payeeTaxId: e.docNumber ?? undefined, period, userId,
        }, tx)
        : null;
      // Lo retenido para ONP/AFP y el aporte de salud se pagan después (PLAME):
      // quedan como gastos por pagar del mismo mes.
      const pensionExpense = totals.pensionDiscount > 0
        ? await treasuryService.createExpense({
          category: 'PERSONNEL', description: `${e.pensionSystem === 'AFP' ? `AFP ${e.afpName ?? ''}`.trim() : 'ONP'} retenido a ${name} ${number}`,
          amount: totals.pensionDiscount, isPending: true, payeeName: e.pensionSystem === 'AFP' ? e.afpName ?? 'AFP' : 'SUNAT (ONP)',
          period, userId,
        }, tx)
        : null;
      const healthExpense = totals.employerHealth > 0
        ? await treasuryService.createExpense({
          category: 'PERSONNEL', description: `${e.laborRegime === 'GENERAL' ? 'EsSalud' : 'SIS'} de ${name} ${number}`,
          amount: totals.employerHealth, isPending: true, payeeName: e.laborRegime === 'GENERAL' ? 'SUNAT (EsSalud)' : 'SIS',
          period, userId,
        }, tx)
        : null;

      const payment = await tx.payrollPayment.create({
        data: {
          number, employeeId, kind: input.kind,
          periodStart: dateOnly(input.periodStart), periodEnd: dateOnly(input.periodEnd),
          employmentType: e.employmentType, laborRegime: e.laborRegime,
          daysScheduled: input.daysScheduled ?? 0, daysWorked: input.daysWorked ?? 0, lateMinutes: input.lateMinutes ?? 0,
          baseAmount: values.baseAmount, familyAllowance: values.familyAllowance, bonus: values.bonus,
          absenceDiscount: values.absenceDiscount, lateDiscount: values.lateDiscount,
          grossAmount: totals.grossAmount, pensionSystem: totals.pensionRate > 0 ? e.pensionSystem : 'NONE',
          pensionRate: totals.pensionRate, pensionDiscount: totals.pensionDiscount,
          advancesDeducted, otherDiscount: values.otherDiscount, otherDiscountNote: input.otherDiscountNote ?? null,
          netAmount: totals.netAmount, employerHealth: totals.employerHealth,
          method: input.method as never,
          expenseId: netExpense?.id ?? null, pensionExpenseId: pensionExpense?.id ?? null, healthExpenseId: healthExpense?.id ?? null,
          notes: input.notes ?? null, userId,
        },
      });
      if (advances.length) {
        await tx.employeeAdvance.updateMany({ where: { id: { in: advances.map((a) => a.id) } }, data: { paymentId: payment.id } });
      }
      return payment;
    });
  }

  async voidPayment(id: string, userId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const p = await tx.payrollPayment.findUnique({ where: { id } });
      if (!p) throw new NotFoundError('Pago');
      if (p.voidedAt) throw new BusinessError('Este pago ya fue anulado.');
      for (const expenseId of [p.expenseId, p.pensionExpenseId, p.healthExpenseId]) {
        if (!expenseId) continue;
        const exp = await tx.expense.findUnique({ where: { id: expenseId } });
        if (exp && !exp.voidedAt) await treasuryService.voidExpense(expenseId, userId, `Pago ${p.number} anulado: ${reason}`, tx);
      }
      // Los adelantos vuelven a quedar pendientes para el siguiente pago.
      await tx.employeeAdvance.updateMany({ where: { paymentId: id }, data: { paymentId: null } });
      return tx.payrollPayment.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    });
  }

  async listPayments(filters: { employeeId?: string; from?: string; to?: string }) {
    const rows = await prisma.payrollPayment.findMany({
      where: {
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.from || filters.to ? { paidAt: {
          ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00-05:00`) } : {}),
          ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999-05:00`) } : {}),
        } } : {}),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { paidAt: 'desc' },
      take: 200,
    });
    return rows;
  }

  async getPayment(id: string) {
    const p = await prisma.payrollPayment.findUnique({
      where: { id },
      include: {
        employee: true,
        advances: { select: { id: true, amount: true, givenAt: true, notes: true } },
      },
    });
    if (!p) throw new NotFoundError('Pago');
    return p;
  }

  /** Vacaciones ganadas y tomadas, y lo que va acumulando de gratificación y CTS. */
  async benefits(employeeId: string) {
    const e = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw new NotFoundError('Trabajador');
    if (e.employmentType !== 'PLANILLA') return { applies: false };
    const calc = calcEmployee(e);
    const today = todayLimaDateString();
    const start = ymd(e.startDate);
    const vacationsPaid = await prisma.payrollPayment.aggregate({
      where: { employeeId, voidedAt: null, kind: 'VACACIONES' }, _sum: { daysWorked: true },
    });
    const earned = vacationDaysEarned(calc.laborRegime, start, today);
    const taken = Number(vacationsPaid._sum.daysWorked ?? 0);
    return {
      applies: true,
      regime: e.laborRegime,
      vacation: { perYear: vacationDaysPerYear(calc.laborRegime), earned, taken, available: Math.round((earned - taken) * 10) / 10 },
      gratificacion: suggestBenefit(calc, 'GRATIFICACION', { startDate: start, today }),
      cts: suggestBenefit(calc, 'CTS', { startDate: start, today }),
    };
  }
}

export const staffService = new StaffService();
