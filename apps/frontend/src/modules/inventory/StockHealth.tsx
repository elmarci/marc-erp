// Salud del stock: poner en oferta un lote por vencer, historial de un lote,
// conteo por categoría y productos sin movimiento.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, PackageX, Search, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, EmptyState, Field, Modal, Panel, Segmented, StatCard, StatGrid, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, formatDateTime, cn } from '@/lib/utils';

/* ─── Tipos ─────────────────────────────────────────────────────────────── */
export interface ShelfBatch {
  id: string; batchNumber: string | null; quantity: number; expiryDate: string; daysLeft: number;
  unitCost: number | null; supplierName: string | null; orderNumber: string | null;
  product: { id: string; name: string; currentStock: number; salePrice: number; category: { name: string } };
}

interface BatchHistory {
  id: string; batchNumber: string | null; quantity: string | number; initialQuantity: string | number | null;
  unitCost: string | number | null; expiryDate: string | null; createdAt: string;
  product: { name: string };
  purchaseOrder: { orderNumber: string; supplierInvoice: string | null; receivedDate: string | null } | null;
  supplier: { businessName: string } | null;
  movements: Array<{
    id: string; type: string; quantity: string | number; quantityAfter: string | number;
    referenceLabel: string | null; notes: string | null; createdAt: string;
  }>;
}

interface Category { id: string; name: string; parentId?: string | null }

const BATCH_MOV_LABELS: Record<string, string> = {
  RECEIVED: 'Entró con la compra', MANUAL: 'Registrado a mano', SALE: 'Venta', SALE_VOID: 'Venta anulada',
  SUPPLIER_RETURN: 'Devuelto al proveedor', SUPPLIER_RETURN_VOID: 'Devolución anulada',
  PURCHASE_VOID: 'Compra anulada', RESOLVED: 'Cerrado', RECONCILE: 'Cuadre con el stock', EDIT: 'Corregido',
};

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short' });

/* ─── Poner en oferta un lote que vence pronto ──────────────────────────── */
export function PromoteBatchModal({ batch, onClose }: { batch: ShelfBatch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const suggested = batch.daysLeft <= 2 ? 30 : batch.daysLeft <= 4 ? 20 : 15;
  const [percent, setPercent] = useState(String(suggested));
  const [inStore, setInStore] = useState(true);
  const pct = Number(percent);
  const price = batch.product.salePrice;
  const newPrice = Math.round(price * (1 - pct / 100) * 10) / 10;
  const belowCost = batch.unitCost != null && newPrice < batch.unitCost;
  // La oferta dura hasta el último minuto del día de vencimiento, hora Lima.
  const endDate = `${batch.expiryDate.slice(0, 10)}T23:59:59-05:00`;

  const mutation = useMutation({
    mutationFn: () => api.post('/promotions', {
      name: `${batch.product.name} por vencer`,
      description: `Lote ${batch.batchNumber ?? ''} vence el ${shortDate(batch.expiryDate)}`.replace('  ', ' '),
      type: 'PERCENTAGE_DISCOUNT',
      value: pct,
      startDate: new Date().toISOString(),
      endDate,
      isActive: true,
      showInStore: inStore,
      storeBadge: inStore ? `-${pct}%` : undefined,
      productIds: [batch.product.id],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(`Oferta creada: ${batch.product.name} a ${formatCurrency(newPrice)} hasta el ${shortDate(batch.expiryDate)}.`);
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Poner en oferta" description={batch.product.name}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" loading={mutation.isPending} disabled={!(pct > 0 && pct < 100)} onClick={() => mutation.mutate()}>Crear oferta</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <p className="text-table text-ink-muted">
          Quedan {batch.quantity} en este lote y vence {batch.daysLeft <= 0 ? 'hoy' : `en ${batch.daysLeft} día${batch.daysLeft === 1 ? '' : 's'}`}.
          La oferta termina sola ese día.
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Descuento</span>
          <Segmented value={[10, 15, 20, 30, 50].includes(pct) ? String(pct) : ''} onChange={setPercent} ariaLabel="Descuento"
            options={[['10', '10%'], ['15', '15%'], ['20', '20%'], ['30', '30%'], ['50', '50%']]} />
          <input type="number" min={1} max={99} value={percent} onChange={(e) => setPercent(e.target.value)}
            className={cn(fieldCls, 'tabular-nums')} aria-label="Otro porcentaje" />
        </div>
        <div className="flex flex-col gap-1 rounded-ctl bg-surface-2 p-3 text-table">
          <div className="flex justify-between"><span className="text-ink-muted">Precio normal</span><span className="tabular-nums">{formatCurrency(price)}</span></div>
          <div className="flex justify-between font-semibold"><span>Precio en oferta</span><span className="tabular-nums">{formatCurrency(newPrice)}</span></div>
          {batch.unitCost != null && (
            <div className="flex justify-between text-ink-muted"><span>Te costó</span><span className="tabular-nums">{formatCost(batch.unitCost)}</span></div>
          )}
          {belowCost && <p className="mt-1 text-warn-ink">Vendes por debajo del costo, pero recuperas algo antes de que se venza.</p>}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-table">
          <Check checked={inStore} onChange={() => setInStore((v) => !v)} label="Mostrarla también en la tienda online" />
          Mostrarla también en la tienda online
        </label>
        <p className="text-meta text-ink-muted">El descuento aplica al producto en caja y en la tienda, no solo a este lote.</p>
      </div>
    </Modal>
  );
}

/* ─── Historial de un lote ──────────────────────────────────────────────── */
export function BatchHistoryModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-batch', batchId],
    queryFn: async () => (await api.get<{ data: BatchHistory }>(`/inventory/batches/${batchId}`)).data.data,
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title="Historial del lote" description={data?.product.name}
      footer={<Btn onClick={onClose}>Cerrar</Btn>}>
      {isLoading || !data ? <p className="py-8 text-center text-table text-ink-muted">Cargando…</p> : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Lote" value={data.batchNumber ?? 'Sin número'} />
            <Fact label="Vence" value={data.expiryDate ? shortDate(data.expiryDate) : 'Sin fecha'} />
            <Fact label="Entraron / quedan" value={`${Number(data.initialQuantity ?? data.quantity)} / ${Number(data.quantity)}`} />
            <Fact label="Costo unitario" value={data.unitCost != null ? formatCost(Number(data.unitCost)) : 'No registrado'} />
            <Fact label="Proveedor" value={data.supplier?.businessName ?? 'No registrado'} />
            <Fact label="Compra" value={data.purchaseOrder ? data.purchaseOrder.orderNumber : 'Registrado a mano'} />
            {data.purchaseOrder?.supplierInvoice && <Fact label="Comprobante" value={data.purchaseOrder.supplierInvoice} />}
          </div>
          <div className="divide-y divide-line rounded-ctl border border-line">
            {data.movements.length === 0 && <p className="p-4 text-table text-ink-muted">Este lote es anterior al historial.</p>}
            {data.movements.map((m) => {
              const q = Number(m.quantity);
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-table">
                  <div className="min-w-0">
                    <p className="font-medium">{BATCH_MOV_LABELS[m.type] ?? m.type}{m.referenceLabel ? ` ${m.referenceLabel}` : ''}</p>
                    <p className="text-meta text-ink-muted">{formatDateTime(m.createdAt)}{m.notes ? ` · ${m.notes}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn('font-semibold', q < 0 && 'text-bad-ink')}>{q > 0 ? '+' : ''}{q}</p>
                    <p className="text-meta text-ink-muted">quedan {Number(m.quantityAfter)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-meta text-ink-muted">{label}</p>
      <p className="truncate text-table font-medium text-ink">{value}</p>
    </div>
  );
}

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ data: Category[] }>('/categories')).data.data,
  });
}

/* ─── Conteo por categoría ──────────────────────────────────────────────── */
interface CountSheet {
  lastCountAt: string | null;
  products: Array<{ id: string; name: string; barcode: string | null; category: string; currentStock: number; costPrice: number; unit: string }>;
}

export function CycleCountTab() {
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['inv-count-sheet', categoryId],
    queryFn: async () => (await api.get<{ data: CountSheet }>('/inventory/count-sheet', { params: { categoryId } })).data.data,
    enabled: !!categoryId,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sheet?.products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.barcode?.includes(q));
  }, [sheet, search]);

  const counted = (sheet?.products ?? []).filter((p) => counts[p.id] !== undefined && counts[p.id] !== '');
  const diffs = counted.map((p) => ({ p, diff: Number(counts[p.id]) - p.currentStock })).filter((d) => Math.abs(d.diff) > 0.0005);
  const diffValue = diffs.reduce((s, d) => s + d.diff * d.p.costPrice, 0);
  const categoryName = categories?.find((c) => c.id === categoryId)?.name ?? '';

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/adjustments', {
      reason: `Conteo de ${categoryName}`,
      reasonCode: 'COUNT',
      notes: `${counted.length} productos contados, ${diffs.length} con diferencia`,
      items: counted.map((p) => ({ productId: p.id, physicalQuantity: Number(counts[p.id]) })),
    }),
    onSuccess: () => {
      ['inv-count-sheet', 'inv-stock', 'inv-dashboard', 'inv-movements', 'inv-adjustments', 'inv-expiry'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(diffs.length ? `Conteo guardado. Se corrigieron ${diffs.length} productos.` : 'Conteo guardado. Todo cuadraba.');
      setCounts({});
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="¿Qué categoría vas a contar hoy?" className="flex-1 sm:max-w-xs">
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setCounts({}); }} className={fieldCls}>
            <option value="">Elige una categoría</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {sheet && (
          <p className="pb-2 text-table text-ink-muted">
            {sheet.lastCountAt ? `Último conteo: ${formatDateTime(sheet.lastCountAt)}` : 'Esta categoría nunca se ha contado.'}
          </p>
        )}
      </div>

      {!categoryId && (
        <Panel title="Conteo por categoría">
          <EmptyState icon={ClipboardCheck} title="Cuenta una categoría distinta cada día. En unas semanas habrás revisado toda la tienda sin cerrar." />
        </Panel>
      )}

      {categoryId && isLoading && <p className="py-8 text-center text-table text-ink-muted">Cargando…</p>}

      {sheet && (
        <Panel title={categoryName} meta={`${sheet.products.length} productos`}>
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar o escanear" className={cn(fieldCls, 'pl-8')} aria-label="Buscar producto" />
            </div>
          </div>
          <div className="divide-y divide-line">
            {rows.map((p) => {
              const v = counts[p.id];
              const diff = v !== undefined && v !== '' ? Number(v) - p.currentStock : null;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-table font-medium">{p.name}</p>
                    <p className="text-meta text-ink-muted">Sistema: {p.currentStock} {p.unit}</p>
                  </div>
                  {diff !== null && Math.abs(diff) > 0.0005 && (
                    <span className={cn('text-table font-semibold tabular-nums', diff < 0 && 'text-bad-ink')}>
                      {diff > 0 ? '+' : ''}{Math.round(diff * 1000) / 1000}
                    </span>
                  )}
                  {diff !== null && Math.abs(diff) <= 0.0005 && <span className="text-meta text-ink-muted">Cuadra</span>}
                  <input type="number" inputMode="decimal" min={0} value={v ?? ''} placeholder="Hay"
                    onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                    className={cn(fieldCls, 'w-20 text-right tabular-nums')} aria-label={`Cantidad contada de ${p.name}`} />
                </div>
              );
            })}
            {rows.length === 0 && <p className="p-6 text-center text-table text-ink-muted">No hay productos activos en esta categoría.</p>}
          </div>
        </Panel>
      )}

      {counted.length > 0 && (
        <div className="sticky bottom-0 flex flex-col gap-3 rounded-srf bg-surface p-3 shadow-[0_-4px_16px_-6px_rgba(0,0,0,.12),0_0_0_1px_hsl(var(--line))] sm:flex-row sm:items-center">
          <p className="flex-1 text-table">
            <strong>{counted.length}</strong> contados, <strong>{diffs.length}</strong> con diferencia
            {diffs.length > 0 && <> ({diffValue < 0 ? 'faltan' : 'sobran'} <strong>{formatCurrency(Math.abs(diffValue))}</strong> al costo)</>}.
            Lo que no cuentes no se toca.
          </p>
          <Btn variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>Guardar conteo</Btn>
        </div>
      )}
    </div>
  );
}

/* ─── Productos sin movimiento ──────────────────────────────────────────── */
interface NoMovement {
  days: number;
  items: Array<{
    productId: string; name: string; category: string; stock: number; costPrice: number; salePrice: number;
    value: number; lastSaleAt: string | null; lastPurchaseAt: string | null; daysWithoutSale: number | null;
  }>;
  totals: { products: number; value: number };
}

export function NoMovementTab() {
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const [days, setDays] = useState<'30' | '60' | '90'>('60');
  const [categoryId, setCategoryId] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inv-no-movement', Number(days), categoryId],
    queryFn: async () => (await api.get<{ data: NoMovement }>('/inventory/no-movement', { params: { days: Number(days), categoryId: categoryId || undefined } })).data.data,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={days} onChange={setDays} ariaLabel="Días sin venta"
          options={[['30', '30 días'], ['60', '60 días'], ['90', '90 días']]} />
        <select aria-label="Categoría" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cn(fieldCls, 'h-8 w-auto min-w-[180px] sm:ml-auto')}>
          <option value="">Todas las categorías</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {data && (
        <StatGrid cols={2}>
          <StatCard label={`Productos sin venderse en ${days} días`} value={data.totals.products} />
          <StatCard label="Plata parada (al costo)" value={formatCurrency(data.totals.value)} />
        </StatGrid>
      )}

      <Panel title="Lo que no se vende" meta="ordenado por la plata parada">
        <p className="border-b border-line px-4 py-2.5 text-table text-ink-muted">Ponlo en oferta, cámbialo de lugar o deja de comprarlo.</p>
        {isLoading || !data ? <p className="py-8 text-center text-table text-ink-muted">Cargando…</p> : data.items.length === 0 ? (
          <EmptyState icon={PackageX} title={`Todo lo que tiene stock se vendió en los últimos ${days} días.`} />
        ) : (
          <div className="divide-y divide-line">
            {data.items.map((i) => (
              <div key={i.productId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-table font-medium">{i.name}</p>
                  <p className="text-meta text-ink-muted">
                    {i.category} · {i.stock} en stock · {i.lastSaleAt ? `última venta hace ${i.daysWithoutSale} días` : 'nunca se vendió'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-table font-semibold tabular-nums">{formatCurrency(i.value)}</span>
                  <Btn size="sm" variant="ghost" onClick={() => navigate('/offers')}><Tag />Ofertar</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
