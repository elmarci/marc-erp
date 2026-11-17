// Ventanas de un producto en Stock actual: comparar precios entre proveedores,
// historial de costo promedio y ajuste rápido de stock.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, Modal, StatusBadge, fieldCls, tableCls, tdCls, thCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCost, formatCurrency, formatDateTime } from '@/lib/utils';
import { ADJUSTMENT_REASONS, adjustmentReasonLabel } from './adjustmentReasons';
import { MOV_LABELS, signedQty, type StockProduct, type SupplierPrice } from './types';

/* ─── Comparar precios (mismo producto, distintos proveedores) ──────────── */
export function PriceComparisonModal({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['product-suppliers', product.id],
    queryFn: async () => (await api.get<{ data: SupplierPrice[] }>(`/products/${product.id}/suppliers`)).data.data,
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Comparar precios" description={product.name}
      footer={<Btn onClick={onClose}>Cerrar</Btn>}>
      {isLoading ? <div className="py-8 text-center text-table text-ink-muted">Cargando…</div>
        : !data || data.length === 0 ? (
          <p className="py-6 text-center text-table text-ink-muted">
            Ningún proveedor tiene este producto registrado en su catálogo todavía. Se registra solo al comprarlo,
            o puedes agregarlo a mano desde Compras, pestaña Proveedores, Catálogo.
          </p>
        ) : (
          <div className="-mx-5 -my-4">
            <table className={tableCls}>
              <thead><tr>
                <th className={cn(thCls, 'pl-5')}>Proveedor</th>
                <th className={cn(thCls, 'text-right')}>Precio</th>
                <th className={cn(thCls, 'pr-5 text-right')}>Última compra</th>
              </tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.supplierId}>
                    <td className={cn(tdCls, 'pl-5')}>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {s.isPreferred && <Star className="size-3.5 fill-warn text-warn" aria-label="Preferido" />}{s.supplierName}
                      </span>
                    </td>
                    <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>
                      {formatCurrency(s.price)}
                      {s.isCheapest && <div><StatusBadge tone="ok">más barato</StatusBadge></div>}
                    </td>
                    <td className={cn(tdCls, 'pr-5 text-right text-meta text-ink-muted')}>{s.lastPurchaseAt ? formatDateTime(s.lastPurchaseAt) : 'Sin compras aún'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Modal>
  );
}

/* ─── Historial de costos (kardex de costo promedio ponderado) ──────────── */
interface CostHistoryEntry {
  id: string; date: string; type: string; quantity: number;
  unitCost: number | null; avgCostBefore: number | null; avgCostAfter: number | null; notes: string | null;
}
export function CostHistoryModal({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['product-cost-history', product.id],
    queryFn: async () => (await api.get<{ data: { productName: string; currentCost: number; history: CostHistoryEntry[] } }>(`/products/${product.id}/cost-history`)).data.data,
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title="Historial de costos" description={product.name}
      footer={<Btn onClick={onClose}>Cerrar</Btn>}>
      {isLoading ? <div className="py-8 text-center text-table text-ink-muted">Cargando…</div>
        : !data || data.history.length === 0 ? (
          <p className="py-6 text-center text-table text-ink-muted">
            Este producto todavía no tiene compras registradas con costo promedio. El costo actual
            (S/ {data ? data.currentCost.toFixed(2) : product.cost_price.toFixed(2)}) es el que se ingresó al crearlo.
          </p>
        ) : (
          <div className="-mx-5 -my-4 overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={cn(thCls, 'pl-5')}>Fecha</th>
                <th className={thCls}>Movimiento</th>
                <th className={cn(thCls, 'text-right')}>Cant.</th>
                <th className={cn(thCls, 'text-right')}>Costo entrada</th>
                <th className={cn(thCls, 'text-right')}>Prom. antes</th>
                <th className={cn(thCls, 'pr-5 text-right')}>Prom. después</th>
              </tr></thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className={cn(tdCls, 'whitespace-nowrap pl-5 text-meta text-ink-muted')}>{formatDateTime(h.date)}</td>
                    <td className={tdCls}>{MOV_LABELS[h.type] ?? h.type}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums', h.quantity < 0 && 'text-bad-ink')}>{signedQty(h.quantity)}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>{h.unitCost != null ? formatCost(h.unitCost) : '—'}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums text-ink-muted')}>{h.avgCostBefore != null ? formatCost(h.avgCostBefore) : '—'}</td>
                    <td className={cn(tdCls, 'pr-5 text-right font-medium tabular-nums')}>{h.avgCostAfter != null ? formatCost(h.avgCostAfter) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Modal>
  );
}

/* ─── Ajuste rápido ─────────────────────────────────────────────────────── */
export function QuickAdjustModal({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(String(product.current_stock));
  const [reasonCode, setReasonCode] = useState('COUNT');
  const [reason, setReason] = useState('');
  const diff = Number(qty) - product.current_stock;
  const isLossReason = ADJUSTMENT_REASONS.some((r) => r.code === reasonCode && r.loss);
  const effectiveCode = diff > 0 && isLossReason ? 'COUNT' : reasonCode;

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/quick-adjust', {
      productId: product.id, newQuantity: Number(qty), reasonCode: effectiveCode,
      reason: reason.trim().length >= 3 ? reason.trim() : adjustmentReasonLabel(reasonCode),
    }),
    onSuccess: () => {
      ['inv-stock', 'inv-dashboard', 'inv-movements'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`Stock de "${product.name}" actualizado a ${qty} unidades.`);
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Ajuste rápido" description={product.name}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending}
        disabled={qty === '' || Number(qty) < 0 || diff === 0} onClick={() => mutation.mutate()}>Confirmar</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock actual"><div className="flex h-9 items-center font-medium tabular-nums text-ink">{product.current_stock} uds</div></Field>
          <Field label="Nuevo stock (uds)" hint={qty !== '' && diff !== 0 ? `${signedQty(diff)} unidades respecto al sistema` : undefined}>
            <input type="number" min={0} autoFocus value={qty} onChange={(e) => setQty(e.target.value)} className={cn(fieldCls, 'text-right tabular-nums')} />
          </Field>
        </div>
        <Field label="Motivo" hint={diff < 0 && isLossReason ? 'Se contará como merma en el estado de resultados.' : undefined}>
          <select className={fieldCls} value={effectiveCode} onChange={(e) => setReasonCode(e.target.value)}>
            {ADJUSTMENT_REASONS.filter((r) => diff <= 0 || !r.loss).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Detalle (opcional)">
          <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: 3 yogures pasados de fecha" />
        </Field>
      </div>
    </Modal>
  );
}

