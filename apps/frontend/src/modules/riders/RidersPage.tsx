import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Plus, Edit, Ban, CheckCircle2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { RiderFormModal, type RiderFormValues } from './RiderFormModal';

interface Rider {
  id: string; nombre: string; telefono: string; status: string; enServicio: boolean;
  motoModelo: string | null; motoPlaca: string | null; motoSoatHasta: string | null;
  zonas: string[]; lastLocationAt: string | null;
}

interface LiquidacionAdmin {
  id: string; riderNombre: string; riderTelefono: string;
  monto: number; metodo: string; estado: string; pedidos: string[]; fecha: string;
}

export function RidersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'riders' | 'liquidaciones'>('riders');
  const [editing, setEditing] = useState<RiderFormValues | 'new' | null>(null);

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Repartidores</h1>
        {tab === 'riders' && (
          <Button onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" />Nuevo repartidor</Button>
        )}
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('riders')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'riders' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Repartidores
        </button>
        <button
          onClick={() => setTab('liquidaciones')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'liquidaciones' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          Liquidaciones pendientes
        </button>
      </div>

      {tab === 'riders' ? (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Cargando...</div>
            ) : (riders ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
                <Bike className="h-12 w-12 opacity-20" />
                <p>No hay repartidores registrados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Repartidor</th>
                      <th className="px-4 py-3 text-left font-medium">Moto</th>
                      <th className="px-4 py-3 text-center font-medium">En servicio</th>
                      <th className="px-4 py-3 text-center font-medium">Estado</th>
                      <th className="px-4 py-3 text-left font-medium">Última ubicación</th>
                      <th className="px-4 py-3 text-center font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(riders ?? []).map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.nombre}</p>
                          <p className="text-xs text-muted-foreground">{r.telefono}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.motoModelo ? `${r.motoModelo} · ${r.motoPlaca ?? 'sin placa'}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={r.enServicio ? 'success' : 'secondary'}>
                            {r.enServicio ? 'En servicio' : 'Desconectado'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={r.status === 'ACTIVE' ? 'success' : 'destructive'}>
                            {r.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.lastLocationAt ? formatDateTime(r.lastLocationAt) : 'Sin registro'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost" size="icon-sm"
                              onClick={() => setEditing({
                                id: r.id, nombre: r.nombre, telefono: r.telefono,
                                motoModelo: r.motoModelo ?? '', motoPlaca: r.motoPlaca ?? '',
                                motoSoatHasta: r.motoSoatHasta ? r.motoSoatHasta.slice(0, 10) : '',
                                zonas: r.zonas.join(', '),
                              })}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon-sm"
                              className={r.status === 'ACTIVE' ? 'text-destructive' : 'text-emerald-600'}
                              onClick={() => toggleStatusMutation.mutate({ id: r.id, status: r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                            >
                              {r.status === 'ACTIVE' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {loadingLiq ? (
              <div className="p-8 text-center text-muted-foreground">Cargando...</div>
            ) : (liquidaciones ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
                <Wallet className="h-12 w-12 opacity-20" />
                <p>No hay liquidaciones pendientes de pago</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Repartidor</th>
                      <th className="px-4 py-3 text-left font-medium">Pedidos</th>
                      <th className="px-4 py-3 text-center font-medium">Método</th>
                      <th className="px-4 py-3 text-right font-medium">Monto</th>
                      <th className="px-4 py-3 text-left font-medium">Solicitado</th>
                      <th className="px-4 py-3 text-center font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(liquidaciones ?? []).map((l) => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{l.riderNombre}</p>
                          <p className="text-xs text-muted-foreground">{l.riderTelefono}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.pedidos.join(', ')}</td>
                        <td className="px-4 py-3 text-center"><Badge variant="secondary">{l.metodo}</Badge></td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(l.monto)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(l.fecha)}</td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            loading={pagarMutation.isPending}
                            onClick={() => pagarMutation.mutate(l.id)}
                          >
                            Confirmar pago
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
      )}

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
