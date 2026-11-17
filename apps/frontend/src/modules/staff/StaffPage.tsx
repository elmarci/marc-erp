import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, HandCoins, Wallet, Pencil, History, Printer, MessageCircle, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDate, PAYMENT_METHOD_LABELS, todayLimaDateString } from '@/lib/utils';

/* ─── Tipos ─────────────────────────────────────────────────────────────── */
type EmploymentType = 'INFORMAL' | 'PLANILLA';
type Regime = 'MICRO' | 'GENERAL';
type Freq = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
type Pension = 'NONE' | 'ONP' | 'AFP';
type Kind = 'REGULAR' | 'GRATIFICACION' | 'CTS' | 'VACACIONES' | 'LIQUIDACION';

interface Employee {
  id: string; firstName: string; lastName: string; docNumber: string | null; phone: string | null; position: string | null;
  startDate: string; endDate: string | null; isActive: boolean; userId: string | null;
  employmentType: EmploymentType; laborRegime: Regime | null; payFrequency: Freq; salary: number;
  pensionSystem: Pension; afpName: string | null; afpRate: number | null; familyAllowance: boolean;
  discountAbsences: boolean; discountLateness: boolean; notes: string | null;
  user: { id: string; username: string; hasSchedule: boolean } | null;
  pendingAdvances: number;
  lastPayment: { periodEnd: string; netAmount: number; paidAt: string } | null;
  nextPeriod: { from: string; to: string };
  payDue: boolean;
  belowMinimumWage: boolean;
}

interface Preview {
  kind: Kind; periodStart: string; periodEnd: string; note: string | null;
  attendance: { scheduledDays: number; daysWorked: number; absences: number; lateMinutes: number; minutesPerDay: number } | null;
  daysScheduled: number; daysWorked: number; lateMinutes: number;
  baseAmount: number; familyAllowance: number; bonus: number; absenceDiscount: number; lateDiscount: number;
  pendingAdvances: Array<{ id: string; amount: number; givenAt: string; notes: string | null }>;
  grossAmount: number; pensionRate: number; pensionDiscount: number; netAmount: number; employerHealth: number;
}

interface Payment {
  id: string; number: string; kind: Kind; periodStart: string; periodEnd: string;
  employmentType: EmploymentType; laborRegime: Regime | null;
  daysScheduled: number; daysWorked: string | number; lateMinutes: number;
  baseAmount: string | number; familyAllowance: string | number; bonus: string | number;
  absenceDiscount: string | number; lateDiscount: string | number; grossAmount: string | number;
  pensionSystem: Pension; pensionRate: string | number; pensionDiscount: string | number;
  advancesDeducted: string | number; otherDiscount: string | number; otherDiscountNote: string | null;
  netAmount: string | number; employerHealth: string | number; method: string; paidAt: string;
  notes: string | null; voidedAt: string | null; voidReason: string | null;
  employee: { id: string; firstName: string; lastName: string; docNumber?: string | null; phone?: string | null; position?: string | null };
}

interface Benefits {
  applies: boolean; regime?: Regime;
  vacation?: { perYear: number; earned: number; taken: number; available: number };
  gratificacion?: { baseAmount: number; bonus: number; months: number; note: string };
  cts?: { baseAmount: number; bonus: number; months: number; note: string };
}

/* ─── Etiquetas ─────────────────────────────────────────────────────────── */
const FREQ_LABEL: Record<Freq, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual' };
const FREQ_PER: Record<Freq, string> = { WEEKLY: 'por semana', BIWEEKLY: 'por quincena', MONTHLY: 'al mes' };
const KIND_LABEL: Record<Kind, string> = {
  REGULAR: 'Sueldo', GRATIFICACION: 'Gratificación', CTS: 'CTS', VACACIONES: 'Vacaciones', LIQUIDACION: 'Liquidación',
};
const REGIME_LABEL: Record<Regime, string> = { MICRO: 'Microempresa', GENERAL: 'Régimen general' };
const METHODS = Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => !['CREDIT', 'DEBIT_CARD', 'CREDIT_CARD'].includes(k));
const n = (v: string | number | null | undefined) => Number(v ?? 0);
const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const periodLabel = (from: string, to: string) => (from.slice(0, 10) === to.slice(0, 10) ? dayLabel(from) : `${dayLabel(from)} al ${dayLabel(to)}`);

function employeeTag(e: Pick<Employee, 'employmentType' | 'laborRegime'>) {
  return e.employmentType === 'INFORMAL' ? 'Sin planilla' : `Planilla · ${REGIME_LABEL[e.laborRegime ?? 'MICRO']}`;
}

/* ─── Piezas ────────────────────────────────────────────────────────────── */
function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={cn('flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex gap-3 border-t p-4">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
      <span>{children}</span>
    </label>
  );
}

function Row({ label, value, strong, muted, negative }: { label: React.ReactNode; value: number; strong?: boolean; muted?: boolean; negative?: boolean }) {
  if (!strong && !value) return null;
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1 text-sm', strong && 'text-base font-bold', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular-nums">{negative ? `− ${formatCurrency(value)}` : formatCurrency(value)}</span>
    </div>
  );
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  ['staff', 'staff-payments', 'staff-employee', 'expenses', 'treasury-summary', 'treasury-movements'].forEach((k) =>
    qc.invalidateQueries({ queryKey: [k] }));
}

/* ─── Ficha del trabajador ──────────────────────────────────────────────── */
function EmployeeModal({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ['users-for-staff'],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; firstName: string; lastName: string; username: string }> }>('/users', { params: { limit: 100 } })).data.data,
  });
  const [f, setF] = useState(() => ({
    firstName: employee?.firstName ?? '', lastName: employee?.lastName ?? '', docNumber: employee?.docNumber ?? '',
    phone: employee?.phone ?? '', position: employee?.position ?? '',
    startDate: employee?.startDate?.slice(0, 10) ?? todayLimaDateString(), userId: employee?.userId ?? '',
    employmentType: employee?.employmentType ?? 'INFORMAL' as EmploymentType,
    laborRegime: employee?.laborRegime ?? 'MICRO' as Regime,
    payFrequency: employee?.payFrequency ?? 'WEEKLY' as Freq,
    salary: employee ? String(employee.salary) : '',
    pensionSystem: employee?.pensionSystem && employee.pensionSystem !== 'NONE' ? employee.pensionSystem : 'ONP' as Pension,
    afpName: employee?.afpName ?? '', afpRate: employee?.afpRate != null ? String(employee.afpRate) : '11.37',
    familyAllowance: employee?.familyAllowance ?? false,
    discountAbsences: employee?.discountAbsences ?? true, discountLateness: employee?.discountLateness ?? false,
    isActive: employee?.isActive ?? true, notes: employee?.notes ?? '',
  }));
  const set = (patch: Partial<typeof f>) => setF((v) => ({ ...v, ...patch }));
  const planilla = f.employmentType === 'PLANILLA';

  const save = useMutation({
    mutationFn: () => {
      const body = {
        firstName: f.firstName, lastName: f.lastName, docNumber: f.docNumber || null, phone: f.phone || null,
        position: f.position || null, startDate: f.startDate, userId: f.userId || null,
        employmentType: f.employmentType, laborRegime: planilla ? f.laborRegime : null, payFrequency: f.payFrequency,
        salary: Number(f.salary), pensionSystem: planilla ? f.pensionSystem : 'NONE',
        afpName: planilla && f.pensionSystem === 'AFP' ? f.afpName : null,
        afpRate: planilla && f.pensionSystem === 'AFP' ? Number(f.afpRate) : null,
        familyAllowance: planilla && f.familyAllowance, discountAbsences: f.discountAbsences, discountLateness: f.discountLateness,
        isActive: f.isActive, endDate: !f.isActive && employee?.isActive ? todayLimaDateString() : undefined, notes: f.notes || null,
      };
      return employee ? api.patch(`/staff/${employee.id}`, body) : api.post('/staff', body);
    },
    onSuccess: () => { invalidate(qc); toast.success(employee ? 'Datos guardados.' : 'Trabajador agregado.'); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Sheet title={employee ? 'Editar trabajador' : 'Agregar trabajador'} onClose={onClose}
      footer={<>
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" loading={save.isPending} disabled={!f.firstName.trim() || !(Number(f.salary) > 0)} onClick={() => save.mutate()}>Guardar</Button>
      </>}>
      <Segmented value={f.employmentType} onChange={(v) => set({ employmentType: v })}
        options={[['INFORMAL', 'Sin planilla'], ['PLANILLA', 'En planilla']]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombres"><Input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} autoFocus /></Field>
        <Field label="Apellidos"><Input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></Field>
        <Field label={planilla ? 'DNI' : 'DNI (opcional)'}>
          <Input value={f.docNumber} inputMode="numeric" maxLength={12} onChange={(e) => set({ docNumber: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Celular"><Input value={f.phone} inputMode="tel" maxLength={12} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
        <Field label="Puesto"><Input value={f.position} placeholder="Cajera, almacén…" onChange={(e) => set({ position: e.target.value })} /></Field>
        <Field label="Fecha de ingreso"><Input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Se le paga">
          <Select value={f.payFrequency} onChange={(e) => set({ payFrequency: e.target.value as Freq })}>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label={planilla ? 'Sueldo mensual' : `Gana ${FREQ_PER[f.payFrequency]}`}
          hint={planilla && Number(f.salary) > 0 && Number(f.salary) < 1130 ? 'Menos que el sueldo mínimo (S/ 1,130) para jornada completa.' : undefined}>
          <Input type="number" inputMode="decimal" min={0} value={f.salary} onChange={(e) => set({ salary: e.target.value })} placeholder="0.00" />
        </Field>
      </div>

      {planilla && (
        <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <Field label="Régimen laboral" hint={f.laborRegime === 'MICRO'
            ? '15 días de vacaciones, sin gratificación ni CTS. Salud por SIS.'
            : '30 días de vacaciones, gratificación en julio y diciembre, CTS y EsSalud 9%.'}>
            <Segmented value={f.laborRegime} onChange={(v) => set({ laborRegime: v })} options={[['MICRO', 'Microempresa'], ['GENERAL', 'General']]} />
          </Field>
          <Field label="Pensión">
            <Segmented value={f.pensionSystem} onChange={(v) => set({ pensionSystem: v })} options={[['ONP', 'ONP 13%'], ['AFP', 'AFP']]} />
          </Field>
          {f.pensionSystem === 'AFP' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="AFP"><Input value={f.afpName} placeholder="Integra, Prima…" onChange={(e) => set({ afpName: e.target.value })} /></Field>
              <Field label="% que descuenta"><Input type="number" inputMode="decimal" value={f.afpRate} onChange={(e) => set({ afpRate: e.target.value })} /></Field>
            </div>
          )}
          <Check checked={f.familyAllowance} onChange={(v) => set({ familyAllowance: v })}>
            Tiene hijos menores de edad (asignación familiar de S/ 113 al mes)
          </Check>
        </div>
      )}

      <Field label="Usuario del sistema (para su asistencia)"
        hint={f.userId ? 'Sus marcas de asistencia se usan para contar días y tardanzas.' : 'Sin usuario, los días trabajados se revisan a mano al pagar.'}>
        <Select value={f.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">No tiene</option>
          {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.username})</option>)}
        </Select>
      </Field>
      <div className="space-y-2">
        <Check checked={f.discountAbsences} onChange={(v) => set({ discountAbsences: v })}>Descontar las faltas</Check>
        <Check checked={f.discountLateness} onChange={(v) => set({ discountLateness: v })}>Descontar las tardanzas por minuto</Check>
        {employee && <Check checked={!f.isActive} onChange={(v) => set({ isActive: !v })}>Ya no trabaja aquí (dar de baja)</Check>}
      </div>
    </Sheet>
  );
}

/* ─── Adelanto ──────────────────────────────────────────────────────────── */
function AdvanceModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/staff/${employee.id}/advances`, { amount: Number(amount), method, notes: notes || null }),
    onSuccess: () => { invalidate(qc); toast.success(`Adelanto registrado. Se descontará en el próximo pago de ${employee.firstName}.`); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <Sheet title="Dar adelanto" subtitle={name(employee)} onClose={onClose}
      footer={<>
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" loading={save.isPending} disabled={!(Number(amount) > 0)} onClick={() => save.mutate()}>Registrar</Button>
      </>}>
      <Field label="Monto"><Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-semibold" autoFocus /></Field>
      <Field label="Sale de" hint="El dinero sale de Caja General en ese medio.">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Nota (opcional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pasajes, emergencia…" /></Field>
      {employee.pendingAdvances > 0 && (
        <p className="text-sm text-muted-foreground">Ya tiene {formatCurrency(employee.pendingAdvances)} en adelantos por descontar.</p>
      )}
    </Sheet>
  );
}

/* ─── Pagar ─────────────────────────────────────────────────────────────── */
function PayModal({ employee, onClose, onPaid }: { employee: Employee; onClose: () => void; onPaid: (id: string) => void }) {
  const qc = useQueryClient();
  const planilla = employee.employmentType === 'PLANILLA';
  const [kind, setKind] = useState<Kind>('REGULAR');
  const [from, setFrom] = useState(employee.nextPeriod.from);
  const [to, setTo] = useState(employee.nextPeriod.to);
  const [vacationDays, setVacationDays] = useState('');
  const { data: preview, isFetching } = useQuery({
    queryKey: ['staff-preview', employee.id, kind, from, to, vacationDays],
    queryFn: async () => (await api.get<{ data: Preview }>(`/staff/${employee.id}/preview`, {
      params: { kind, from, to, vacationDays: kind === 'VACACIONES' && vacationDays ? vacationDays : undefined },
    })).data.data,
  });

  const [v, setV] = useState({ daysWorked: '', base: '', family: '', bonus: '', absence: '', late: '', other: '', otherNote: '' });
  const [advanceIds, setAdvanceIds] = useState<string[]>([]);
  const [method, setMethod] = useState('CASH');
  useEffect(() => {
    if (!preview) return;
    setV({
      daysWorked: String(preview.daysWorked), base: String(preview.baseAmount), family: String(preview.familyAllowance),
      bonus: preview.bonus ? String(preview.bonus) : '', absence: preview.absenceDiscount ? String(preview.absenceDiscount) : '',
      late: preview.lateDiscount ? String(preview.lateDiscount) : '', other: '', otherNote: '',
    });
    setAdvanceIds(kind === 'REGULAR' ? preview.pendingAdvances.map((a) => a.id) : []);
    if (kind === 'VACACIONES' && !vacationDays) setVacationDays(String(preview.daysWorked));
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const advances = preview?.pendingAdvances ?? [];
  const advancesDeducted = advances.filter((a) => advanceIds.includes(a.id)).reduce((s, a) => s + a.amount, 0);
  const gross = Math.round((n(v.base) + n(v.family) + n(v.bonus) - n(v.absence) - n(v.late)) * 100) / 100;
  const pensionRate = preview?.pensionRate ?? 0;
  const pension = Math.round(Math.max(gross, 0) * pensionRate) / 100;
  const net = Math.round((gross - pension - advancesDeducted - n(v.other)) * 100) / 100;

  const pay = useMutation({
    mutationFn: async () => (await api.post<{ data: { id: string } }>(`/staff/${employee.id}/payments`, {
      kind, periodStart: from, periodEnd: to,
      daysScheduled: preview?.daysScheduled ?? 0, daysWorked: n(v.daysWorked), lateMinutes: preview?.lateMinutes ?? 0,
      baseAmount: n(v.base), familyAllowance: n(v.family), bonus: n(v.bonus), absenceDiscount: n(v.absence), lateDiscount: n(v.late),
      advanceIds, otherDiscount: n(v.other), otherDiscountNote: v.otherNote || null, method,
    })).data.data,
    onSuccess: (p) => { invalidate(qc); toast.success(`Pago registrado: ${formatCurrency(net)} a ${employee.firstName}.`); onPaid(p.id); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const kinds: Array<[Kind, string]> = planilla
    ? (employee.laborRegime === 'GENERAL'
      ? [['REGULAR', 'Sueldo'], ['VACACIONES', 'Vacaciones'], ['GRATIFICACION', 'Gratificación'], ['CTS', 'CTS']]
      : [['REGULAR', 'Sueldo'], ['VACACIONES', 'Vacaciones']])
    : [];
  const att = preview?.attendance;

  return (
    <Sheet title={`Pagar a ${employee.firstName}`} subtitle={employeeTag(employee)} onClose={onClose} wide
      footer={<>
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" loading={pay.isPending} disabled={!preview || isFetching || gross <= 0 || net < 0} onClick={() => pay.mutate()}>
          Pagar {formatCurrency(Math.max(net, 0))}
        </Button>
      </>}>
      {kinds.length > 0 && (
        <div className="overflow-x-auto"><Segmented value={kind} onChange={(k) => { setKind(k); if (k !== 'REGULAR') { setFrom(todayLimaDateString()); setTo(todayLimaDateString()); } else { setFrom(employee.nextPeriod.from); setTo(employee.nextPeriod.to); } }} options={kinds} /></div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          {kind === 'REGULAR' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
          ) : kind === 'VACACIONES' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label="Días"><Input type="number" min={1} value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} /></Field>
            </div>
          ) : null}

          {kind === 'REGULAR' && (
            att ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="font-medium">Según su asistencia</p>
                <p className="text-muted-foreground">
                  Trabajó {att.daysWorked} de {att.scheduledDays} días{att.absences ? `, ${att.absences} falta${att.absences === 1 ? '' : 's'}` : ''}
                  {att.lateMinutes ? `, ${att.lateMinutes} min de tardanza` : ''}.
                </p>
              </div>
            ) : (
              <Field label="Días trabajados" hint={preview?.note ?? undefined}>
                <Input type="number" min={0} value={v.daysWorked} onChange={(e) => set({ daysWorked: e.target.value })} />
              </Field>
            )
          )}
          {preview?.note && kind !== 'REGULAR' && <p className="text-sm text-muted-foreground">{preview.note}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === 'REGULAR' ? 'Sueldo del periodo' : 'Monto'}>
              <Input type="number" inputMode="decimal" value={v.base} onChange={(e) => set({ base: e.target.value })} />
            </Field>
            <Field label={kind === 'GRATIFICACION' ? 'Bonificación 9%' : 'Bono / horas extra'}>
              <Input type="number" inputMode="decimal" value={v.bonus} placeholder="0" onChange={(e) => set({ bonus: e.target.value })} />
            </Field>
            {kind === 'REGULAR' && <>
              <Field label="Descuento por faltas"><Input type="number" inputMode="decimal" value={v.absence} placeholder="0" onChange={(e) => set({ absence: e.target.value })} /></Field>
              <Field label="Descuento por tardanzas"><Input type="number" inputMode="decimal" value={v.late} placeholder="0" onChange={(e) => set({ late: e.target.value })} /></Field>
            </>}
            <Field label="Otro descuento"><Input type="number" inputMode="decimal" value={v.other} placeholder="0" onChange={(e) => set({ other: e.target.value })} /></Field>
            {n(v.other) > 0 && <Field label="Motivo"><Input value={v.otherNote} placeholder="Faltante de caja…" onChange={(e) => set({ otherNote: e.target.value })} /></Field>}
          </div>

          {advances.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Adelantos por descontar</p>
              {advances.map((a) => (
                <Check key={a.id} checked={advanceIds.includes(a.id)}
                  onChange={(c) => setAdvanceIds((ids) => (c ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}>
                  {formatCurrency(a.amount)} del {formatDate(a.givenAt)}{a.notes ? ` · ${a.notes}` : ''}
                </Check>
              ))}
            </div>
          )}
          <Field label="Le pagas con">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="h-fit rounded-xl bg-muted/50 p-4">
          <p className="mb-2 text-sm font-medium">{KIND_LABEL[kind]}{kind === 'REGULAR' ? ` · ${periodLabel(from, to)}` : ''}</p>
          <Row label="Sueldo" value={n(v.base)} />
          <Row label="Asignación familiar" value={n(v.family)} />
          <Row label="Bono" value={n(v.bonus)} />
          <Row label="Faltas" value={n(v.absence)} negative muted />
          <Row label="Tardanzas" value={n(v.late)} negative muted />
          <div className="my-1 border-t" />
          <Row label="Total ganado" value={gross} />
          <Row label={`${employee.pensionSystem === 'AFP' ? 'AFP' : 'ONP'} (${pensionRate}%)`} value={pension} negative muted />
          <Row label="Adelantos" value={advancesDeducted} negative muted />
          <Row label="Otro descuento" value={n(v.other)} negative muted />
          <div className="my-1 border-t" />
          <Row label="Recibe" value={Math.max(net, 0)} strong />
          {net < 0 && <p className="mt-2 text-xs text-destructive">Los descuentos superan lo ganado. Quita algún adelanto para el siguiente pago.</p>}
          {preview && preview.employerHealth > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Aparte pagas {employee.laborRegime === 'GENERAL' ? 'EsSalud' : 'SIS'} aprox. {formatCurrency(preview.employerHealth)}. Lo retenido y la salud quedan como gastos por pagar para tu contador.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Constancia / boleta ───────────────────────────────────────────────── */
function receiptLines(p: Payment) {
  const lines: Array<[string, number, boolean?]> = [
    [KIND_LABEL[p.kind], n(p.baseAmount)],
    ['Asignación familiar', n(p.familyAllowance)],
    ['Bono', n(p.bonus)],
    ['Descuento por faltas', -n(p.absenceDiscount)],
    ['Descuento por tardanzas', -n(p.lateDiscount)],
    ['Total ganado', n(p.grossAmount), true],
    [`${p.pensionSystem === 'AFP' ? 'AFP' : 'ONP'} (${n(p.pensionRate)}%)`, -n(p.pensionDiscount)],
    ['Adelantos', -n(p.advancesDeducted)],
    [p.otherDiscountNote ? `Descuento: ${p.otherDiscountNote}` : 'Otro descuento', -n(p.otherDiscount)],
  ];
  return lines.filter(([, value, always]) => always || value !== 0);
}

function printReceipt(p: Payment, business: string) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { toast.error('Permite las ventanas emergentes para imprimir.'); return; }
  const money = (x: number) => `S/ ${Math.abs(x).toFixed(2)}`;
  const rows = receiptLines(p).map(([l, x, strong]) =>
    `<tr${strong ? ' class="b"' : ''}><td>${l}</td><td class="r">${x < 0 ? '− ' : ''}${money(x)}</td></tr>`).join('');
  const title = p.employmentType === 'PLANILLA' ? 'Boleta de pago' : 'Constancia de pago';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} ${p.number}</title>
<style>body{font-family:system-ui,Arial,sans-serif;font-size:13px;padding:24px;color:#111}h1{font-size:16px;margin:0 0 2px}
p{margin:2px 0}table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:5px 0}.r{text-align:right}
.b td{font-weight:700;border-top:1px solid #ddd}.net td{font-size:16px;font-weight:800;border-top:2px solid #111;padding-top:8px}
.m{color:#666}.sig{margin-top:56px;display:flex;gap:24px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}</style>
</head><body><h1>${business}</h1><p class="m">${title} ${p.number}${p.voidedAt ? ' · ANULADO' : ''}</p>
<p style="margin-top:12px"><b>${name(p.employee)}</b>${p.employee.docNumber ? ` · DNI ${p.employee.docNumber}` : ''}</p>
${p.employee.position ? `<p class="m">${p.employee.position}</p>` : ''}
<p class="m">${p.kind === 'REGULAR' ? `Periodo: ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind]}${n(p.daysWorked) ? ` · ${n(p.daysWorked)} días` : ''}</p>
<table>${rows}<tr class="net"><td>Recibe</td><td class="r">${money(n(p.netAmount))}</td></tr></table>
<p class="m">Pagado el ${new Date(p.paidAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} con ${PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
${n(p.employerHealth) ? `<p class="m">Aporte del empleador (${p.laborRegime === 'GENERAL' ? 'EsSalud' : 'SIS'}): ${money(n(p.employerHealth))}</p>` : ''}
<div class="sig"><div>Empleador</div><div>Trabajador</div></div>
<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

function whatsappText(p: Payment, business: string) {
  const lines = receiptLines(p).map(([l, x]) => `${l}: ${x < 0 ? '- ' : ''}S/ ${Math.abs(x).toFixed(2)}`);
  return [
    `*${business}*`, `${p.employmentType === 'PLANILLA' ? 'Boleta' : 'Constancia'} de pago ${p.number}`,
    `${name(p.employee)}`, p.kind === 'REGULAR' ? `Periodo: ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind],
    '', ...lines, `*Recibe: S/ ${n(p.netAmount).toFixed(2)}*`,
  ].join('\n');
}

function ReceiptModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Array<{ key: string; value: string }> }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });
  const business = settings?.find((x) => x.key === 'business_name')?.value || 'Minimarket';
  const { data: p } = useQuery({
    queryKey: ['staff-payment', paymentId],
    queryFn: async () => (await api.get<{ data: Payment }>(`/staff/payments/${paymentId}`)).data.data,
  });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidMut = useMutation({
    mutationFn: () => api.post(`/staff/payments/${paymentId}/void`, { reason }),
    onSuccess: () => { invalidate(qc); qc.invalidateQueries({ queryKey: ['staff-payment', paymentId] }); toast.success('Pago anulado. Los adelantos vuelven a quedar por descontar.'); setVoiding(false); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const phone = p?.employee.phone?.replace(/\D/g, '');

  return (
    <Sheet title={p ? `${p.employmentType === 'PLANILLA' ? 'Boleta' : 'Constancia'} ${p.number}` : 'Pago'} subtitle={p ? name(p.employee) : undefined} onClose={onClose}
      footer={p && !p.voidedAt ? (voiding ? <>
        <Button variant="outline" className="flex-1" onClick={() => setVoiding(false)}>Volver</Button>
        <Button variant="destructive" className="flex-1" loading={voidMut.isPending} disabled={reason.trim().length < 3} onClick={() => voidMut.mutate()}>Anular pago</Button>
      </> : <>
        <Button variant="outline" className="flex-1" onClick={() => printReceipt(p, business)}><Printer className="mr-1.5 h-4 w-4" />Imprimir</Button>
        <Button className="flex-1" onClick={() => window.open(`https://wa.me/${phone ? (phone.length === 9 ? `51${phone}` : phone) : ''}?text=${encodeURIComponent(whatsappText(p, business))}`, '_blank')}>
          <MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp
        </Button>
      </>) : undefined}>
      {!p ? <p className="py-8 text-center text-muted-foreground">Cargando...</p> : (
        <div className="space-y-3">
          {p.voidedAt && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Anulado: {p.voidReason}</p>}
          <p className="text-sm text-muted-foreground">
            {p.kind === 'REGULAR' ? `Periodo ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind]}
            {n(p.daysWorked) ? ` · ${n(p.daysWorked)} días` : ''} · pagado el {formatDate(p.paidAt)} con {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
          </p>
          <div className="rounded-xl bg-muted/50 p-4">
            {receiptLines(p).map(([l, x, strong]) => (
              <div key={l} className={cn('flex justify-between py-1 text-sm', strong && 'mt-1 border-t pt-2 font-semibold', x < 0 && 'text-muted-foreground')}>
                <span>{l}</span><span className="tabular-nums">{x < 0 ? `− ${formatCurrency(-x)}` : formatCurrency(x)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold"><span>Recibe</span><span className="tabular-nums">{formatCurrency(n(p.netAmount))}</span></div>
          </div>
          {!p.voidedAt && (voiding ? (
            <Field label="¿Por qué lo anulas?" hint="El dinero vuelve a Caja General y los adelantos quedan por descontar otra vez.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          ) : (
            <button type="button" className="text-sm text-muted-foreground hover:text-destructive" onClick={() => setVoiding(true)}>Anular este pago</button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ─── Historial de un trabajador ────────────────────────────────────────── */
function HistoryModal({ employee, onClose, onOpenPayment }: { employee: Employee; onClose: () => void; onOpenPayment: (id: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['staff-employee', employee.id],
    queryFn: async () => (await api.get<{ data: { advances: Array<{ id: string; amount: string; givenAt: string; notes: string | null; paymentId: string | null; voidedAt: string | null; method: string }>; payments: Payment[] } }>(`/staff/${employee.id}`)).data.data,
  });
  const { data: benefits } = useQuery({
    queryKey: ['staff-benefits', employee.id],
    queryFn: async () => (await api.get<{ data: Benefits }>(`/staff/${employee.id}/benefits`)).data.data,
    enabled: employee.employmentType === 'PLANILLA',
  });
  const voidAdv = useMutation({
    mutationFn: (id: string) => api.post(`/staff/advances/${id}/void`, { reason: 'Anulado desde el historial' }),
    onSuccess: () => { invalidate(qc); toast.success('Adelanto anulado. El dinero vuelve a Caja General.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Sheet title={name(employee)} subtitle={`${employeeTag(employee)} · desde ${formatDate(employee.startDate)}`} onClose={onClose} wide>
      {benefits?.applies && benefits.vacation && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Vacaciones por tomar</p>
            <p className="text-xl font-bold tabular-nums">{benefits.vacation.available} días</p>
            <p className="text-xs text-muted-foreground">{benefits.vacation.perYear} al año, {benefits.vacation.taken} tomados en el sistema</p>
          </div>
          {benefits.regime === 'GENERAL' && benefits.gratificacion && (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Gratificación acumulada</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(benefits.gratificacion.baseAmount + benefits.gratificacion.bonus)}</p>
              <p className="text-xs text-muted-foreground">{benefits.gratificacion.months} de 6 meses</p>
            </div>
          )}
          {benefits.regime === 'GENERAL' && benefits.cts && (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">CTS acumulada</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(benefits.cts.baseAmount)}</p>
              <p className="text-xs text-muted-foreground">{benefits.cts.months} de 6 meses</p>
            </div>
          )}
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">Pagos</p>
        <div className="divide-y rounded-xl bg-muted/30">
          {(data?.payments ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Aún no hay pagos.</p>}
          {(data?.payments ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => onOpenPayment(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', p.voidedAt && 'line-through text-muted-foreground')}>
                  {KIND_LABEL[p.kind]} {p.kind === 'REGULAR' ? periodLabel(p.periodStart, p.periodEnd) : ''}
                </span>
                <span className="block text-xs text-muted-foreground">{p.number} · {formatDate(p.paidAt)}{p.voidedAt ? ' · anulado' : ''}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(n(p.netAmount))}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Adelantos</p>
        <div className="divide-y rounded-xl bg-muted/30">
          {(data?.advances ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin adelantos.</p>}
          {(data?.advances ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className={cn('block text-sm font-medium', a.voidedAt && 'line-through text-muted-foreground')}>{formatCurrency(n(a.amount))}{a.notes ? ` · ${a.notes}` : ''}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(a.givenAt)} · {a.voidedAt ? 'anulado' : a.paymentId ? 'ya descontado' : 'por descontar'}
                </span>
              </span>
              {!a.voidedAt && !a.paymentId && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" loading={voidAdv.isPending && voidAdv.variables === a.id} onClick={() => voidAdv.mutate(a.id)}>Anular</Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Página ────────────────────────────────────────────────────────────── */
type Modal =
  | { type: 'edit'; employee?: Employee }
  | { type: 'advance' | 'pay' | 'history'; employee: Employee }
  | { type: 'receipt'; paymentId: string };

export function StaffPage() {
  const [tab, setTab] = useState<'people' | 'payments'>('people');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const { data: employees, isLoading } = useQuery({
    queryKey: ['staff', showInactive],
    queryFn: async () => (await api.get<{ data: Employee[] }>('/staff', { params: { all: showInactive || undefined } })).data.data,
  });
  const active = (employees ?? []).filter((e) => e.isActive);
  const due = active.filter((e) => e.payDue);
  const advancesTotal = active.reduce((s, e) => s + e.pendingAdvances, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Personal</h1>
          <p className="text-sm text-muted-foreground">Sueldos, adelantos y pagos de quienes trabajan contigo.</p>
        </div>
        <Button onClick={() => setModal({ type: 'edit' })}><Plus className="mr-1.5 h-4 w-4" />Agregar trabajador</Button>
      </div>

      <div className="flex gap-6 overflow-x-auto border-b" role="tablist">
        {([['people', 'Trabajadores'], ['payments', 'Pagos']] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn('-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors',
              tab === key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Trabajando</p><p className="text-2xl font-bold tabular-nums">{active.length}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Toca pagar</p><p className={cn('text-2xl font-bold tabular-nums', due.length && 'text-amber-600')}>{due.length}</p></div>
            <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Adelantos por descontar</p><p className="text-xl font-bold tabular-nums sm:text-2xl">{formatCurrency(advancesTotal)}</p></div>
          </div>

          {isLoading ? <p className="py-10 text-center text-muted-foreground">Cargando...</p> : (employees ?? []).length === 0 ? (
            <div className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
              <UserRound className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Agrega a quienes trabajan contigo, estén o no en planilla. Con eso llevas sus adelantos y pagos.
            </div>
          ) : (
            <div className="divide-y rounded-xl bg-card ring-1 ring-border">
              {(employees ?? []).map((e) => (
                <div key={e.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !e.isActive && 'opacity-60')}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setModal({ type: 'history', employee: e })}>
                    <p className="font-medium">{name(e)}{e.position ? <span className="font-normal text-muted-foreground"> · {e.position}</span> : null}</p>
                    <p className="text-sm text-muted-foreground">
                      {employeeTag(e)} · {formatCurrency(e.salary)} {e.employmentType === 'PLANILLA' ? 'al mes' : FREQ_PER[e.payFrequency]}
                      {e.employmentType === 'PLANILLA' && e.payFrequency !== 'MONTHLY' ? `, pago ${FREQ_LABEL[e.payFrequency].toLowerCase()}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {!e.isActive ? <span className="text-muted-foreground">De baja</span> : (
                        <span className={e.payDue ? 'font-medium text-amber-600' : 'text-muted-foreground'}>
                          {e.payDue ? 'Toca pagar' : 'Próximo pago'}: {periodLabel(e.nextPeriod.from, e.nextPeriod.to)}
                        </span>
                      )}
                      {e.pendingAdvances > 0 && <span className="text-muted-foreground"> · adelantos {formatCurrency(e.pendingAdvances)}</span>}
                      {e.user && !e.user.hasSchedule && <span className="text-muted-foreground"> · sin horario en Asistencia</span>}
                    </p>
                  </button>
                  {e.isActive && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setModal({ type: 'edit', employee: e })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Historial" onClick={() => setModal({ type: 'history', employee: e })}><History className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setModal({ type: 'advance', employee: e })}><HandCoins className="mr-1.5 h-4 w-4" />Adelanto</Button>
                      <Button size="sm" variant={e.payDue ? 'default' : 'outline'} onClick={() => setModal({ type: 'pay', employee: e })}><Wallet className="mr-1.5 h-4 w-4" />Pagar</Button>
                    </div>
                  )}
                  {!e.isActive && <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'edit', employee: e })}>Editar</Button>}
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4" />
            Mostrar también a quienes ya no trabajan
          </label>
        </div>
      )}

      {tab === 'payments' && <PaymentsTab onOpen={(id) => setModal({ type: 'receipt', paymentId: id })} />}

      {modal?.type === 'edit' && <EmployeeModal employee={modal.employee} onClose={() => setModal(null)} />}
      {modal?.type === 'advance' && <AdvanceModal employee={modal.employee} onClose={() => setModal(null)} />}
      {modal?.type === 'pay' && <PayModal employee={modal.employee} onClose={() => setModal(null)} onPaid={(id) => setModal({ type: 'receipt', paymentId: id })} />}
      {modal?.type === 'history' && <HistoryModal employee={modal.employee} onClose={() => setModal(null)} onOpenPayment={(id) => setModal({ type: 'receipt', paymentId: id })} />}
      {modal?.type === 'receipt' && <ReceiptModal paymentId={modal.paymentId} onClose={() => setModal(null)} />}
    </div>
  );
}

function PaymentsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const today = todayLimaDateString();
  const [month, setMonth] = useState(today.slice(0, 7));
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
  }, [month]);
  const { data, isLoading } = useQuery({
    queryKey: ['staff-payments', range],
    queryFn: async () => (await api.get<{ data: Payment[] }>('/staff/payments', { params: range })).data.data,
  });
  const valid = (data ?? []).filter((p) => !p.voidedAt);
  const totalNet = valid.reduce((s, p) => s + n(p.netAmount), 0);
  const totalCost = valid.reduce((s, p) => s + n(p.grossAmount) + n(p.employerHealth), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mes"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Pagado a tu personal</p><p className="text-2xl font-bold tabular-nums">{formatCurrency(totalNet)}</p></div>
        <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Costo total (con adelantos y aportes)</p><p className="text-2xl font-bold tabular-nums">{formatCurrency(totalCost)}</p></div>
      </div>
      <div className="divide-y rounded-xl bg-card ring-1 ring-border">
        {isLoading && <p className="p-6 text-center text-muted-foreground">Cargando...</p>}
        {!isLoading && (data ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No hay pagos en este mes.</p>}
        {(data ?? []).map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
            <span className="min-w-0">
              <span className={cn('block truncate text-sm font-medium', p.voidedAt && 'text-muted-foreground line-through')}>{name(p.employee)}</span>
              <span className="block text-xs text-muted-foreground">
                {KIND_LABEL[p.kind]}{p.kind === 'REGULAR' ? ` ${periodLabel(p.periodStart, p.periodEnd)}` : ''} · {p.number} · {formatDate(p.paidAt)}{p.voidedAt ? ' · anulado' : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums">{formatCurrency(n(p.netAmount))}</span>
              <span className="block text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
