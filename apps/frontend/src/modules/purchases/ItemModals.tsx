import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Btn } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export function EditOrderItemModal({ order, item, onClose, onEdited }: {
  order: { id: string; orderNumber: string };
  item: { id: string; name: string; orderedQty: number; unitCost: number };
  onClose: () => void; onEdited: () => void;
}) {
  const [orderedQty, setOrderedQty] = useState(String(item.orderedQty));
  const [unitCost, setUnitCost] = useState(String(item.unitCost));
  const queryClient = useQueryClient();

  const qtyNum = parseFloat(orderedQty) || 0;
  const costNum = parseFloat(unitCost) || 0;
  const hasChanges = qtyNum !== item.orderedQty || costNum !== item.unitCost;

  const mutation = useMutation({
    mutationFn: () => api.patch(`/purchases/${order.id}/items/${item.id}`, { orderedQty: qtyNum, unitCost: costNum }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Línea actualizada.');
      onEdited();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="sm" keepOpen
      title="Editar línea" description={<>{order.orderNumber} · {item.name}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasChanges || qtyNum <= 0}>
            Guardar
          </Btn>
      </>}
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-body font-medium">Cantidad</label>
              <Input type="number" min={0.001} step={0.001} value={orderedQty}
                onChange={e => setOrderedQty(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-body font-medium">Costo unitario</label>
              <MoneyInput min={0} value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          </div>
          <p className="text-meta text-ink-muted tabular-nums">
            Nuevo subtotal: {formatCurrency(qtyNum * costNum)} — el total de la orden se recalcula automáticamente.
          </p>
        </div>
    </Modal>
  );
}

export function CorrectItemModal({ order, item, onClose, onCorrected }: {
  order: { id: string; orderNumber: string };
  item: { productId: string; name: string; receivedQty: number; unitCost: number; isBonus: boolean };
  onClose: () => void; onCorrected: () => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [toProduct, setToProduct] = useState<{ id: string; name: string } | null>(null);
  const [quantity, setQuantity] = useState(String(item.receivedQty));
  const [unitCost, setUnitCost] = useState(String(item.unitCost));
  const [isBonus, setIsBonus] = useState(item.isBonus);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const { data: results } = useQuery({
    queryKey: ['products-search', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; barcode: string | null }> }>(`/products?q=${debouncedSearch}&limit=10`)).data.data,
    enabled: debouncedSearch.length >= 2,
  });

  const quantityNum = parseFloat(quantity) || 0;
  const quantityChanged = quantityNum > 0 && quantityNum !== item.receivedQty;
  const unitCostNum = parseFloat(unitCost) || 0;
  const costChanged = !isBonus && unitCostNum !== item.unitCost;
  const bonusChanged = isBonus !== item.isBonus;
  const hasChanges = !!toProduct || quantityChanged || costChanged || bonusChanged;

  const mutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/correct-item`, {
      productId: item.productId,
      ...(toProduct ? { toProductId: toProduct.id } : {}),
      ...(quantityChanged ? { quantity: quantityNum } : {}),
      ...(costChanged ? { unitCost: unitCostNum } : {}),
      ...(bonusChanged ? { isBonus } : {}),
      reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Línea corregida.');
      onCorrected();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="sm" keepOpen
      title="Corregir línea" description={<>{order.orderNumber} · Registrado como: {item.name}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasChanges || reason.trim().length < 3}>
            Confirmar corrección
          </Btn>
      </>}
    >
      <div className="space-y-4">
          <p className="text-body text-ink-muted">
            El stock, costo y lo que se le debe al proveedor se recalculan automáticamente con los valores que corrijas abajo.
          </p>
          <div>
            <label className="mb-1 block text-body font-medium">Cambiar producto (opcional)</label>
            {toProduct ? (
              <div className="flex items-center justify-between rounded-srf border p-2.5 text-body">
                <span className="font-medium">{toProduct.name}</span>
                <button onClick={() => setToProduct(null)} className="text-ink-muted hover:text-bad-ink"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                <Input className="pl-9" placeholder="Buscar el producto correcto..." value={search}
                  onChange={e => setSearch(e.target.value)} />
                {results && results.length > 0 && search.length >= 2 && (
                  <div className="absolute z-10 w-full border rounded-srf mt-1 divide-y max-h-40 overflow-y-auto bg-surface shadow-lg">
                    {results.filter(p => p.id !== item.productId).map(p => (
                      <button key={p.id} onClick={() => { setToProduct(p); setSearch(''); }}
                        className="w-full text-left px-3 py-2 text-body hover:bg-ink/[0.03]">{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Cantidad recibida</label>
            <Input type="number" min={0.001} step={0.001} value={quantity} onChange={e => setQuantity(e.target.value)} />
            <p className="mt-1 text-meta text-ink-muted">
              Solo se puede corregir si este producto se recibió en una única entrega dentro de esta orden.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-srf border p-3">
            <input type="checkbox" id="correctIsBonus" checked={isBonus}
              onChange={e => setIsBonus(e.target.checked)} className="h-4 w-4 rounded border-input" />
            <label htmlFor="correctIsBonus" className="text-body font-medium cursor-pointer">Es bonificación del proveedor (costo S/ 0.00)</label>
          </div>
          {!isBonus && (
            <div>
              <label className="mb-1 block text-body font-medium">Costo unitario</label>
              <MoneyInput min={0} value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-body font-medium">Motivo</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: se recibió mal, era bonificación del proveedor" autoFocus />
          </div>
        </div>
    </Modal>
  );
}

/* ─── Order Row ─────────────────────────────────────────────────────────── */
