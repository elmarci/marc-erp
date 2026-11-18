// Repartidores: alta y edición, activar o desactivar, y pago de liquidaciones.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Bike, CheckCircle2, Pencil, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, EmptyState, PageHeader, PageTabs, RowMenu, StatusBadge, surfaceCls, tableCls, tdCls, thCls,
} from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { RiderFormModal, type RiderFormValues } from './RiderFormModal';
import { RiderSecurityModal } from './RiderSecurityModal';

interface Rider {
  id: string; nombre: string; telefono: string; status: string; enServicio: boolean;
  motoModelo: string | null; motoPlaca: string | null; motoSoatHasta: string | null;
  zonas: string[]; lastLocationAt: string | null;
  celularAutorizado: boolean; bloqueado: boolean;
}

interface LiquidacionAdmin {
  id: string; riderNombre: string; riderTelefono: string;
  monto: number; metodo: string; estado: string; pedidos: string[]; fecha: string;
}

export function RidersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'riders' | 'liquidaciones'>('riders');
  const [editing, setEditing] = useState<RiderFormValues | 'new' | null>(null);
  const [security, setSecurity] = useState<Rider | null>(null);

  const { data: riders, isLoading } = useQuery({
    queryKey: ['riders'],
    queryFn: async () => (await api.get<{ data: Rider[] }>('/delivery/admin/riders')).data.data,
  });

  const { data: liquidaciones, isLoading: loadingLiq } = useQuery({
    queryKey: ['riders-liquidaciones'],
    queryFn: async () => (await api.get<{ data: LiquidacionAdmin[] }>('/delivery/admin/liquidaciones?estado=SOLICITADA')).data.data,
    enabled: tab === 'liquidaciones',
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/delivery/admin/riders/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['riders'] }); toast.success('Repartidor actualizado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const pagarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/delivery/admin/liquidaciones/${id}/pagar`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['riders-liquidaciones'] }); toast.success('Pago confirmado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toForm = (r: Rider): RiderFormValues => ({
    id: r.id, nombre: r.nombre, telefono: r.telefono,
    motoModelo: r.motoModelo ?? '', motoPlaca: r.motoPlaca ?? '',
    motoSoatHasta: r.motoSoatHasta ? r.motoSoatHasta.slice(0, 10) : '',
    zonas: r.zonas.join(', '),
  });
  const loadingRow = <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>;

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Repartidores"
        actions={tab === 'riders' && <Btn variant="primary" onClick={() => setEditing('new')}><Plus />Nuevo repartidor</Btn>} />

      <PageTabs value={tab} onChange={setTab} tabs={[['riders', 'Repartidores'], ['liquidaciones', 'Liquidaciones pendientes']]} />

      <div className={cn('overflow-hidden', surfaceCls)}>
        {tab === 'riders' ? (
          isLoading ? loadingRow : (riders ?? []).length === 0 ? <EmptyState icon={Bike} title="No hay repartidores registrados" /> : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>Repartidor</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Moto</th>
                  <th className={thCls}>En servicio</th>
                  <th className={cn(thCls, 'hidden sm:table-cell')}>Estado</th>
                  <th className={cn(thCls, 'hidden lg:table-cell')}>Última ubicación</th>
                  <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
                </tr></thead>
                <tbody>
                  {(riders ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="font-medium">{r.nombre}</div>
                        <div className="text-meta tabular-nums text-ink-muted">{r.telefono}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{r.motoModelo ? `${r.motoModelo} · ${r.motoPlaca ?? 'sin placa'}` : '—'}</td>
                      <td className={tdCls}><StatusBadge tone={r.enServicio ? 'ok' : 'muted'}>{r.enServicio ? 'En servicio' : 'Desconectado'}</StatusBadge></td>
                      <td className={cn(tdCls, 'hidden sm:table-cell')}>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={r.status === 'ACTIVE' ? 'ok' : 'bad'}>{r.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</StatusBadge>
                          {r.bloqueado ? <StatusBadge tone="bad">Bloqueado</StatusBadge> : !r.celularAutorizado && r.status === 'ACTIVE' && <StatusBadge tone="warn">Sin celular</StatusBadge>}
                        </div>
                      </td>
                      <td className={cn(tdCls, 'hidden tabular-nums text-meta text-ink-muted lg:table-cell')}>{r.lastLocationAt ? formatDateTime(r.lastLocationAt) : 'Sin registro'}</td>
                      <td className={cn(tdCls, 'px-1')}>
                        <div className="flex items-center justify-end gap-1">
                          <Btn size="sm" onClick={() => setSecurity(r)}><ShieldCheck />Ingreso</Btn>
                          <Btn size="sm" onClick={() => setEditing(toForm(r))}><Pencil />Editar</Btn>
                          <RowMenu label={`Acciones de ${r.nombre}`} actions={[
                            r.status === 'ACTIVE'
                              ? { label: 'Desactivar', icon: Ban, danger: true, onSelect: () => toggleStatusMutation.mutate({ id: r.id, status: 'INACTIVE' }) }
                              : { label: 'Activar', icon: CheckCircle2, onSelect: () => toggleStatusMutation.mutate({ id: r.id, status: 'ACTIVE' }) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          loadingLiq ? loadingRow : (liquidaciones ?? []).length === 0 ? <EmptyState icon={Wallet} title="No hay liquidaciones pendientes de pago" /> : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>Repartidor</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Pedidos</th>
                  <th className={cn(thCls, 'hidden sm:table-cell')}>Método</th>
                  <th className={cn(thCls, 'text-right')}>Monto</th>
                  <th className={cn(thCls, 'hidden lg:table-cell')}>Solicitado</th>
                  <th className={cn(thCls, 'w-px')}><span className="sr-only">Acción</span></th>
                </tr></thead>
                <tbody>
                  {(liquidaciones ?? []).map((l) => (
                    <tr key={l.id} className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="font-medium">{l.riderNombre}</div>
                        <div className="text-meta tabular-nums text-ink-muted">{l.riderTelefono}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden text-meta text-ink-muted md:table-cell')}>{l.pedidos.join(', ')}</td>
                      <td className={cn(tdCls, 'hidden sm:table-cell')}><StatusBadge tone="neutral">{l.metodo}</StatusBadge></td>
                      <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{formatCurrency(l.monto)}</td>
                      <td className={cn(tdCls, 'hidden tabular-nums text-meta text-ink-muted lg:table-cell')}>{formatDateTime(l.fecha)}</td>
                      <td className={cn(tdCls, 'px-2')}>
                        <Btn size="sm" variant="primary" loading={pagarMutation.isPending && pagarMutation.variables === l.id}
                          disabled={pagarMutation.isPending} onClick={() => pagarMutation.mutate(l.id)}>
                          Confirmar pago
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {security && <RiderSecurityModal rider={security} onClose={() => setSecurity(null)} />}

      {editing && (
        <RiderFormModal
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['riders'] }); }}
        />
      )}
    </div>
  );
}
