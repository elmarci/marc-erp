// Crear o editar un usuario: perfil, acceso (contraseña temporal) y horario
// de asistencia.
import { useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, Field, Modal, fieldCls, useConfirm } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS, STATUS_LABELS, cn } from '@/lib/utils';
import { DaySchedule, WEEKDAYS, WorkSchedule } from '@/modules/attendance/attendance';

export interface EditableUser {
  id: string; email: string; username: string; firstName: string; lastName: string;
  phone?: string | null; role: string; status: string; workSchedule?: WorkSchedule | null;
}

// Horario base del minimarket (se puede cambiar por persona).
const DEFAULT_SCHEDULE: WorkSchedule = {
  toleranceMinutes: 5,
  days: {
    1: { start: '07:30', end: '17:00', lunchStart: '13:30', lunchEnd: '14:30' },
    2: { start: '07:30', end: '17:00', lunchStart: '13:30', lunchEnd: '14:30' },
    3: { start: '07:30', end: '17:00', lunchStart: '13:30', lunchEnd: '14:30' },
    4: { start: '07:30', end: '17:00', lunchStart: '13:30', lunchEnd: '14:30' },
    5: { start: '07:30', end: '17:00', lunchStart: '13:30', lunchEnd: '14:30' },
    6: { start: '08:30', end: '13:30' },
  },
};

/** Contraseña temporal legible que cumple la política (mayúscula, minúscula, número). */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (x) => set[x % set.length]).join('');
  };
  return `${pick(upper, 1)}${pick(lower, 4)}-${pick(digits, 4)}`;
}

export function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success('Copiado.'),
    () => toast.error('No se pudo copiar.'),
  );
}

export function UserFormModal({ user, onClose, onSaved }: { user?: EditableUser; onClose: () => void; onSaved: () => void }) {
  const editing = !!user;
  const { hasRole } = useAuthStore();
  const confirm = useConfirm();
  const roles = Object.keys(ROLE_LABELS).filter((r) => r !== 'SUPER_ADMIN' || hasRole('SUPER_ADMIN'));

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState(user?.role ?? 'CASHIER');
  const [status, setStatus] = useState(user?.status ?? 'ACTIVE');
  const [password, setPassword] = useState(() => (editing ? '' : generateTempPassword()));
  const [trackAttendance, setTrackAttendance] = useState(editing ? !!user?.workSchedule : true);
  const [schedule, setSchedule] = useState<WorkSchedule>(user?.workSchedule ?? DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const setDay = (key: keyof WorkSchedule['days'], day: DaySchedule | undefined) =>
    setSchedule((s) => {
      const days = { ...s.days };
      if (day) days[key] = day; else delete days[key];
      return { ...s, days };
    });

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error('Nombre y apellidos son obligatorios.'); return; }
    if (!editing && (!username.trim() || !email.trim())) { toast.error('Usuario y correo son obligatorios.'); return; }
    if (trackAttendance && Object.keys(schedule.days).length === 0) { toast.error('Marca al menos un día de trabajo.'); return; }
    const workSchedule = trackAttendance ? schedule : null;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/users/${user!.id}`, {
          firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || undefined, role, status, workSchedule,
        });
        toast.success('Usuario actualizado.');
        onSaved();
      } else {
        await api.post('/users', {
          firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim(), email: email.trim(),
          phone: phone.trim() || undefined, role, password, workSchedule,
        });
        setCreated({ username: username.trim(), password });
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    const temp = generateTempPassword();
    const r = await confirm({
      title: `Restablecer la contraseña de ${user!.firstName}`,
      description: 'Deberá cambiarla al ingresar.',
      confirmLabel: 'Restablecer', tone: 'primary',
    });
    if (!r.ok) return;
    try {
      await api.post(`/users/${user!.id}/reset-password`, { password: temp });
      setCreated({ username: user!.username, password: temp });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (created) {
    const done = () => { onSaved(); onClose(); };
    return (
      <Modal open onOpenChange={(o) => !o && done()} size="sm" title="Acceso listo" description="Entrégale estos datos en persona"
        footer={<Btn variant="primary" onClick={done}>Listo</Btn>}>
        <div className="flex flex-col gap-3 rounded-ctl bg-surface-2 p-4">
          <Row label="Usuario" value={created.username} />
          <Row label="Contraseña temporal" value={created.password} />
        </div>
        <p className="mt-3 text-meta text-ink-muted">
          Al ingresar por primera vez el sistema le pedirá cambiarla. Esta contraseña no se vuelve a mostrar.
        </p>
      </Modal>
    );
  }

  const timeCls = cn(fieldCls, 'h-8 w-[8.25rem] tabular-nums');
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} keepOpen
      title={editing ? 'Editar usuario' : 'Nuevo usuario'} description={editing ? `@${user!.username}` : 'Perfil, acceso y horario'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={handleSave} loading={saving}>{editing ? 'Guardar cambios' : 'Crear usuario'}</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombres"><input className={fieldCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
          <Field label="Apellidos"><input className={fieldCls} value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuario">
              <input className={fieldCls} value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="ej. jperez" />
            </Field>
            <Field label="Correo"><input type="email" className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Perfil">
            <select className={fieldCls} value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          {editing ? (
            <Field label="Estado">
              <select className={fieldCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Teléfono"><input className={fieldCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
          )}
        </div>

        {!editing ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-table font-medium text-ink">Contraseña temporal</span>
            <div className="flex gap-2">
              <input aria-label="Contraseña temporal" value={password} readOnly className={cn(fieldCls, 'font-mono')} />
              <Btn onClick={() => setPassword(generateTempPassword())} aria-label="Generar otra"><RefreshCw /></Btn>
            </div>
          </div>
        ) : (
          <Btn onClick={resetPassword} className="justify-center"><KeyRound />Restablecer contraseña</Btn>
        )}

        <div className="rounded-ctl border border-line p-3">
          <label className="flex items-center gap-2 text-table font-medium text-ink">
            <Check checked={trackAttendance} onChange={() => setTrackAttendance((v) => !v)} label="Controlar asistencia con horario" />
            Controlar asistencia con horario
          </label>
          {trackAttendance && (
            <div className="mt-3 flex flex-col gap-1.5">
              {WEEKDAYS.map(({ key, long }) => {
                const day = schedule.days[key];
                const lunch = !!(day?.lunchStart && day?.lunchEnd);
                return (
                  <div key={key} className={cn('rounded-ctl px-2 py-2', day && 'bg-surface-2')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex w-28 items-center gap-2 text-table text-ink">
                        <Check checked={!!day} label={long}
                          onChange={() => setDay(key, day ? undefined : { start: '08:00', end: '17:00' })} />
                        {long}
                      </label>
                      {day ? (
                        <>
                          <input type="time" aria-label={`Entrada ${long}`} value={day.start} onChange={(e) => setDay(key, { ...day, start: e.target.value })} className={timeCls} />
                          <span className="text-ink-muted">a</span>
                          <input type="time" aria-label={`Salida ${long}`} value={day.end} onChange={(e) => setDay(key, { ...day, end: e.target.value })} className={timeCls} />
                        </>
                      ) : <span className="text-meta text-ink-muted">Libre</span>}
                    </div>
                    {day && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <label className="flex items-center gap-2 text-meta text-ink-muted">
                          <Check checked={lunch} label={`Almuerzo ${long}`}
                            onChange={() => setDay(key, !lunch
                              ? { ...day, lunchStart: '13:00', lunchEnd: '14:00' }
                              : { start: day.start, end: day.end })} />
                          Almuerzo
                        </label>
                        {lunch && (
                          <>
                            <input type="time" aria-label={`Inicio almuerzo ${long}`} value={day.lunchStart!} onChange={(e) => setDay(key, { ...day, lunchStart: e.target.value })} className={timeCls} />
                            <span className="text-ink-muted">a</span>
                            <input type="time" aria-label={`Fin almuerzo ${long}`} value={day.lunchEnd!} onChange={(e) => setDay(key, { ...day, lunchEnd: e.target.value })} className={timeCls} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-2 pt-2 text-table text-ink">
                <span>Tolerancia</span>
                <input type="number" min={0} max={60} aria-label="Tolerancia en minutos" value={schedule.toleranceMinutes}
                  onChange={(e) => setSchedule((s) => ({ ...s, toleranceMinutes: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }))}
                  className={cn(fieldCls, 'h-8 w-20 text-right tabular-nums')} />
                <span className="text-ink-muted">min antes de contar tardanza</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-meta text-ink-muted">{label}</p>
        <p className="font-mono text-section font-semibold text-ink">{value}</p>
      </div>
      <Btn size="sm" variant="ghost" onClick={() => copyText(value)} aria-label={`Copiar ${label.toLowerCase()}`}><Copy /></Btn>
    </div>
  );
}
