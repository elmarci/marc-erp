// Ventanas de Personal: ficha del trabajador, adelanto y pago.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Btn, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDate, todayLimaDateString } from '@/lib/utils';

import {
  type EmploymentType, type Regime, type Freq, type Pension, type Kind, type Employee, type Preview, FREQ_LABEL, FREQ_PER, KIND_LABEL, METHODS, n, name, periodLabel, employeeTag, Sheet, Field, Segmented, Check, Row, invalidate,
} from './staffParts';

/* ─── Ficha del trabajador ──────────────────────────────────────────────── */
export function EmployeeModal({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
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
        <Btn className="flex-1" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" className="flex-1" loading={save.isPending} disabled={!f.firstName.trim() || !(Number(f.salary) > 0)} onClick={() => save.mutate()}>Guardar</Btn>
      </>}>
      <Segmented value={f.employmentType} onChange={(v) => set({ employmentType: v })}
        options={[['INFORMAL', 'Sin planilla'], ['PLANILLA', 'En planilla']]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombres"><input className={fieldCls} value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} autoFocus /></Field>
        <Field label="Apellidos"><input className={fieldCls} value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></Field>
        <Field label={planilla ? 'DNI' : 'DNI (opcional)'}>
          <input className={fieldCls} value={f.docNumber} inputMode="numeric" maxLength={12} onChange={(e) => set({ docNumber: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Celular"><input className={fieldCls} value={f.phone} inputMode="tel" maxLength={12} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
        <Field label="Puesto"><input className={fieldCls} value={f.position} placeholder="Cajera, almacén…" onChange={(e) => set({ position: e.target.value })} /></Field>
        <Field label="Fecha de ingreso"><input className={fieldCls} type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Se le paga">
          <select className={fieldCls} value={f.payFrequency} onChange={(e) => set({ payFrequency: e.target.value as Freq })}>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={planilla ? 'Sueldo mensual' : `Gana ${FREQ_PER[f.payFrequency]}`}
          hint={planilla && Number(f.salary) > 0 && Number(f.salary) < 1130 ? 'Menos que el sueldo mínimo (S/ 1,130) para jornada completa.' : undefined}>
          <input className={fieldCls} type="number" inputMode="decimal" min={0} value={f.salary} onChange={(e) => set({ salary: e.target.value })} placeholder="0.00" />
        </Field>
      </div>

      {planilla && (
        <div className="space-y-3 rounded-ctl bg-surface-2/40 p-3">
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
              <Field label="AFP"><input className={fieldCls} value={f.afpName} placeholder="Integra, Prima…" onChange={(e) => set({ afpName: e.target.value })} /></Field>
              <Field label="% que descuenta"><input className={fieldCls} type="number" inputMode="decimal" value={f.afpRate} onChange={(e) => set({ afpRate: e.target.value })} /></Field>
            </div>
          )}
          <Check checked={f.familyAllowance} onChange={(v) => set({ familyAllowance: v })}>
            Tiene hijos menores de edad (asignación familiar de S/ 113 al mes)
          </Check>
        </div>
      )}

      <Field label="Usuario del sistema (para su asistencia)"
        hint={f.userId ? 'Sus marcas de asistencia se usan para contar días y tardanzas.' : 'Sin usuario, los días trabajados se revisan a mano al pagar.'}>
        <select className={fieldCls} value={f.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">No tiene</option>
          {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.username})</option>)}
        </select>
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
export function AdvanceModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
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
        <Btn className="flex-1" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" className="flex-1" loading={save.isPending} disabled={!(Number(amount) > 0)} onClick={() => save.mutate()}>Registrar</Btn>
      </>}>
      <Field label="Monto"><input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(fieldCls, 'text-section font-semibold')} autoFocus /></Field>
      <Field label="Sale de" hint="El dinero sale de Caja General en ese medio.">
        <select className={fieldCls} value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Nota (opcional)"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pasajes, emergencia…" /></Field>
      {employee.pendingAdvances > 0 && (
        <p className="text-table text-ink-muted">Ya tiene {formatCurrency(employee.pendingAdvances)} en adelantos por descontar.</p>
      )}
    </Sheet>
  );
}

/* ─── Pagar ─────────────────────────────────────────────────────────────── */
export function PayModal({ employee, onClose, onPaid }: { employee: Employee; onClose: () => void; onPaid: (id: string) => void }) {
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
        <Btn className="flex-1" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" className="flex-1" loading={pay.isPending} disabled={!preview || isFetching || gross <= 0 || net < 0} onClick={() => pay.mutate()}>
          Pagar {formatCurrency(Math.max(net, 0))}
        </Btn>
      </>}>
      {kinds.length > 0 && (
        <div className="overflow-x-auto"><Segmented value={kind} onChange={(k) => { setKind(k); if (k !== 'REGULAR') { setFrom(todayLimaDateString()); setTo(todayLimaDateString()); } else { setFrom(employee.nextPeriod.from); setTo(employee.nextPeriod.to); } }} options={kinds} /></div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          {kind === 'REGULAR' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde"><input className={fieldCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Hasta"><input className={fieldCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
          ) : kind === 'VACACIONES' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Desde"><input className={fieldCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Hasta"><input className={fieldCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label="Días"><input className={fieldCls} type="number" min={1} value={vacationDays} onChange={(e) => setVacationDays(e.target.value)} /></Field>
            </div>
          ) : null}

          {kind === 'REGULAR' && (
            att ? (
              <div className="rounded-ctl bg-surface-2/40 p-3 text-table">
                <p className="font-medium">Según su asistencia</p>
                <p className="text-ink-muted">
                  Trabajó {att.daysWorked} de {att.scheduledDays} días{att.absences ? `, ${att.absences} falta${att.absences === 1 ? '' : 's'}` : ''}
                  {att.lateMinutes ? `, ${att.lateMinutes} min de tardanza` : ''}.
                </p>
              </div>
            ) : (
              <Field label="Días trabajados" hint={preview?.note ?? undefined}>
                <input className={fieldCls} type="number" min={0} value={v.daysWorked} onChange={(e) => set({ daysWorked: e.target.value })} />
              </Field>
            )
          )}
          {preview?.note && kind !== 'REGULAR' && <p className="text-table text-ink-muted">{preview.note}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === 'REGULAR' ? 'Sueldo del periodo' : 'Monto'}>
              <input className={fieldCls} type="number" inputMode="decimal" value={v.base} onChange={(e) => set({ base: e.target.value })} />
            </Field>
            <Field label={kind === 'GRATIFICACION' ? 'Bonificación 9%' : 'Bono / horas extra'}>
              <input className={fieldCls} type="number" inputMode="decimal" value={v.bonus} placeholder="0" onChange={(e) => set({ bonus: e.target.value })} />
            </Field>
            {kind === 'REGULAR' && <>
              <Field label="Descuento por faltas"><input className={fieldCls} type="number" inputMode="decimal" value={v.absence} placeholder="0" onChange={(e) => set({ absence: e.target.value })} /></Field>
              <Field label="Descuento por tardanzas"><input className={fieldCls} type="number" inputMode="decimal" value={v.late} placeholder="0" onChange={(e) => set({ late: e.target.value })} /></Field>
            </>}
            <Field label="Otro descuento"><input className={fieldCls} type="number" inputMode="decimal" value={v.other} placeholder="0" onChange={(e) => set({ other: e.target.value })} /></Field>
            {n(v.other) > 0 && <Field label="Motivo"><input className={fieldCls} value={v.otherNote} placeholder="Faltante de caja…" onChange={(e) => set({ otherNote: e.target.value })} /></Field>}
          </div>

          {advances.length > 0 && (
            <div className="space-y-2">
              <p className="text-table font-medium">Adelantos por descontar</p>
              {advances.map((a) => (
                <Check key={a.id} checked={advanceIds.includes(a.id)}
                  onChange={(c) => setAdvanceIds((ids) => (c ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}>
                  {formatCurrency(a.amount)} del {formatDate(a.givenAt)}{a.notes ? ` · ${a.notes}` : ''}
                </Check>
              ))}
            </div>
          )}
          <Field label="Le pagas con">
            <select className={fieldCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
        </div>

        <div className="h-fit rounded-ctl bg-surface-2 p-4">
          <p className="mb-2 text-table font-medium">{KIND_LABEL[kind]}{kind === 'REGULAR' ? ` · ${periodLabel(from, to)}` : ''}</p>
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
          {net < 0 && <p className="mt-2 text-meta text-bad-ink">Los descuentos superan lo ganado. Quita algún adelanto para el siguiente pago.</p>}
          {preview && preview.employerHealth > 0 && (
            <p className="mt-3 text-meta text-ink-muted">
              Aparte pagas {employee.laborRegime === 'GENERAL' ? 'EsSalud' : 'SIS'} aprox. {formatCurrency(preview.employerHealth)}. Lo retenido y la salud quedan como gastos por pagar para tu contador.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

