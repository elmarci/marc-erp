import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, PackageX, ClipboardCheck, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const BATCH_MOV_LABELS: Record<string, string> = {
  RECEIVED: 'Entró con la compra', MANUAL: 'Registrado a mano', SALE: 'Venta', SALE_VOID: 'Venta anulada',
  SUPPLIER_RETURN: 'Devuelto al proveedor', SUPPLIER_RETURN_VOID: 'Devolución anulada',
  PURCHASE_VOID: 'Compra anulada', RESOLVED: 'Cerrado', RECONCILE: 'Cuadre con el stock', EDIT: 'Corregido',
};

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short' });

function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-start justify-between gap-3 p-4 pb-2">
          <div className="min-w-0">
            <h3 className="font-semibold">{title}</h3>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="flex gap-3 border-t p-4">{footer}</div>}
      </div>
    </div>
  );
}

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
    <Modal title="Poner en oferta" subtitle={batch.product.name} onClose={onClose}
      footer={<>
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" loading={mutation.isPending} disabled={!(pct > 0 && pct < 100)} onClick={() => mutation.mutate()}>
          Crear oferta
        </Button>
      </>}>
      <div className="space-y-4 pt-2">
        <p className="text-sm text-muted-foreground">
          Quedan {batch.quantity} en este lote y vence {batch.daysLeft <= 0 ? 'hoy' : `en ${batch.daysLeft} día${batch.daysLeft === 1 ? '' : 's'}`}.
          La oferta termina sola ese día.
        </p>
        <div>
          <p className="mb-2 text-sm font-medium">Descuento</p>
          <div className="flex gap-2">
            {[10, 15, 20, 30, 50].map((p) => (
              <button key={p} type="button" onClick={() => setPercent(String(p))}
                className={cn('flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
                  pct === p ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>
                {p}%
              </button>
            ))}
          </div>
          <Input type="number" min={1} max={99} value={percent} onChange={(e) => setPercent(e.target.value)} className="mt-2" aria-label="Otro porcentaje" />
        </div>
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Precio normal</span><span className="tabular-nums">{formatCurrency(price)}</span></div>
          <div className="flex justify-between font-semibold"><span>Precio en oferta</span><span className="tabular-nums">{formatCurrency(newPrice)}</span></div>
          {batch.unitCost != null && (
            <div className="flex justify-between text-muted-foreground"><span>Te costó</span><span className="tabular-nums">{formatCost(batch.unitCost)}</span></div>
          )}
          {belowCost && <p className="mt-2 text-amber-700 dark:text-amber-400">Vendes por debajo del costo, pero recuperas algo antes de que se venza.</p>}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={inStore} onChange={(e) => setInStore(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Mostrarla también en la tienda online
        </label>
        <p className="text-xs text-muted-foreground">El descuento aplica al producto en caja y en la tienda, no solo a este lote.</p>
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
    <Modal title="Historial del lote" subtitle={data?.product.name} onClose={onClose} wide>
      {isLoading || !data ? <p className="py-8 text-center text-muted-foreground">Cargando...</p> : (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Fact label="Lote" value={data.batchNumber ?? 'Sin número'} />
            <Fact label="Vence" value={data.expiryDate ? shortDate(data.expiryDate) : 'Sin fecha'} />
            <Fact label="Entraron / quedan" value={`${Number(data.initialQuantity ?? data.quantity)} / ${Number(data.quantity)}`} />
            <Fact label="Costo unitario" value={data.unitCost != null ? formatCost(Number(data.unitCost)) : 'No registrado'} />
            <Fact label="Proveedor" value={data.supplier?.businessName ?? 'No registrado'} />
            <Fact label="Compra" value={data.purchaseOrder ? data.purchaseOrder.orderNumber : 'Registrado a mano'} />
            {data.purchaseOrder?.supplierInvoice && <Fact label="Comprobante" value={data.purchaseOrder.supplierInvoice} />}
          </div>
          <div className="divide-y rounded-xl bg-muted/30">
            {data.movements.length === 0 && <p className="p-4 text-sm text-muted-foreground">Este lote es anterior al historial.</p>}
            {data.movements.map((m) => {
              const q = Number(m.quantity);
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{BATCH_MOV_LABELS[m.type] ?? m.type}{m.referenceLabel ? ` ${m.referenceLabel}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}{m.notes ? ` · ${m.notes}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn('font-semibold', q < 0 ? 'text-destructive' : 'text-primary')}>{q > 0 ? '+' : ''}{q}</p>
                    <p className="text-xs text-muted-foreground">quedan {Number(m.quantityAfter)}</p>
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="mb-1.5 text-sm font-medium">¿Qué categoría vas a contar hoy?</p>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setCounts({}); }} className={cn(selectClass, 'w-full sm:max-w-xs')}>
            <option value="">Elige una categoría</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {sheet && (
          <p className="text-sm text-muted-foreground">
            {sheet.lastCountAt ? `Último conteo: ${formatDateTime(sheet.lastCountAt)}` : 'Esta categoría nunca se ha contado.'}
          </p>
        )}
      </div>

      {!categoryId && (
        <div className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Cuenta una categoría distinta cada día. En unas semanas habrás revisado toda la tienda sin cerrar.
        </div>
      )}

      {categoryId && isLoading && <p className="py-8 text-center text-muted-foreground">Cargando...</p>}

      {sheet && (
        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar o escanear" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map((p) => {
                const v = counts[p.id];
                const diff = v !== undefined && v !== '' ? Number(v) - p.currentStock : null;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Sistema: {p.currentStock} {p.unit}</p>
                    </div>
                    {diff !== null && Math.abs(diff) > 0.0005 && (
                      <span className={cn('text-sm font-semibold tabular-nums', diff < 0 ? 'text-destructive' : 'text-primary')}>
                        {diff > 0 ? '+' : ''}{Math.round(diff * 1000) / 1000}
                      </span>
                    )}
                    {diff !== null && Math.abs(diff) <= 0.0005 && <span className="text-xs text-muted-foreground">Cuadra</span>}
                    <Input type="number" inputMode="decimal" min={0} value={v ?? ''} placeholder="Hay"
                      onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                      className="h-10 w-20 text-center" aria-label={`Cantidad contada de ${p.name}`} />
                  </div>
                );
              })}
              {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No hay productos activos en esta categoría.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {counted.length > 0 && (
        <div className="sticky bottom-0 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-lg ring-1 ring-border sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <strong>{counted.length}</strong> contados, <strong>{diffs.length}</strong> con diferencia
            {diffs.length > 0 && <> ({diffValue < 0 ? 'faltan' : 'sobran'} <strong>{formatCurrency(Math.abs(diffValue))}</strong> al costo)</>}.
            Lo que no cuentes no se toca.
          </p>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>Guardar conteo</Button>
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
  const [days, setDays] = useState(60);
  const [categoryId, setCategoryId] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inv-no-movement', days, categoryId],
    queryFn: async () => (await api.get<{ data: NoMovement }>('/inventory/no-movement', { params: { days, categoryId: categoryId || undefined } })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[30, 60, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={cn('rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              days === d ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>
            {d} días
          </button>
        ))}
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={cn(selectClass, 'ml-auto')}>
          <option value="">Todas las categorías</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Productos sin venderse en {days} días</p>
            <p className="text-2xl font-bold tabular-nums">{data.totals.products}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Plata parada (al costo)</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(data.totals.value)}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lo que no se vende</CardTitle>
          <p className="text-sm text-muted-foreground">Ordenado por la plata que tiene parada. Ponlo en oferta, cámbialo de lugar o deja de comprarlo.</p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading || !data ? <p className="py-8 text-center text-muted-foreground">Cargando...</p> : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <PackageX className="h-10 w-10 opacity-20" />
              <p>Todo lo que tiene stock se vendió en los últimos {days} días.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.items.map((i) => (
                <div key={i.productId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.category} · {i.stock} en stock · {i.lastSaleAt ? `última venta hace ${i.daysWithoutSale} días` : 'nunca se vendió'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(i.value)}</p>
                    <button type="button" onClick={() => navigate('/promotions')} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Tag className="h-3 w-3" />Ofertar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
