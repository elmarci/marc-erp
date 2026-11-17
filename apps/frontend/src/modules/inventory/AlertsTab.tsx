// Alertas: margen bajo en productos de precio variable, lotes por vencer,
// productos sin stock y con stock bajo.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, EmptyState, Panel, StatusBadge, tableCls, tdCls, thCls, useConfirm } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { MarginAlert } from '@/lib/marginAlerts';
import { ResolveBatchModal } from './AdjustModals';
import { daysText, daysTone, daysUntil, type ExpiringBatch } from './types';

/* ─── Margen bajo (frutas, verduras y granel) ───────────────────────────── */
function MarginAlertsPanel() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const muteMutation = useMutation({
    mutationFn: (productId: string) => api.patch(`/products/${productId}`, { marginAlertMuted: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inv-margin-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inv-alerts-summary'] });
      toast.success('Listo: ya no se avisará el margen de este producto (puedes reactivarlo al editarlo).');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['inv-margin-alerts'],
    queryFn: async () => (await api.get<{ data: MarginAlert[]; minMargin: number }>('/inventory/alerts/margin')).data,
    refetchInterval: 60000,
  });
  const alerts = data?.data ?? [];
  if (isLoading || alerts.length === 0) return null;
  const minMargin = data?.minMargin ?? 1;

  const mute = async (a: MarginAlert) => {
    const r = await confirm({
      title: `No avisar más el margen de "${a.name}"`,
      description: 'Úsalo si se vende barato a propósito o el costo está en otra unidad.',
      confirmLabel: 'No avisar', tone: 'primary',
    });
    if (r.ok) muteMutation.mutate(a.productId);
  };

  return (
    <Panel title="Margen bajo" meta={`${alerts.length} producto(s)`}>
      <p className="border-b border-line px-4 py-2.5 text-table text-ink-muted">
        En frutas, verduras y productos por kg el último costo de compra deja menos de {formatCurrency(minMargin)} por kg o
        unidad contra tu precio de venta (en productos baratos el mínimo baja a la mitad del costo). Actualiza el precio
        cuando puedas, el sistema nunca lo cambia solo.
      </p>
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead><tr>
            <th className={thCls}>Producto</th>
            <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Último costo</th>
            <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Precio venta</th>
            <th className={cn(thCls, 'text-right')}>Margen</th>
            <th className={cn(thCls, 'text-right')}>Sugerido</th>
            <th className={thCls}><span className="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.productId} className="hover:bg-surface-2">
                <td className={cn(tdCls, 'py-1.5')}>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-meta text-ink-muted">
                    {a.category} · por {a.unit}
                    {a.lastPurchaseAt && <> · comprado {new Date(a.lastPurchaseAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short' })}</>}
                  </div>
                </td>
                <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{formatCurrency(a.lastPurchaseCost)}</td>
                <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{formatCurrency(a.salePrice)}</td>
                <td className={cn(tdCls, 'text-right')}>
                  <StatusBadge tone={a.severity === 'LOSS' ? 'bad' : 'warn'}>{a.margin <= 0 ? 'Pérdida ' : ''}{formatCurrency(a.margin)}</StatusBadge>
                </td>
                <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{formatCurrency(a.suggestedPrice)}</td>
                <td className={cn(tdCls, 'px-1')}>
                  <div className="flex items-center justify-end gap-1">
                    <Btn size="sm" onClick={() => navigate(`/products/${a.productId}/edit`)}>Editar precio</Btn>
                    <Btn size="sm" variant="ghost" title="No volver a avisar el margen de este producto"
                      loading={muteMutation.isPending && muteMutation.variables === a.productId} onClick={() => mute(a)}>No avisar</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function AlertsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-low-stock'],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; barcode: string | null; current_stock: number; min_stock: number; category: string }> }>('/inventory/low-stock')).data.data,
    refetchInterval: 60000,
  });
  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['inv-expiring-batches'],
    queryFn: async () => (await api.get<{ data: ExpiringBatch[] }>('/products/expiring-batches')).data.data,
    refetchInterval: 60000,
  });
  const [resolving, setResolving] = useState<ExpiringBatch | null>(null);

  const outOfStock = (data ?? []).filter((p) => p.current_stock === 0);
  const lowStock = (data ?? []).filter((p) => p.current_stock > 0);
  const expired = (batches ?? []).filter((b) => b.expiryDate && daysUntil(b.expiryDate) < 0);
  const expiringSoon = (batches ?? []).filter((b) => b.expiryDate && daysUntil(b.expiryDate) >= 0);

  return (
    <div className="flex flex-col gap-5">
      <MarginAlertsPanel />

      {!batchesLoading && (expired.length > 0 || expiringSoon.length > 0) && (
        <Panel title="Por vencer" meta={`${expired.length + expiringSoon.length} lote(s)`}>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Producto</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Lote</th>
                <th className={cn(thCls, 'text-right')}>Cantidad</th>
                <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Stock actual</th>
                <th className={thCls}>Vence</th>
                <th className={thCls}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {[...expired, ...expiringSoon].map((b) => {
                  const days = b.expiryDate ? daysUntil(b.expiryDate) : null;
                  return (
                    <tr key={b.id} className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="font-medium">{b.product.name}</div>
                        <div className="text-meta text-ink-muted">{b.product.category.name}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>{b.batchNumber ?? '—'}</td>
                      <td className={cn(tdCls, 'text-right tabular-nums')}>{b.quantity}</td>
                      <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{b.product.currentStock}</td>
                      <td className={tdCls}>{days != null && <StatusBadge tone={daysTone(days)}>{daysText(days)}</StatusBadge>}</td>
                      <td className={cn(tdCls, 'px-1 text-right')}><Btn size="sm" onClick={() => setResolving(b)}>Resolver</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div> : (
        <>
          {outOfStock.length > 0 && (
            <Panel title="Sin stock" meta={`${outOfStock.length} producto(s)`}>
              <div className="overflow-x-auto">
                <table className={tableCls}>
                  <thead><tr>
                    <th className={thCls}>Producto</th>
                    <th className={cn(thCls, 'hidden sm:table-cell')}>Categoría</th>
                    <th className={cn(thCls, 'text-right')}>Stock / mín.</th>
                  </tr></thead>
                  <tbody>
                    {outOfStock.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-2">
                        <td className={cn(tdCls, 'py-1.5')}>
                          <div className="font-medium">{p.name}</div>
                          {p.barcode && <div className="font-mono text-meta text-ink-muted">{p.barcode}</div>}
                        </td>
                        <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>{p.category}</td>
                        <td className={cn(tdCls, 'text-right font-semibold tabular-nums text-bad-ink')}>0 / {p.min_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel title="Stock bajo" meta={`${lowStock.length} producto(s)`}>
            {lowStock.length === 0 ? <EmptyState icon={Package} title="Todo el stock está en niveles normales." /> : (
              <div className="overflow-x-auto">
                <table className={tableCls}>
                  <thead><tr>
                    <th className={thCls}>Producto</th>
                    <th className={cn(thCls, 'hidden md:table-cell')}>Categoría</th>
                    <th className={cn(thCls, 'text-right')}>Stock</th>
                    <th className={cn(thCls, 'text-right')}>Mínimo</th>
                    <th className={cn(thCls, 'hidden w-40 sm:table-cell')}>% del mínimo</th>
                  </tr></thead>
                  <tbody>
                    {lowStock.map((p) => {
                      const pct = Math.round((p.current_stock / p.min_stock) * 100);
                      return (
                        <tr key={p.id} className="hover:bg-surface-2">
                          <td className={cn(tdCls, 'py-1.5')}>
                            <div className="font-medium">{p.name}</div>
                            {p.barcode && <div className="font-mono text-meta text-ink-muted">{p.barcode}</div>}
                          </td>
                          <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{p.category}</td>
                          <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{p.current_stock}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums text-ink-muted')}>{p.min_stock}</td>
                          <td className={cn(tdCls, 'hidden sm:table-cell')}>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                                <div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="w-9 text-right text-meta tabular-nums text-ink-muted">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {resolving && <ResolveBatchModal batch={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}
