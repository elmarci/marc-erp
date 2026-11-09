import { AttendanceRecord, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';

// ─── Horario ────────────────────────────────────────────────────────────────
// Perú es UTC-5 todo el año (sin horario de verano), así que la hora de Lima se
// obtiene restando 5 h — igual que en utils/timezone, sin depender del TZ del
// proceso Node (Railway corre en UTC).
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

export const dayScheduleSchema = z.object({
  start: hhmm,
  end: hhmm,
  lunchStart: hhmm.optional().nullable(),
  lunchEnd: hhmm.optional().nullable(),
}).refine((d) => toMinutes(d.end) > toMinutes(d.start), { message: 'La salida debe ser después del ingreso' })
  .refine((d) => (!d.lunchStart && !d.lunchEnd) || (!!d.lunchStart && !!d.lunchEnd && toMinutes(d.lunchEnd) > toMinutes(d.lunchStart)), {
    message: 'El almuerzo necesita inicio y fin válidos',
  });

export const workScheduleSchema = z.object({
  toleranceMinutes: z.coerce.number().int().min(0).max(60).default(5),
  // "1" = lunes … "7" = domingo. Un día ausente = día libre.
  days: z.record(z.enum(['1', '2', '3', '4', '5', '6', '7']), dayScheduleSchema),
});

export type WorkSchedule = z.infer<typeof workScheduleSchema>;
export type DaySchedule = z.infer<typeof dayScheduleSchema>;

export const MARK_TYPES = ['CHECK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'CHECK_OUT'] as const;
export type MarkType = (typeof MARK_TYPES)[number];

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function limaParts(date: Date) {
  const d = new Date(date.getTime() - LIMA_OFFSET_MS);
  const workDate = d.toISOString().slice(0, 10);
  const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1 = lunes … 7 = domingo
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { workDate, weekday, minutes };
}

function weekdayOf(workDate: string): number {
  const day = new Date(`${workDate}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** "2026-11-09" + "07:30" (hora de Lima) → Date en UTC. */
function limaDateTime(workDate: string, time: string): Date {
  return new Date(`${workDate}T${time}:00-05:00`);
}

export function parseSchedule(raw: Prisma.JsonValue | null | undefined): WorkSchedule | null {
  if (!raw) return null;
  const parsed = workScheduleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function scheduleFor(schedule: WorkSchedule | null, workDate: string): DaySchedule | null {
  if (!schedule) return null;
  return schedule.days[String(weekdayOf(workDate)) as keyof WorkSchedule['days']] ?? null;
}

// ─── Cálculos ───────────────────────────────────────────────────────────────
type Times = Pick<AttendanceRecord, 'checkInAt' | 'lunchOutAt' | 'lunchInAt' | 'checkOutAt'>;
type Planned = Pick<AttendanceRecord, 'scheduledStart' | 'scheduledEnd' | 'scheduledLunchStart' | 'scheduledLunchEnd'>;

/**
 * Minutos de tardanza (sin restar la tolerancia: la tolerancia solo decide si
 * se marca como "Tardanza"), de almuerzo extendido y de salida anticipada.
 * El almuerzo se mide por duración: si sale 13:40 y vuelve 14:40 no hay exceso.
 */
function computeMinutes(t: Times, p: Planned) {
  const mins = (d: Date | null) => (d ? limaParts(d).minutes : null);
  const inMin = mins(t.checkInAt);
  const outMin = mins(t.checkOutAt);
  const lateMinutes = p.scheduledStart && inMin !== null ? Math.max(0, inMin - toMinutes(p.scheduledStart)) : 0;
  const earlyLeaveMinutes = p.scheduledEnd && outMin !== null ? Math.max(0, toMinutes(p.scheduledEnd) - outMin) : 0;
  let lunchLateMinutes = 0;
  if (p.scheduledLunchStart && p.scheduledLunchEnd && t.lunchOutAt && t.lunchInAt) {
    const allowed = toMinutes(p.scheduledLunchEnd) - toMinutes(p.scheduledLunchStart);
    const taken = Math.round((t.lunchInAt.getTime() - t.lunchOutAt.getTime()) / 60000);
    lunchLateMinutes = Math.max(0, taken - allowed);
  }
  return { lateMinutes, lunchLateMinutes, earlyLeaveMinutes };
}

function workedMinutes(t: Times): number | null {
  if (!t.checkInAt || !t.checkOutAt) return null;
  let ms = t.checkOutAt.getTime() - t.checkInAt.getTime();
  if (t.lunchOutAt && t.lunchInAt) ms -= t.lunchInAt.getTime() - t.lunchOutAt.getTime();
  return Math.max(0, Math.round(ms / 60000));
}

function nextAction(record: Times | null, day: DaySchedule | null): MarkType | null {
  if (!record?.checkInAt) return 'CHECK_IN';
  if (record.checkOutAt) return null;
  const hasLunch = !!(day?.lunchStart && day?.lunchEnd);
  if (record.lunchOutAt && !record.lunchInAt) return 'LUNCH_IN';
  if (hasLunch && !record.lunchOutAt) return 'LUNCH_OUT';
  return 'CHECK_OUT';
}

function decorate<T extends AttendanceRecord>(r: T) {
  return {
    ...r,
    workedMinutes: workedMinutes(r),
    isLate: !!r.checkInAt && r.lateMinutes > r.toleranceMinutes,
  };
}

const userSelect = { id: true, firstName: true, lastName: true, username: true, role: true } as const;

// ─── Servicio ───────────────────────────────────────────────────────────────
export class AttendanceService {
  /** Estado del día para quien está logueado: horario, marcas y siguiente acción. */
  async getMine(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { workSchedule: true } });
    if (!user) throw new NotFoundError('Usuario');
    const schedule = parseSchedule(user.workSchedule);
    const { workDate } = limaParts(new Date());
    const day = scheduleFor(schedule, workDate);

    const today = await prisma.attendanceRecord.findUnique({ where: { userId_workDate: { userId, workDate } } });
    const history = await prisma.attendanceRecord.findMany({
      where: { userId },
      orderBy: { workDate: 'desc' },
      take: 31,
    });

    return {
      workDate,
      schedule,
      todaySchedule: day,
      today: today ? decorate(today) : null,
      nextAction: nextAction(today, day),
      history: history.map(decorate),
    };
  }

  async mark(userId: string, type: MarkType, ip?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { workSchedule: true } });
    if (!user) throw new NotFoundError('Usuario');
    const now = new Date();
    const { workDate } = limaParts(now);
    const schedule = parseSchedule(user.workSchedule);
    const day = scheduleFor(schedule, workDate);

    const existing = await prisma.attendanceRecord.findUnique({ where: { userId_workDate: { userId, workDate } } });

    if (type === 'CHECK_IN') {
      if (existing?.checkInAt) throw new BusinessError('Ya marcaste tu ingreso hoy.');
      const planned: Planned = {
        scheduledStart: day?.start ?? null,
        scheduledEnd: day?.end ?? null,
        scheduledLunchStart: day?.lunchStart ?? null,
        scheduledLunchEnd: day?.lunchEnd ?? null,
      };
      const times: Times = { checkInAt: now, lunchOutAt: null, lunchInAt: null, checkOutAt: null };
      const data = {
        ...planned,
        ...times,
        ...computeMinutes(times, planned),
        toleranceMinutes: schedule?.toleranceMinutes ?? 0,
        checkInIp: ip ?? null,
      };
      try {
        const rec = existing
          ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
          : await prisma.attendanceRecord.create({ data: { userId, workDate, ...data } });
        return decorate(rec);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BusinessError('Ya marcaste tu ingreso hoy.');
        }
        throw err;
      }
    }

    if (!existing?.checkInAt) throw new BusinessError('Primero marca tu ingreso.');
    if (existing.checkOutAt) throw new BusinessError('Ya marcaste tu salida hoy.');

    const times: Times = {
      checkInAt: existing.checkInAt,
      lunchOutAt: existing.lunchOutAt,
      lunchInAt: existing.lunchInAt,
      checkOutAt: existing.checkOutAt,
    };
    if (type === 'LUNCH_OUT') {
      if (existing.lunchOutAt) throw new BusinessError('Ya marcaste tu salida a almuerzo.');
      times.lunchOutAt = now;
    } else if (type === 'LUNCH_IN') {
      if (!existing.lunchOutAt) throw new BusinessError('Primero marca tu salida a almuerzo.');
      if (existing.lunchInAt) throw new BusinessError('Ya marcaste tu regreso de almuerzo.');
      times.lunchInAt = now;
    } else {
      if (existing.lunchOutAt && !existing.lunchInAt) throw new BusinessError('Primero marca tu regreso de almuerzo.');
      times.checkOutAt = now;
    }

    const rec = await prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { ...times, ...computeMinutes(times, existing) },
    });
    return decorate(rec);
  }

  /**
   * Reporte para administración: registros del rango + faltas (días con
   * horario sin marcación) + resumen por persona.
   */
  async report(params: { from: string; to: string; userId?: string }) {
    const { from, to, userId } = params;
    const users = await prisma.user.findMany({
      where: { deletedAt: null, ...(userId ? { id: userId } : {}) },
      select: { ...userSelect, status: true, workSchedule: true, createdAt: true },
      orderBy: { firstName: 'asc' },
    });
    const records = await prisma.attendanceRecord.findMany({
      where: { workDate: { gte: from, lte: to }, ...(userId ? { userId } : {}) },
      include: { user: { select: userSelect } },
      orderBy: [{ workDate: 'desc' }, { checkInAt: 'asc' }],
    });

    const now = limaParts(new Date());
    const byKey = new Set(records.map((r) => `${r.userId}|${r.workDate}`));
    const absenceRows: { userId: string; workDate: string; scheduledStart: string; scheduledEnd: string; pending: boolean; user: { id: string; firstName: string; lastName: string; username: string; role: string } }[] = [];

    for (const u of users) {
      const schedule = parseSchedule(u.workSchedule);
      if (!schedule || u.status !== 'ACTIVE') continue;
      const since = limaParts(u.createdAt).workDate;
      for (let d = from; d <= to && d <= now.workDate; d = addDays(d, 1)) {
        if (d < since || byKey.has(`${u.id}|${d}`)) continue;
        const day = scheduleFor(schedule, d);
        if (!day) continue;
        // Hoy: aún no es falta si no pasó la hora de ingreso + tolerancia.
        const pending = d === now.workDate;
        if (pending && now.minutes <= toMinutes(day.start) + schedule.toleranceMinutes) continue;
        absenceRows.push({
          userId: u.id,
          workDate: d,
          scheduledStart: day.start,
          scheduledEnd: day.end,
          pending,
          user: { id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, role: u.role },
        });
      }
    }

    const decorated = records.map(decorate);
    const summary = users
      .filter((u) => parseSchedule(u.workSchedule) || decorated.some((r) => r.userId === u.id))
      .map((u) => {
        const mine = decorated.filter((r) => r.userId === u.id);
        return {
          userId: u.id,
          name: `${u.firstName} ${u.lastName}`,
          daysWorked: mine.filter((r) => r.checkInAt).length,
          lateDays: mine.filter((r) => r.isLate).length,
          lateMinutes: mine.filter((r) => r.isLate).reduce((s, r) => s + r.lateMinutes, 0),
          lunchExtraMinutes: mine.reduce((s, r) => s + r.lunchLateMinutes, 0),
          earlyLeaveMinutes: mine.reduce((s, r) => s + r.earlyLeaveMinutes, 0),
          absences: absenceRows.filter((a) => a.userId === u.id && !a.pending).length,
          missingCheckOut: mine.filter((r) => r.checkInAt && !r.checkOutAt && r.workDate < now.workDate).length,
          workedMinutes: mine.reduce((s, r) => s + (r.workedMinutes ?? 0), 0),
        };
      });

    return {
      records: decorated,
      absences: absenceRows,
      summary,
      users: users.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, hasSchedule: !!parseSchedule(u.workSchedule) })),
    };
  }

  /**
   * Corrección manual por administración (olvidó marcar, marcó tarde por falla,
   * etc.). Crea el registro si no existía. Las horas son "HH:MM" de Lima; null borra.
   */
  async upsertDay(input: {
    userId: string;
    workDate: string;
    checkIn?: string | null;
    lunchOut?: string | null;
    lunchIn?: string | null;
    checkOut?: string | null;
    note?: string | null;
    editedById: string;
  }) {
    const user = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null }, select: { workSchedule: true } });
    if (!user) throw new NotFoundError('Usuario');
    const existing = await prisma.attendanceRecord.findUnique({
      where: { userId_workDate: { userId: input.userId, workDate: input.workDate } },
    });
    const schedule = parseSchedule(user.workSchedule);
    const day = scheduleFor(schedule, input.workDate);

    const toDate = (v: string | null | undefined, current: Date | null) =>
      v === undefined ? current : v === null ? null : limaDateTime(input.workDate, v);
    const times: Times = {
      checkInAt: toDate(input.checkIn, existing?.checkInAt ?? null),
      lunchOutAt: toDate(input.lunchOut, existing?.lunchOutAt ?? null),
      lunchInAt: toDate(input.lunchIn, existing?.lunchInAt ?? null),
      checkOutAt: toDate(input.checkOut, existing?.checkOutAt ?? null),
    };
    const order = [times.checkInAt, times.lunchOutAt, times.lunchInAt, times.checkOutAt].filter(Boolean) as Date[];
    for (let i = 1; i < order.length; i++) {
      if (order[i] <= order[i - 1]) throw new BusinessError('Las horas deben ir en orden: ingreso, almuerzo, regreso, salida.');
    }
    if (!times.checkInAt && (times.lunchOutAt || times.lunchInAt || times.checkOutAt)) {
      throw new BusinessError('Falta la hora de ingreso.');
    }
    if (times.lunchInAt && !times.lunchOutAt) throw new BusinessError('Falta la hora de salida a almuerzo.');

    const planned: Planned = existing ?? {
      scheduledStart: day?.start ?? null,
      scheduledEnd: day?.end ?? null,
      scheduledLunchStart: day?.lunchStart ?? null,
      scheduledLunchEnd: day?.lunchEnd ?? null,
    };
    const data = {
      ...times,
      ...computeMinutes(times, planned),
      ...(input.note !== undefined ? { note: input.note } : {}),
      editedById: input.editedById,
    };
    const rec = existing
      ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
      : await prisma.attendanceRecord.create({
          data: {
            userId: input.userId,
            workDate: input.workDate,
            scheduledStart: planned.scheduledStart,
            scheduledEnd: planned.scheduledEnd,
            scheduledLunchStart: planned.scheduledLunchStart,
            scheduledLunchEnd: planned.scheduledLunchEnd,
            toleranceMinutes: schedule?.toleranceMinutes ?? 0,
            ...data,
          },
        });
    return decorate(rec);
  }
}

function addDays(workDate: string, n: number): string {
  const d = new Date(`${workDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const attendanceService = new AttendanceService();
