// Seguridad del ingreso de un repartidor: código para autorizar su celular,
// celular autorizado, intentos fallidos, desbloquear y cerrar sesiones.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Smartphone, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Btn, Modal, StatusBadge, useConfirm } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatDateTime } from '@/lib/utils';

interface Security {
  bloqueadoHasta: string | null;
  pinSeguro: boolean;
  celulares: { id: string; label: string; createdAt: string; lastLoginAt: string | null }[];
  intentos: { id: string; motivo: string; dispositivo: string; createdAt: string }[];
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return 'vencido';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RiderSecurityModal({ rider, onClose }: { rider: { id: string; nombre: string }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const left = useCountdown(code?.expiresAt ?? null);

  const key = ['rider-security', rider.id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ data: Security }>(`/delivery/admin/riders/${rider.id}/security`)).data.data,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['riders'] });
  };

  const codeMutation = useMutation({
    mutationFn: async () => (await api.post<{ data: { code: string; expiresAt: string } }>(`/delivery/admin/riders/${rider.id}/activation-code`)).data.data,
    onSuccess: (c) => setCode(c),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const action = useMutation({
    mutationFn: (path: string) => api.post(`/delivery/admin/riders/${rider.id}/${path}`),
    onSuccess: () => { refresh(); toast.success('Listo.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const revoke = async (d: Security['celulares'][number]) => {
    const r = await confirm({
      title: `Quitar el celular ${d.label}`,
      description: `${rider.nombre} sale de la app en ese celular y necesitará un código nuevo para volver a entrar.`,
      confirmLabel: 'Quitar celular', tone: 'danger',
    });
    if (r.ok) action.mutate(`devices/${d.id}/revoke`);
  };
  const closeAll = async () => {
    const r = await confirm({
      title: `Cerrar las sesiones de ${rider.nombre}`,
      description: 'Sale de la app ahora. Puede volver a entrar con su PIN en su celular autorizado.',
      confirmLabel: 'Cerrar sesiones', tone: 'danger',
    });
    if (r.ok) action.mutate('close-sessions');
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="md" title={`Ingreso de ${rider.nombre}`}
      description="Solo entra desde el celular que autorices aquí."
      footer={<Btn onClick={onClose}>Cerrar</Btn>}>
      {isLoading || !data ? <div className="py-8 text-center text-ink-muted">Cargando…</div> : (
        <div className="flex flex-col gap-5">
          {data.bloqueadoHasta && (
            <div className="flex items-center justify-between gap-3 rounded-ctl bg-bad/10 px-3 py-2.5">
              <span className="text-table">Bloqueado por PIN errados hasta {formatDateTime(data.bloqueadoHasta)}</span>
              <Btn size="sm" onClick={() => action.mutate('unlock')}><Unlock />Desbloquear</Btn>
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-table font-semibold">Autorizar un celular</h3>
            {code && left !== 'vencido' ? (
              <div className="rounded-ctl bg-surface-2 px-4 py-3">
                <div className="text-[34px] font-semibold tabular-nums tracking-[0.14em]">{code.code.slice(0, 3)} {code.code.slice(3)}</div>
                <div className="text-meta text-ink-muted">Díctaselo en persona. Vence en {left} y sirve una sola vez. Al usarlo, su celular anterior queda fuera.</div>
              </div>
            ) : (
              <p className="text-meta text-ink-muted">Genera un código cuando el repartidor vaya a entrar desde un celular nuevo.</p>
            )}
            <div><Btn variant="primary" loading={codeMutation.isPending} onClick={() => codeMutation.mutate()}><KeyRound />{code ? 'Generar otro código' : 'Generar código'}</Btn></div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-table font-semibold">Celular autorizado</h3>
            {data.celulares.length === 0 ? <p className="text-meta text-ink-muted">Ninguno. No puede entrar hasta que le des un código.</p> : data.celulares.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="size-4 text-ink-muted" />
                  <div>
                    <div className="text-table">{d.label}</div>
                    <div className="text-meta text-ink-muted">Último ingreso {d.lastLoginAt ? formatDateTime(d.lastLoginAt) : 'sin registro'}</div>
                  </div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => revoke(d)}>Quitar</Btn>
              </div>
            ))}
            {!data.pinSeguro && <div><StatusBadge tone="warn">Aún usa PIN de 4 dígitos: la app le pedirá uno de 6</StatusBadge></div>}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-table font-semibold">Intentos fallidos</h3>
            {data.intentos.length === 0 ? <p className="text-meta text-ink-muted">Sin intentos fallidos.</p> : (
              <ul className="flex flex-col">
                {data.intentos.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 border-b border-line py-1.5 text-meta">
                    <span><span className="text-ink">{i.motivo}</span> · {i.dispositivo}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{formatDateTime(i.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div><Btn variant="danger" onClick={closeAll}><LogOut />Cerrar todas sus sesiones</Btn></div>
        </div>
      )}
    </Modal>
  );
}
