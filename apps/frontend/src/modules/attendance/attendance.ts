import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/services/api';

export type MarkType = 'CHECK_IN' | 'LUNCH_OUT' | 'LUNCH_IN' | 'CHECK_OUT';

export interface DaySchedule { start: string; end: string; lunchStart?: string | null; lunchEnd?: string | null }
export interface WorkSchedule { toleranceMinutes: number; days: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', DaySchedule>> }

export interface AttendanceRecord {
  id: string;
  userId: string;
  workDate: string;
  checkInAt: string | null;
  lunchOutAt: string | null;
  lunchInAt: string | null;
  checkOutAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledLunchStart: string | null;
  scheduledLunchEnd: string | null;
  toleranceMinutes: number;
  lateMinutes: number;
  lunchLateMinutes: number;
  earlyLeaveMinutes: number;
  note: string | null;
  editedById: string | null;
  workedMinutes: number | null;
  isLate: boolean;
  user?: { id: string; firstName: string; lastName: string; username: string };
}

export interface MyAttendance {
  workDate: string;
  schedule: WorkSchedule | null;
  todaySchedule: DaySchedule | null;
  today: AttendanceRecord | null;
  nextAction: MarkType | null;
  history: AttendanceRecord[];
}

export const MARK_LABELS: Record<MarkType, string> = {
  CHECK_IN: 'Marcar ingreso',
  LUNCH_OUT: 'Salir a almorzar',
  LUNCH_IN: 'Regresar de almuerzo',
  CHECK_OUT: 'Marcar salida',
};

export const MARK_DONE: Record<MarkType, string> = {
  CHECK_IN: 'Ingreso marcado',
  LUNCH_OUT: 'Salida a almuerzo marcada',
  LUNCH_IN: 'Regreso de almuerzo marcado',
  CHECK_OUT: 'Salida marcada',
};

export const WEEKDAYS: { key: keyof WorkSchedule['days']; short: string; long: string }[] = [
  { key: '1', short: 'Lun', long: 'Lunes' },
  { key: '2', short: 'Mar', long: 'Martes' },
  { key: '3', short: 'Mié', long: 'Miércoles' },
  { key: '4', short: 'Jue', long: 'Jueves' },
  { key: '5', short: 'Vie', long: 'Viernes' },
  { key: '6', short: 'Sáb', long: 'Sábado' },
  { key: '7', short: 'Dom', long: 'Domingo' },
];

const timeFmt = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });

/** Hora "HH:MM" en Lima de una marca. */
export function limaTime(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : '—';
}

/** "2026-11-09" → "lun 09/11" */
export function shortDay(workDate: string): string {
  const d = new Date(`${workDate}T12:00:00Z`);
  const wd = WEEKDAYS[(d.getUTCDay() + 6) % 7].short.toLowerCase();
  return `${wd} ${workDate.slice(8, 10)}/${workDate.slice(5, 7)}`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}

export function scheduleLabel(day: DaySchedule | null | undefined): string {
  if (!day) return 'Día libre';
  const lunch = day.lunchStart && day.lunchEnd ? ` · almuerzo ${day.lunchStart}–${day.lunchEnd}` : '';
  return `${day.start}–${day.end}${lunch}`;
}

export function useMyAttendance(enabled = true) {
  return useQuery({
    queryKey: ['attendance-me'],
    queryFn: async () => (await api.get<{ data: MyAttendance }>('/attendance/me')).data.data,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type: MarkType) => (await api.post<{ data: AttendanceRecord }>('/attendance/mark', { type })).data.data,
    onSuccess: (rec, type) => {
      const at = limaTime(
        type === 'CHECK_IN' ? rec.checkInAt : type === 'LUNCH_OUT' ? rec.lunchOutAt : type === 'LUNCH_IN' ? rec.lunchInAt : rec.checkOutAt,
      );
      if (type === 'CHECK_IN' && rec.isLate) toast.warning(`${MARK_DONE[type]} a las ${at} (tardanza de ${formatMinutes(rec.lateMinutes)}).`);
      else toast.success(`${MARK_DONE[type]} a las ${at}.`);
      qc.invalidateQueries({ queryKey: ['attendance-me'] });
      qc.invalidateQueries({ queryKey: ['attendance-report'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
