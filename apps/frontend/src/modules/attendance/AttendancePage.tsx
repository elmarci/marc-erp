// Asistencia: marcación propia (ingreso, almuerzo, salida) y, para
// administración, el registro del personal con resumen y correcciones.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Clock, Coffee, LogIn, LogOut, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, EmptyState, Field, Modal, PageHeader, Panel, StatusBadge as Badge, fieldCls, surfaceCls, tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp';
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
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Asistencia" />
      {showMine && <MyAttendanceCard />}
      {isAdmin && <StaffAttendance />}
    </div>
  );
}

// ─── Marcación propia ───────────────────────────────────────────────────────
function MyAttendanceCard() {
  const { data } = useMyAttendance();
  const mark = useMarkAttendance();
  const confirm = useConfirm();
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

  const confirmMark = async (type: MarkType) => {
    if (type === 'CHECK_OUT') {
      const r = await confirm({ title: '¿Marcar tu salida del día?', description: 'Ya no podrás marcar otra vez hoy.', confirmLabel: 'Marcar salida', tone: 'primary' });
      if (!r.ok) return;
    }
    mark.mutate(type);
  };

  const Icon = nextAction ? MARK_ICONS[nextAction] : CalendarCheck;

  return (
    <section className={cn('p-4 sm:p-5', surfaceCls)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-table text-ink-muted">Hoy · {shortDay(data.workDate)}</p>
          <p className="text-section font-semibold text-ink">{scheduleLabel(todaySchedule)}</p>
        </div>
        {nextAction ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <Btn variant="primary" className="h-12 px-6 text-section [&_svg]:size-5" onClick={() => confirmMark(nextAction)} loading={mark.isPending}>
              {!mark.isPending && <Icon />}{MARK_LABELS[nextAction]}
            </Btn>
            {nextAction === 'LUNCH_OUT' && (
              <button type="button" className="text-meta text-ink-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => confirmMark('CHECK_OUT')}>
                Marcar salida sin almuerzo
              </button>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-table font-medium text-ok-ink"><CalendarCheck className="size-5" />Jornada completa</p>
        )}
      </div>

      <div className={cn('mt-4 grid gap-2', slots.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {slots.map((s) => (
          <div key={s.label} className="rounded-ctl bg-surface-2 px-3 py-2">
            <p className="text-meta text-ink-muted">{s.label}</p>
            <p className={cn('text-kpi font-semibold tabular-nums', s.value ? 'text-ink' : 'text-ink-muted/50')}>{limaTime(s.value)}</p>
            {s.extra && <p className="text-meta font-medium text-bad-ink">{s.extra}</p>}
          </div>
        ))}
      </div>

      {data.history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-table font-medium text-ink-muted hover:text-ink">Mis últimos días</summary>
          <div className="mt-2 divide-y divide-line text-table">
            {data.history.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="w-20 shrink-0 capitalize">{shortDay(r.workDate)}</span>
                <span className="flex-1 tabular-nums text-ink-muted">{limaTime(r.checkInAt)} – {limaTime(r.checkOutAt)}</span>
                <DayStatus record={r} />
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DayStatus({ record, absent, pending }: { record?: AttendanceRecord; absent?: boolean; pending?: boolean }) {
  if (pending) return <Badge tone="warn">Sin marcar</Badge>;
  if (absent) return <Badge tone="bad">Falta</Badge>;
  if (!record) return null;
  if (record.isLate) return <Badge tone="warn">Tardanza</Badge>;
  if (!record.checkOutAt && record.workDate < todayLimaDateString()) return <Badge tone="muted">Sin salida</Badge>;
  return <Badge tone="ok">Puntual</Badge>;
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

  const red = (v: React.ReactNode) => <span className="ml-1.5 text-meta font-medium text-bad-ink">{v}</span>;
  const editBtn = (label: string, onClick: () => void) => (
    <Btn size="sm" variant="ghost" aria-label={label} title={label} onClick={onClick}><Pencil /></Btn>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-section font-semibold text-ink">Registro del personal</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <Field label="Desde"><input type="date" className={fieldCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input type="date" className={fieldCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Persona" className="col-span-2 sm:w-56">
            <select className={fieldCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Todo el personal</option>
              {(data?.users ?? []).filter((u) => u.hasSchedule).map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {(data?.summary ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data!.summary.map((s) => (
            <Panel key={s.userId} title={s.name} bodyClassName="p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Días" value={s.daysWorked} />
                <Stat label="Tardanzas" value={s.lateDays} tone={s.lateDays ? 'warn' : undefined} />
                <Stat label="Faltas" value={s.absences} tone={s.absences ? 'bad' : undefined} />
              </div>
              <div className="mt-3 flex flex-col gap-1 text-meta text-ink-muted">
                <p>Minutos de tardanza: <span className="font-medium text-ink">{formatMinutes(s.lateMinutes)}</span></p>
                {s.lunchExtraMinutes > 0 && <p>Almuerzo extendido: <span className="font-medium text-ink">{formatMinutes(s.lunchExtraMinutes)}</span></p>}
                {s.earlyLeaveMinutes > 0 && <p>Salidas antes de hora: <span className="font-medium text-ink">{formatMinutes(s.earlyLeaveMinutes)}</span></p>}
                {s.missingCheckOut > 0 && <p>Días sin marcar salida: <span className="font-medium text-ink">{s.missingCheckOut}</span></p>}
                <p>Horas trabajadas: <span className="font-medium text-ink">{formatMinutes(s.workedMinutes)}</span></p>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div className={cn('overflow-hidden', surfaceCls)}>
        {isLoading ? (
          <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} title="No hay marcaciones en estas fechas."
            action={<p className="text-meta text-ink-muted">Asigna un horario al personal desde Usuarios para controlar su asistencia.</p>} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Persona</th>
                <th className={thCls}>Horario</th>
                <th className={thCls}>Ingreso</th>
                <th className={thCls}>Almuerzo</th>
                <th className={thCls}>Salida</th>
                <th className={thCls}>Trabajado</th>
                <th className={thCls}>Estado</th>
                <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {rows.map((row) => row.kind === 'absence' ? (
                  <tr key={row.key} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'whitespace-nowrap capitalize')}>{shortDay(row.workDate)}</td>
                    <td className={cn(tdCls, 'whitespace-nowrap')}>{row.name}</td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{row.schedule}</td>
                    <td className={cn(tdCls, 'text-ink-muted')} colSpan={4}>No marcó</td>
                    <td className={tdCls}><DayStatus absent={!row.pending} pending={row.pending} /></td>
                    <td className={cn(tdCls, 'px-1')}>{editBtn('Registrar', () => setEditing({ userId: row.userId, name: row.name, workDate: row.workDate }))}</td>
                  </tr>
                ) : (
                  <tr key={row.key} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'whitespace-nowrap capitalize')}>{shortDay(row.workDate)}</td>
                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                      {row.name}
                      {row.record.note && <p className="text-meta text-ink-muted">{row.record.note}</p>}
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>
                      {row.record.scheduledStart ? `${row.record.scheduledStart}–${row.record.scheduledEnd}` : 'Día libre'}
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums')}>
                      {limaTime(row.record.checkInAt)}{row.record.isLate && red(`+${row.record.lateMinutes}`)}
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums')}>
                      {row.record.lunchOutAt ? `${limaTime(row.record.lunchOutAt)}–${limaTime(row.record.lunchInAt)}` : '—'}
                      {row.record.lunchLateMinutes > 0 && red(`+${row.record.lunchLateMinutes}`)}
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums')}>
                      {limaTime(row.record.checkOutAt)}{row.record.earlyLeaveMinutes > 0 && red(`−${row.record.earlyLeaveMinutes}`)}
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums')}>{row.record.workedMinutes !== null ? formatMinutes(row.record.workedMinutes) : '—'}</td>
                    <td className={cn(tdCls, 'whitespace-nowrap')}>
                      <DayStatus record={row.record} />
                      {row.record.editedById && <span className="ml-1.5 text-meta text-ink-muted">corregido</span>}
                    </td>
                    <td className={cn(tdCls, 'px-1')}>{editBtn('Corregir', () => setEditing({ userId: row.record.userId, name: row.name, workDate: row.workDate, record: row.record }))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-meta text-ink-muted">
        Tardanza = ingreso después de la hora programada más la tolerancia. Los números en rojo son minutos (tarde, almuerzo extendido o salida antes de hora).
      </p>

      {editing && <CorrectionModal {...editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-ctl bg-surface-2 py-2">
      <p className={cn('text-kpi font-semibold tabular-nums', tone === 'warn' ? 'text-warn-ink' : tone === 'bad' ? 'text-bad-ink' : 'text-ink')}>{value}</p>
      <p className="text-meta text-ink-muted">{label}</p>
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

  const time = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label}><input type="time" className={cn(fieldCls, 'tabular-nums')} value={value} onChange={(e) => onChange(e.target.value)} /></Field>
  );

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Corregir asistencia"
      description={<><span className="capitalize">{shortDay(workDate)}</span> · {name}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Guardar</Btn>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        {time('Ingreso', checkIn, setCheckIn)}
        {time('Salida', checkOut, setCheckOut)}
        {time('Sale a almorzar', lunchOut, setLunchOut)}
        {time('Regresa', lunchIn, setLunchIn)}
        <Field label="Motivo / nota" className="col-span-2">
          <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: olvidó marcar salida" maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}
