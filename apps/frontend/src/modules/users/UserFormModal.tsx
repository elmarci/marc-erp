import { useState } from 'react';
import { Copy, KeyRound, RefreshCw, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
    if (!confirm(`¿Restablecer la contraseña de ${user!.firstName}? Deberá cambiarla al ingresar.`)) return;
    try {
      await api.post(`/users/${user!.id}/reset-password`, { password: temp });
      setCreated({ username: user!.username, password: temp });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (created) {
    return (
      <Shell title="Acceso listo" subtitle="Entrégale estos datos en persona" onClose={() => { onSaved(); onClose(); }}>
        <div className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
          <Row label="Usuario" value={created.username} />
          <Row label="Contraseña temporal" value={created.password} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Al ingresar por primera vez el sistema le pedirá cambiarla. Esta contraseña no se vuelve a mostrar.
        </p>
        <Button className="mt-5 w-full" size="lg" onClick={() => { onSaved(); onClose(); }}>Listo</Button>
      </Shell>
    );
  }

  return (
    <Shell title={editing ? 'Editar usuario' : 'Nuevo usuario'} subtitle={editing ? `@${user!.username}` : 'Perfil, acceso y horario'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombres"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
          <Field label="Apellidos"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuario">
              <Input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="ej. jperez" />
            </Field>
            <Field label="Correo"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Perfil">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </Field>
          {editing ? (
            <Field label="Estado">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Teléfono"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
          )}
        </div>

        {!editing ? (
          <Field label="Contraseña temporal">
            <div className="flex gap-2">
              <Input value={password} readOnly className="font-mono" />
              <Button variant="outline" size="icon" onClick={() => setPassword(generateTempPassword())} aria-label="Generar otra"><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </Field>
        ) : (
          <Button variant="outline" className="w-full" onClick={resetPassword}><KeyRound className="mr-2 h-4 w-4" />Restablecer contraseña</Button>
        )}

        <div className="rounded-lg border p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={trackAttendance} onChange={(e) => setTrackAttendance(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Controlar asistencia con horario
          </label>
          {trackAttendance && (
            <div className="mt-4 space-y-2">
              {WEEKDAYS.map(({ key, long }) => {
                const day = schedule.days[key];
                const lunch = !!(day?.lunchStart && day?.lunchEnd);
                return (
                  <div key={key} className={cn('rounded-md px-2 py-2', day ? 'bg-muted/40' : '')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex w-28 items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!day} className="h-4 w-4"
                          onChange={(e) => setDay(key, e.target.checked ? { start: '08:00', end: '17:00' } : undefined)} />
                        {long}
                      </label>
                      {day ? (
                        <>
                          <Input type="time" value={day.start} onChange={(e) => setDay(key, { ...day, start: e.target.value })} className="h-9 w-[8.25rem]" />
                          <span className="text-muted-foreground">a</span>
                          <Input type="time" value={day.end} onChange={(e) => setDay(key, { ...day, end: e.target.value })} className="h-9 w-[8.25rem]" />
                        </>
                      ) : <span className="text-xs text-muted-foreground">Libre</span>}
                    </div>
                    {day && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-sm">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input type="checkbox" checked={lunch} className="h-3.5 w-3.5"
                            onChange={(e) => setDay(key, e.target.checked
                              ? { ...day, lunchStart: '13:00', lunchEnd: '14:00' }
                              : { start: day.start, end: day.end })} />
                          Almuerzo
                        </label>
                        {lunch && (
                          <>
                            <Input type="time" value={day.lunchStart!} onChange={(e) => setDay(key, { ...day, lunchStart: e.target.value })} className="h-8 w-[8.25rem]" />
                            <span className="text-muted-foreground">a</span>
                            <Input type="time" value={day.lunchEnd!} onChange={(e) => setDay(key, { ...day, lunchEnd: e.target.value })} className="h-8 w-[8.25rem]" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-2 text-sm">
                <span>Tolerancia</span>
                <Input type="number" min={0} max={60} value={schedule.toleranceMinutes}
                  onChange={(e) => setSchedule((s) => ({ ...s, toleranceMinutes: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }))}
                  className="h-9 w-20" />
                <span className="text-muted-foreground">min antes de contar tardanza</span>
              </div>
            </div>
          )}
        </div>

        <Button className="w-full" size="lg" onClick={handleSave} loading={saving}>
          {editing ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><UserPlus className="h-5 w-5 text-primary" /></div>
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-base font-semibold">{value}</p>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => copyText(value)} aria-label="Copiar"><Copy className="h-4 w-4" /></Button>
    </div>
  );
}
