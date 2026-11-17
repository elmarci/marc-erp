// Cálculos de planilla sin base de datos, para poder probarlos.
//
// Valores de ley vigentes (Perú). Si cambian, se actualizan aquí:
// - RMV (remuneración mínima vital): S/ 1,130 desde enero de 2025.
// - Asignación familiar: 10% de la RMV al mes.
// - ONP: 13% de la remuneración.
// - EsSalud (régimen general): 9% de la remuneración, mínimo sobre la RMV.
// - SIS microempresa: S/ 15 al mes por trabajador, lo paga el empleador.
// - Gratificación (julio y diciembre, solo régimen general): un sueldo por
//   semestre completo, más la bonificación extraordinaria de 9% (Ley 30334).
// - CTS (mayo y noviembre, solo régimen general): (sueldo + 1/6 de la
//   gratificación) / 12 por cada mes del semestre.
// - Vacaciones: 30 días al año en régimen general, 15 en microempresa.
// Los montos son una guía para pagar; la declaración (PLAME) la hace el contador.

export const RMV = 1130;
export const FAMILY_ALLOWANCE = Math.round(RMV * 0.1 * 100) / 100;
export const ONP_RATE = 13;
export const ESSALUD_RATE = 9;
export const SIS_MICRO_MONTHLY = 15;
export const GRATI_BONUS_RATE = 9;

export type EmploymentType = 'INFORMAL' | 'PLANILLA';
export type LaborRegime = 'MICRO' | 'GENERAL';
export type PayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type PensionSystem = 'NONE' | 'ONP' | 'AFP';
export type PayrollKind = 'REGULAR' | 'GRATIFICACION' | 'CTS' | 'VACACIONES' | 'LIQUIDACION';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Parte del mes que cubre cada pago. */
export function monthFraction(freq: PayFrequency): number {
  if (freq === 'MONTHLY') return 1;
  if (freq === 'BIWEEKLY') return 0.5;
  return 7 / 30;
}

export function vacationDaysPerYear(regime: LaborRegime | null | undefined): number {
  return regime === 'GENERAL' ? 30 : 15;
}

export interface CalcEmployee {
  employmentType: EmploymentType;
  laborRegime: LaborRegime | null;
  payFrequency: PayFrequency;
  /** Informal: lo que gana por pago. Planilla: sueldo mensual. */
  salary: number;
  pensionSystem: PensionSystem;
  afpRate: number | null;
  familyAllowance: boolean;
}

/** Sueldo base de un pago regular (antes de faltas y tardanzas). */
export function periodBase(e: CalcEmployee): number {
  return e.employmentType === 'PLANILLA' ? round2(e.salary * monthFraction(e.payFrequency)) : round2(e.salary);
}

/** Asignación familiar del pago (solo planilla). */
export function periodFamilyAllowance(e: CalcEmployee, kind: PayrollKind = 'REGULAR'): number {
  if (e.employmentType !== 'PLANILLA' || !e.familyAllowance) return 0;
  if (kind !== 'REGULAR') return 0;
  return round2(FAMILY_ALLOWANCE * monthFraction(e.payFrequency));
}

/** % de pensión que se descuenta en este tipo de pago. */
export function pensionRateFor(e: CalcEmployee, kind: PayrollKind): number {
  if (e.employmentType !== 'PLANILLA') return 0;
  if (kind === 'CTS' || kind === 'LIQUIDACION') return 0;
  if (e.pensionSystem === 'ONP') return ONP_RATE;
  if (e.pensionSystem === 'AFP') return e.afpRate ?? 0;
  return 0;
}

/** Lo que paga el negocio por salud, aparte del sueldo. */
export function employerHealthFor(e: CalcEmployee, kind: PayrollKind, gross: number): number {
  if (e.employmentType !== 'PLANILLA') return 0;
  if (kind === 'CTS' || kind === 'LIQUIDACION' || kind === 'GRATIFICACION') return 0;
  if (e.laborRegime === 'GENERAL') {
    const minBase = kind === 'REGULAR' ? RMV * monthFraction(e.payFrequency) : 0;
    return round2(Math.max(gross, minBase) * ESSALUD_RATE / 100);
  }
  return kind === 'REGULAR' ? round2(SIS_MICRO_MONTHLY * monthFraction(e.payFrequency)) : 0;
}

export interface PayrollInput {
  kind: PayrollKind;
  baseAmount: number;
  familyAllowance: number;
  bonus: number;
  absenceDiscount: number;
  lateDiscount: number;
  advancesDeducted: number;
  otherDiscount: number;
}

export interface PayrollTotals {
  grossAmount: number;
  pensionRate: number;
  pensionDiscount: number;
  netAmount: number;
  employerHealth: number;
}

export function computeTotals(e: CalcEmployee, input: PayrollInput): PayrollTotals {
  const grossAmount = round2(input.baseAmount + input.familyAllowance + input.bonus - input.absenceDiscount - input.lateDiscount);
  const pensionRate = pensionRateFor(e, input.kind);
  const pensionDiscount = round2(Math.max(grossAmount, 0) * pensionRate / 100);
  const netAmount = round2(grossAmount - pensionDiscount - input.advancesDeducted - input.otherDiscount);
  return { grossAmount, pensionRate, pensionDiscount, netAmount, employerHealth: employerHealthFor(e, input.kind, grossAmount) };
}

/** Descuento por faltas y tardanzas a partir de los días del periodo. */
export function attendanceDiscounts(params: {
  base: number; scheduledDays: number; absences: number; lateMinutes: number;
  minutesPerDay: number; discountAbsences: boolean; discountLateness: boolean;
}) {
  const dayValue = params.scheduledDays > 0 ? params.base / params.scheduledDays : 0;
  const absenceDiscount = params.discountAbsences ? round2(dayValue * params.absences) : 0;
  const minuteValue = params.minutesPerDay > 0 ? dayValue / params.minutesPerDay : 0;
  const lateDiscount = params.discountLateness ? round2(minuteValue * params.lateMinutes) : 0;
  return { dayValue: round2(dayValue), absenceDiscount, lateDiscount };
}

/** Meses completos entre `from` (incluido) y `to` (excluido), "YYYY-MM-DD". */
export function fullMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

/**
 * Monto sugerido para gratificación, CTS o vacaciones. `today` y `startDate`
 * son días de calendario en Lima.
 */
export function suggestBenefit(e: CalcEmployee, kind: PayrollKind, params: { startDate: string; today: string; vacationDays?: number }) {
  if (e.employmentType !== 'PLANILLA') return { baseAmount: 0, bonus: 0, months: 0, note: 'Solo para trabajadores en planilla.' };
  const monthly = e.salary + (e.familyAllowance ? FAMILY_ALLOWANCE : 0);
  const [y, m] = params.today.split('-').map(Number);

  if (kind === 'VACACIONES') {
    const days = params.vacationDays ?? vacationDaysPerYear(e.laborRegime);
    return { baseAmount: round2(monthly / 30 * days), bonus: 0, months: 0, note: `${days} días de vacaciones.` };
  }
  if (e.laborRegime !== 'GENERAL') {
    return { baseAmount: 0, bonus: 0, months: 0, note: 'En microempresa no corresponde gratificación ni CTS.' };
  }
  if (kind === 'GRATIFICACION') {
    // Julio paga enero-junio y diciembre paga julio-diciembre (el semestre
    // completo). Otro mes: lo acumulado del semestre en curso hasta hoy.
    const first = m <= 7;
    const semStart = first ? `${y}-01-01` : `${y}-07-01`;
    const semEnd = first ? `${y}-06-30` : `${y}-12-31`;
    const payMonth = m === 7 || m === 12;
    const months = monthsInPeriod(params.startDate, semStart, payMonth || params.today > semEnd ? semEnd : params.today);
    const baseAmount = round2(monthly / 6 * months);
    return { baseAmount, bonus: round2(baseAmount * GRATI_BONUS_RATE / 100), months, note: `${months} de 6 meses del semestre, más 9% de bonificación extraordinaria.` };
  }
  if (kind === 'CTS') {
    // Mayo deposita noviembre-abril; noviembre deposita mayo-octubre.
    // Otro mes: lo acumulado del periodo en curso hasta hoy.
    let semStart: string; let semEnd: string;
    if (m === 5 || (m >= 1 && m <= 4)) { semStart = `${y - 1}-11-01`; semEnd = `${y}-04-30`; }
    else if (m === 11 || (m >= 6 && m <= 10)) { semStart = `${y}-05-01`; semEnd = `${y}-10-31`; }
    else { semStart = `${y}-11-01`; semEnd = `${y + 1}-04-30`; }
    const payMonth = m === 5 || m === 11;
    const months = monthsInPeriod(params.startDate, semStart, payMonth ? semEnd : params.today);
    const computable = monthly + monthly / 6; // sueldo + 1/6 de la gratificación
    return { baseAmount: round2(computable / 12 * months), bonus: 0, months, note: `${months} de 6 meses del periodo de CTS.` };
  }
  return { baseAmount: 0, bonus: 0, months: 0, note: 'Escribe el monto que te indique tu contador.' };
}

function monthsInPeriod(startDate: string, periodStart: string, until: string): number {
  const from = startDate > periodStart ? startDate : periodStart;
  return Math.min(6, fullMonthsBetween(from, addOneDay(until)));
}

function addOneDay(d: string): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** Días de vacaciones ganados según meses de servicio (1/12 por mes). */
export function vacationDaysEarned(regime: LaborRegime | null, startDate: string, today: string): number {
  const months = fullMonthsBetween(startDate, addOneDay(today));
  return Math.round(vacationDaysPerYear(regime) / 12 * months * 10) / 10;
}

export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function lastDayOfMonth(d: string): string {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Periodo de pago que sigue: semana, quincena (1-15 / 16-fin) o mes. */
export function nextPeriod(freq: PayFrequency, start: string): { from: string; to: string } {
  if (freq === 'WEEKLY') return { from: start, to: addDays(start, 6) };
  const [y, m, d] = start.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  if (freq === 'MONTHLY') return { from: start, to: lastDayOfMonth(start) };
  return d <= 15 ? { from: start, to: `${y}-${mm}-15` } : { from: start, to: lastDayOfMonth(start) };
}

/**
 * Dónde empieza el siguiente pago: el día después del último pagado o, si
 * aún no hay pagos, el periodo de hoy (o el ingreso, si es más reciente).
 */
export function nextPeriodStart(freq: PayFrequency, startDate: string, lastPaidEnd: string | null, today: string): string {
  if (lastPaidEnd) return addDays(lastPaidEnd, 1);
  const startOf = (d: string) => {
    if (freq === 'MONTHLY') return `${d.slice(0, 8)}01`;
    if (freq === 'BIWEEKLY') return Number(d.slice(8)) <= 15 ? `${d.slice(0, 8)}01` : `${d.slice(0, 8)}16`;
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay() || 7; // semana de lunes a domingo
    return addDays(d, 1 - wd);
  };
  const current = startOf(today);
  // Si el periodo anterior terminó hace una semana o menos, lo más probable
  // es que sea el que falta pagar.
  const previous = startOf(addDays(current, -1));
  const candidate = addDays(current, -1) >= addDays(today, -7) ? previous : current;
  if (startDate > candidate) return startDate;
  return candidate;
}

