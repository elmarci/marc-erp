// Vencimientos: stock que controla vencimiento pero no tiene fecha, y los
// lotes con fecha que siguen en el estante (filtrar, ofertar, resolver).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Tag } from 'lucide-react';
import { Btn, EmptyState, Panel, Segmented, StatusBadge, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCost } from '@/lib/utils';
import { RegisterBatchModal, ResolveBatchModal } from './AdjustModals';
import { BatchHistoryModal, PromoteBatchModal, type ShelfBatch } from './StockHealth';
import { daysText, daysTone, type ExpiringBatch, type ExpiryControl, type UncoveredRow } from './types';

type ExpiryFilter = 'all' | 'expired' | 'week' | 'month' | 'later';

export function ExpiryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-expiry'],
    queryFn: async () => (await api.get<{ data: ExpiryControl }>('/inventory/expiry')).data.data,
    refetchInterval: 60000,
  });
  const [filter, setFilter] = useState<ExpiryFilter>('all');
  const [resolving, setResolving] = useState<ExpiringBatch | null>(null);
  const [registering, setRegistering] = useState<UncoveredRow | null>(null);
  const [promoting, setPromoting] = useState<ShelfBatch | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  if (isLoading || !data) return <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>;

  const batches = data.batches;
  const visible = batches.filter((b) => {
    if (filter === 'expired') return b.daysLeft < 0;
    if (filter === 'week') return b.daysLeft >= 0 && b.daysLeft <= 7;
    if (filter === 'month') return b.daysLeft > 7 && b.daysLeft <= 30;
    if (filter === 'later') return b.daysLeft > 30;
    return true;
  });
  const later = batches.filter((b) => b.daysLeft > 30).length;
  const count = (n: number) => <span className="ml-1 tabular-nums text-ink-muted">{n}</span>;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-srf border border-line bg-surface-2 px-4 py-3 text-table text-ink-muted">
        <p className="mb-1 font-medium text-ink">Cómo funciona el control de vencimientos</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Lácteos, panadería, carnes y embutidos <strong className="text-ink">exigen fecha de vencimiento</strong> al registrar o recibir una compra.</li>
          <li>Cada venta descuenta del lote que vence primero, así esta lista muestra solo lo que sigue en el estante.</li>
          <li>Lo que ya estaba en stock sin fecha aparece abajo en <strong className="text-ink">«Sin fecha registrada»</strong>: asígnale su fecha para controlarlo.</li>
        </ul>
      </div>

      {data.uncovered.length > 0 && (
        <Panel title="Sin fecha registrada" meta={`${data.uncovered.length} producto(s)`}>
          <p className="border-b border-line px-4 py-2.5 text-table text-ink-muted">
            Productos que controlan vencimiento pero tienen stock del que nadie sabe cuándo vence.
          </p>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Producto</th>
                <th className={cn(thCls, 'text-right')}>Stock</th>
                <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Con fecha</th>
                <th className={cn(thCls, 'text-right')}>Sin fecha</th>
                <th className={thCls}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {data.uncovered.map((u) => (
                  <tr key={u.productId} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-meta text-ink-muted">{u.category}</div>
                    </td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>{u.stock}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums text-ink-muted sm:table-cell')}>{u.covered}</td>
                    <td className={cn(tdCls, 'text-right font-semibold tabular-nums text-warn-ink')}>{u.uncovered}</td>
                    <td className={cn(tdCls, 'px-1 text-right')}><Btn size="sm" onClick={() => setRegistering(u)}>Registrar fecha</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Lotes con fecha de vencimiento">
        <div className="border-b border-line p-3">
          <Segmented value={filter} onChange={setFilter} ariaLabel="Filtrar lotes"
            options={[
              ['all', <>Todos{count(batches.length)}</>],
              ['expired', <>Vencidos{count(data.summary.expired)}</>],
              ['week', <>Vencen en 7 días{count(data.summary.within7)}</>],
              ['month', <>Vencen en 30 días{count(data.summary.within30)}</>],
              ['later', <>Más adelante{count(later)}</>],
            ]} />
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={Package} title={batches.length === 0 ? 'Aún no hay lotes con fecha registrada.' : 'Nada en esta categoría.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Producto</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Lote</th>
                <th className={cn(thCls, 'text-right')}>Cantidad</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Vence</th>
                <th className={thCls}>Faltan</th>
                <th className={thCls}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {visible.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div className="font-medium">{b.product.name}</div>
                      <div className="text-meta text-ink-muted">{b.product.category.name}</div>
                    </td>
                    <td className={cn(tdCls, 'hidden md:table-cell')}>
                      <button type="button" onClick={() => setHistoryId(b.id)} className="text-left hover:underline">
                        <div>{b.batchNumber ?? 'Sin número'}</div>
                        <div className="text-meta text-ink-muted">
                          {b.orderNumber ? `${b.orderNumber}${b.supplierName ? ` · ${b.supplierName}` : ''}` : 'Ver historial'}
                          {b.unitCost != null ? ` · costo ${formatCost(b.unitCost)}` : ''}
                        </div>
                      </button>
                    </td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>{b.quantity}</td>
                    <td className={cn(tdCls, 'hidden whitespace-nowrap tabular-nums sm:table-cell')}>
                      {new Date(b.expiryDate).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className={tdCls}><StatusBadge tone={b.daysLeft < 0 ? 'bad' : daysTone(b.daysLeft)}>{daysText(b.daysLeft, true)}</StatusBadge></td>
                    <td className={cn(tdCls, 'px-1')}>
                      <div className="flex items-center justify-end gap-1">
                        {b.daysLeft >= 0 && b.daysLeft <= 7 && <Btn size="sm" variant="primary" onClick={() => setPromoting(b)}><Tag />Poner en oferta</Btn>}
                        <Btn size="sm" onClick={() => setResolving({ ...b, product: { ...b.product, unitOfMeasure: '' } })}>Resolver</Btn>
                        <Btn size="sm" variant="ghost" className="md:hidden" onClick={() => setHistoryId(b.id)}>Historial</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {resolving && <ResolveBatchModal batch={resolving} onClose={() => setResolving(null)} />}
      {registering && <RegisterBatchModal row={registering} onClose={() => setRegistering(null)} />}
      {promoting && <PromoteBatchModal batch={promoting} onClose={() => setPromoting(null)} />}
      {historyId && <BatchHistoryModal batchId={historyId} onClose={() => setHistoryId(null)} />}
    </div>
  );
}
