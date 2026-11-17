import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Sparkles, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Btn } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { LowStockProduct } from './types';

export function SuggestOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ productId: string; name: string; orderedQty: number; unitCost: number; source: LowStockProduct['supplier_source']; alternatives: number }>>([]);

  const { data: lowStock, isLoading } = useQuery({
    queryKey: ['inv-low-stock'],
    queryFn: async () => (await api.get<{ data: LowStockProduct[] }>('/inventory/low-stock')).data.data,
  });

  const withSupplier = (lowStock ?? []).filter(p => p.supplier_id);
  const withoutSupplier = (lowStock ?? []).filter(p => !p.supplier_id);

  const groups = withSupplier.reduce((acc, p) => {
    const key = p.supplier_id!;
    if (!acc[key]) acc[key] = { supplierId: key, supplierName: p.supplier_name ?? '—', products: [] as LowStockProduct[] };
    acc[key].products.push(p);
    return acc;
  }, {} as Record<string, { supplierId: string; supplierName: string; products: LowStockProduct[] }>);
  const groupList = Object.values(groups).sort((a, b) => b.products.length - a.products.length);

  const pickSupplier = (group: { supplierId: string; supplierName: string; products: LowStockProduct[] }) => {
    setSupplierId(group.supplierId);
    setItems(group.products.map(p => ({
      productId: p.id, name: p.name, orderedQty: p.suggested_qty, unitCost: Number(p.cost_price),
      source: p.supplier_source, alternatives: p.alternatives_count,
    })));
  };

  const updateItem = (idx: number, field: 'orderedQty' | 'unitCost', val: number) =>
    setItems(v => v.map((i, n) => n === idx ? { ...i, [field]: val } : i));

  const total = items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);
  const pickedGroup = groupList.find(g => g.supplierId === supplierId);

  const mutation = useMutation({
    mutationFn: () => api.post('/purchases', {
      supplierId,
      items: items.map(i => ({ productId: i.productId, orderedQty: i.orderedQty, unitCost: i.unitCost })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Orden de compra sugerida creada.');
      onCreated();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="lg" keepOpen
      title={<>{supplierId ? `Orden sugerida — ${pickedGroup?.supplierName}` : 'Sugerir Orden de Compra'}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          {supplierId && (
            <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={items.length === 0}>
              Crear Orden Sugerida
            </Btn>
          )}
      </>}
    >
      <div className="space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-ink-muted">Cargando productos con stock bajo...</div>
          ) : !supplierId ? (
            <>
              <p className="text-body text-ink-muted">
                Productos con stock bajo o sin stock, agrupados por el proveedor elegido automáticamente (el marcado
                como preferido, o si no el que vende más barato según el catálogo). Las cantidades se sugieren para
                llegar al stock máximo (o al doble del mínimo si no tiene máximo definido).
              </p>
              {groupList.length === 0 ? (
                <div className="py-10 text-center text-ink-muted">
                  No hay productos con stock bajo que tengan proveedor asignado.
                </div>
              ) : (
                <div className="space-y-2">
                  {groupList.map(g => {
                    const groupTotal = g.products.reduce((s, p) => s + p.suggested_qty * Number(p.cost_price), 0);
                    return (
                      <button key={g.supplierId} onClick={() => pickSupplier(g)}
                        className="w-full text-left rounded-srf border p-3 hover:border-brand hover:bg-brand/5 transition-colors flex items-center justify-between">
                        <div>
                          <p className="font-medium">{g.supplierName}</p>
                          <p className="text-meta text-ink-muted">{g.products.length} producto{g.products.length !== 1 ? 's' : ''} con stock bajo</p>
                        </div>
                        <p className="text-section font-semibold tabular-nums text-brand">{formatCurrency(groupTotal)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {withoutSupplier.length > 0 && (
                <div className="rounded-srf bg-surface p-3 text-body text-ink shadow-[inset_3px_0_0_hsl(var(--warn)),0_0_0_1px_hsl(var(--line))]">
                  {withoutSupplier.length} producto{withoutSupplier.length !== 1 ? 's' : ''} con stock bajo no tiene{withoutSupplier.length !== 1 ? 'n' : ''} proveedor
                  asignado, así que no se puede{withoutSupplier.length !== 1 ? 'n' : ''} sugerir aquí — asígnaselo en Productos primero.
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setSupplierId(null); setItems([]); }}
                className="flex items-center gap-1.5 text-body text-brand hover:underline">
                <ArrowLeft className="h-3.5 w-3.5" />Elegir otro proveedor
              </button>
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b text-left text-meta uppercase tracking-wide text-ink-muted">
                    <th className="py-2 font-semibold">Producto</th>
                    <th className="py-2 font-semibold text-center w-24">Cant. sugerida</th>
                    <th className="py-2 font-semibold text-right w-36">Costo unit.</th>
                    <th className="py-2 font-semibold text-right w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={item.productId}>
                      <td className="py-2">
                        <p>{item.name}</p>
                        {item.source && (
                          <p className="text-meta text-ink-muted">
                            {item.source === 'preferred' ? '★ Proveedor preferido' : item.source === 'cheapest' ? 'Precio más bajo' : 'Proveedor asignado'}
                            {item.alternatives > 1 && ` · ${item.alternatives} proveedores lo venden`}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" min={1} value={item.orderedQty}
                          onChange={e => updateItem(idx, 'orderedQty', Number(e.target.value))}
                          className="h-9 text-center" />
                      </td>
                      <td className="py-2 px-2">
                        <MoneyInput size="sm" min={0} value={item.unitCost}
                          onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))} />
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(item.orderedQty * item.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="py-2 text-right text-body font-semibold uppercase tracking-wide text-ink-muted">Subtotal (sin IGV)</td>
                    <td className="py-2 text-right text-section font-semibold tabular-nums">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
    </Modal>
  );
}

/* ─── Receive Order Modal ────────────────────────────────────────────────── */
