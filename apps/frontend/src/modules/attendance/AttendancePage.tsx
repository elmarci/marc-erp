import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Coffee, LogIn, LogOut, Pencil, X, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { cn, todayLimaDateString } from '@/lib/utils';
import {
  AttendanceRecord, MARK_LABELS, MarkType, formatMinutes, limaTime, scheduleLabel, shortDay,
  useMarkAttendance, useMyAttendance,
} from './attendance';

const MARK_ICONS: Record<MarkType, typeof LogIn> = { CHECK_IN: LogIn, LUNCH_OUT: Coffee, LUNCH_IN: Coffee, CHECK_OUT: LogOut };

export function AttendancePage() {
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole('SUPER_ADMIN', 'ADMIN');
  const { data: mine } = useMyAttendance();
  const showMine = !!mine && (!isAdmin || !!mine.schedule || !!mine.today);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Asistencia</h1>
      {showMine && <MyAttendanceCard />}
      {isAdmin && <StaffAttendance />}
    </div>
  );
}

// ─── Marcación propia ───────────────────────────────────────────────────────
function MyAttendanceCard() {
  const { data } = useMyAttendance();
  const mark = useMarkAttendance();
  if (!data) return null;
  const { today, todaySchedule, nextAction } = data;
  const hasLunch = !!(todaySchedule?.lunchStart && todaySchedule?.lunchEnd);

  const slots: { label: string; value: string | null; extra?: string }[] = [
    { label: 'Ingreso', value: today?.checkInAt ?? null, extra: today?.isLate ? `+${today.lateMinutes} min tarde` : undefined },
    ...(hasLunch || today?.lunchOutAt
      ? [
          { label: 'Sale a almorzar', value: today?.lunchOutAt ?? null },
          { label: 'Regresa', value: today?.lunchInAt ?? null, extra: today?.lunchLateMinutes ? `+${today.lunchLateMinutes} min` : undefined },
        ]
      : []),
    { label: 'Salida', value: today?.checkOutAt ?? null },
  ];

  const confirmMark = (type: MarkType) => {
    if (type === 'CHECK_OUT' && !confirm('¿Marcar tu salida del día? Ya no podrás marcar otra vez hoy.')) return;
    mark.mutate(type);
  };

  const Icon = nextAction ? MARK_ICONS[nextAction] : CalendarCheck;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Hoy · {shortDay(data.workDate)}</p>
            <p className="text-lg font-semibold">{scheduleLabel(todaySchedule)}</p>
          </div>
          {nextAction ? (
            <div className="flex flex-col gap-2 sm:items-end">
              <Button size="lg" className="h-14 px-8 text-base" onClick={() => confirmMark(nextAction)} loading={mark.isPending}>
                <Icon className="mr-2 h-5 w-5" />{MARK_LABELS[nextAction]}
              </Button>
              {nextAction === 'LUNCH_OUT' && (
                <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => confirmMark('CHECK_OUT')}>
                  Marcar salida sin almuerzo
                </button>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-success"><CalendarCheck className="h-5 w-5" />Jornada completa</p>
          )}
        </div>

        <div className={cn('mt-5 grid gap-3', slots.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
          {slots.map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-xl font-semibold tabular-nums', !s.value && 'text-muted-foreground/50')}>{limaTime(s.value)}</p>
              {s.extra && <p className="text-xs font-medium text-destructive">{s.extra}</p>}
            </div>
          ))}
        </div>

        {data.history.length > 0 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Mis últimos días</summary>
            <div className="mt-3 divide-y text-sm">
              {data.history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="w-20 shrink-0 capitalize">{shortDay(r.workDate)}</span>
                  <span className="flex-1 tabular-nums text-muted-foreground">
                    {limaTime(r.checkInAt)} – {limaTime(r.checkOutAt)}
                  </span>
                  <StatusBadge record={r} />
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ record, absent, pending }: { record?: AttendanceRecord; absent?: boolean; pending?: boolean }) {
  if (pending) return <Badge variant="warning">Sin marcar</Badge>;
  if (absent) return <Badge variant="destructive">Falta</Badge>;
  if (!record) return null;
  if (record.isLate) return <Badge variant="warning">Tardanza</Badge>;
  if (!record.checkOutAt && record.workDate < todayLimaDateString()) return <Badge variant="secondary">Sin salida</Badge>;
  return <Badge variant="success">Puntual</Badge>;
}

// ─── Reporte para administración ────────────────────────────────────────────
interface Report {
  records: AttendanceRecord[];
  absences: { userId: string; workDate: string; scheduledStart: string; scheduledEnd: string; pending: boolean; user: { firstName: string; lastName: string } }[];
  summary: {
    userId: string; name: string; daysWorked: number; lateDays: number; lateMinutes: number;
    lunchExtraMinutes: number; earlyLeaveMinutes: number; absences: number; missingCheckOut: number; workedMinutes: number;
  }[];
  users: { id: string; firstName: string; lastName: string; hasSchedule: boolean }[];
}

type Row =
  | { kind: 'record'; key: string; workDate: string; name: string; record: AttendanceRecord }
  | { kind: 'absence'; key: string; workDate: string; name: string; userId: string; schedule: string; pending: boolean };

function StaffAttendance() {
  const today = todayLimaDateString();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [userId, setUserId] = useState('');
  const [editing, setEditing] = useState<{ userId: string; name: string; workDate: string; record?: AttendanceRecord } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-report', from, to, userId],
    queryFn: async () =>
      (await api.get<{ data: Report }>(`/attendance?from=${from}&to=${to}${userId ? `&userId=${userId}` : ''}`)).data.data,
    enabled: !!from && !!to && from <= to,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const r: Row[] = [
      ...data.records.map((rec) => ({
        kind: 'record' as const, key: rec.id, workDate: rec.workDate,
        name: rec.user ? `${rec.user.firstName} ${rec.user.lastName}` : '', record: rec,
      })),
      ...data.absences.map((a) => ({
        kind: 'absence' as const, key: `${a.userId}-${a.workDate}`, workDate: a.workDate, userId: a.userId,
        name: `${a.user.firstName} ${a.user.lastName}`, schedule: `${a.scheduledStart}–${a.scheduledEnd}`, pending: a.pending,
      })),
    ];
    return r.sort((a, b) => b.workDate.localeCompare(a.workDate) || a.name.localeCompare(b.name));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold">Registro del personal</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Desde</label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Hasta</label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="col-span-2 sm:w-56">
            <label className="mb-1 block text-xs text-muted-foreground">Persona</label>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Todo el personal</option>
              {(data?.users ?? []).filter((u) => u.hasSchedule).map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {(data?.summary ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data!.summary.map((s) => (
            <Card key={s.userId}>
              <CardContent className="p-4">
                <p className="font-semibold">{s.name}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Días" value={s.daysWorked} />
                  <Stat label="Tardanzas" value={s.lateDays} tone={s.lateDays ? 'warning' : undefined} />
                  <Stat label="Faltas" value={s.absences} tone={s.absences ? 'destructive' : undefined} />
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>Minutos de tardanza: <span className="font-medium text-foreground">{formatMinutes(s.lateMinutes)}</span></p>
                  {s.lunchExtraMinutes > 0 && <p>Almuerzo extendido: <span className="font-medium text-foreground">{formatMinutes(s.lunchExtraMinutes)}</span></p>}
                  {s.earlyLeaveMinutes > 0 && <p>Salidas antes de hora: <span className="font-medium text-foreground">{formatMinutes(s.earlyLeaveMinutes)}</span></p>}
                  {s.missingCheckOut > 0 && <p>Días sin marcar salida: <span className="font-medium text-foreground">{s.missingCheckOut}</span></p>}
                  <p>Horas trabajadas: <span className="font-medium text-foreground">{formatMinutes(s.workedMinutes)}</span></p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
              <Clock className="h-12 w-12 opacity-20" />
              <p>No hay marcaciones en estas fechas.</p>
              <p className="text-xs">Asigna un horario al personal desde Usuarios para controlar su asistencia.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Persona</th>
                    <th className="px-4 py-3 font-medium">Horario</th>
                    <th className="px-4 py-3 font-medium">Ingreso</th>
                    <th className="px-4 py-3 font-medium">Almuerzo</th>
                    <th className="px-4 py-3 font-medium">Salida</th>
                    <th className="px-4 py-3 font-medium">Trabajado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => row.kind === 'absence' ? (
                    <tr key={row.key} className="hover:bg-muted/30">
                      <td className="px-4 py-3 capitalize whitespace-nowrap">{shortDay(row.workDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.name}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{row.schedule}</td>
                      <td className="px-4 py-3 text-muted-foreground" colSpan={4}>No marcó</td>
                      <td className="px-4 py-3"><StatusBadge absent={!row.pending} pending={row.pending} /></td>
                      <td className="px-2 py-3">
                        <Button variant="ghost" size="icon-sm" aria-label="Registrar"
                          onClick={() => setEditing({ userId: row.userId, name: row.name, workDate: row.workDate })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.key} className="hover:bg-muted/30">
                      <td className="px-4 py-3 capitalize whitespace-nowrap">{shortDay(row.workDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.name}
                        {row.record.note && <p className="text-xs text-muted-foreground">{row.record.note}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.record.scheduledStart ? `${row.record.scheduledStart}–${row.record.scheduledEnd}` : 'Día libre'}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {limaTime(row.record.checkInAt)}
                        {row.record.isLate && <span className="ml-1.5 text-xs font-medium text-destructive">+{row.record.lateMinutes}</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {row.record.lunchOutAt ? `${limaTime(row.record.lunchOutAt)}–${limaTime(row.record.lunchInAt)}` : '—'}
                        {row.record.lunchLateMinutes > 0 && <span className="ml-1.5 text-xs font-medium text-destructive">+{row.record.lunchLateMinutes}</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {limaTime(row.record.checkOutAt)}
                        {row.record.earlyLeaveMinutes > 0 && <span className="ml-1.5 text-xs font-medium text-destructive">−{row.record.earlyLeaveMinutes}</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{row.record.workedMinutes !== null ? formatMinutes(row.record.workedMinutes) : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge record={row.record} />
                        {row.record.editedById && <span className="ml-1.5 text-xs text-muted-foreground">corregido</span>}
                      </td>
                      <td className="px-2 py-3">
                        <Button variant="ghost" size="icon-sm" aria-label="Corregir"
                          onClick={() => setEditing({ userId: row.record.userId, name: row.name, workDate: row.workDate, record: row.record })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Tardanza = ingreso después de la hora programada más la tolerancia. Los números en rojo son minutos (tarde, almuerzo extendido o salida antes de hora).
      </p>

      {editing && <CorrectionModal {...editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'destructive' }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <p className={cn('text-xl font-bold tabular-nums', tone === 'warning' && 'text-warning', tone === 'destructive' && 'text-destructive')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CorrectionModal({ userId, name, workDate, record, onClose }: {
  userId: string; name: string; workDate: string; record?: AttendanceRecord; onClose: () => void;
}) {
  const qc = useQueryClient();
  const t = (iso: string | null | undefined) => (iso ? limaTime(iso) : '');
  const [checkIn, setCheckIn] = useState(t(record?.checkInAt));
  const [lunchOut, setLunchOut] = useState(t(record?.lunchOutAt));
  const [lunchIn, setLunchIn] = useState(t(record?.lunchInAt));
  const [checkOut, setCheckOut] = useState(t(record?.checkOutAt));
  const [note, setNote] = useState(record?.note ?? '');

  const save = useMutation({
    mutationFn: () => api.put('/attendance/day', {
      userId, workDate,
      checkIn: checkIn || null, lunchOut: lunchOut || null, lunchIn: lunchIn || null, checkOut: checkOut || null,
      note: note.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Asistencia actualizada.');
      qc.invalidateQueries({ queryKey: ['attendance-report'] });
      qc.invalidateQueries({ queryKey: ['attendance-me'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl animate-fade-in">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Corregir asistencia</h2>
            <p className="text-sm text-muted-foreground"><span className="capitalize">{shortDay(workDate)}</span> · {name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Ingreso" value={checkIn} onChange={setCheckIn} />
          <TimeField label="Salida" value={checkOut} onChange={setCheckOut} />
          <TimeField label="Sale a almorzar" value={lunchOut} onChange={setLunchOut} />
          <TimeField label="Regresa" value={lunchIn} onChange={setLunchIn} />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">Motivo / nota</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: olvidó marcar salida" maxLength={300} />
        </div>
        <Button className="mt-5 w-full" size="lg" onClick={() => save.mutate()} loading={save.isPending}>Guardar</Button>
      </div>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
