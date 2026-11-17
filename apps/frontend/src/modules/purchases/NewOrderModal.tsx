import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Btn } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, looksLikeScannedCode } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SupplierCatalogPicker, useLineFocus } from './purchaseLines';
import { Product, Supplier, SupplierCatalogItem } from './types';

export function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [items, setItems] = useState<Array<{ productId: string; name: string; orderedQty: number; unitCost: number }>>([]);
  const [includeTax, setIncludeTax] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () => (await api.get<{ data: Supplier[] }>('/suppliers?limit=200')).data.data,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${debouncedSearch}&limit=20`)).data.data,
    enabled: debouncedSearch.length >= 2,
  });

  // Catálogo conocido de este proveedor — permite armar la orden con un
  // clic (sin buscar) y precarga el último precio pagado, en vez del costo
  // genérico del producto.
  const { data: catalog } = useQuery({
    queryKey: ['supplier-products', supplierId],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplierId}/products`)).data.data,
    enabled: !!supplierId,
  });

  const { searchRef, qtyRefs, costRefs, focusLine, onQtyEnter, onCostEnter } = useLineFocus();

  // Igual que en Registrar Compra: lo último agregado queda arriba y con foco.
  const pushTop = (row: { productId: string; name: string; orderedQty: number; unitCost: number }) => {
    setItems(v => [v.find(i => i.productId === row.productId) ?? row, ...v.filter(i => i.productId !== row.productId)]);
    if (items.some(i => i.productId === row.productId)) toast.info(`${row.name} ya estaba en la lista — se movió arriba.`);
    focusLine(row.productId);
  };

  const addProduct = (p: Product) => {
    const catalogPrice = catalog?.find(c => c.productId === p.id)?.price;
    pushTop({ productId: p.id, name: p.name, orderedQty: 1, unitCost: catalogPrice ?? Number(p.costPrice) });
    setSearch('');
  };

  const quickAddFromCatalog = (item: SupplierCatalogItem) =>
    pushTop({ productId: item.productId, name: item.product.name, orderedQty: 1, unitCost: item.price });

  // Escanear código de barras agrega directo el producto a la orden — no
  // hace falta buscarlo ni hacer clic en la lista de coincidencias.
  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    if (!looksLikeScannedCode(value)) return;
    try {
      const res = await api.get<{ data: Product }>(`/products/barcode/${value}`);
      addProduct(res.data.data);
    } catch {
      toast.error(`No se encontró ningún producto con código ${value}.`);
    }
  };

  const updateItem = (idx: number, field: 'orderedQty' | 'unitCost', val: number) =>
    setItems(v => v.map((i, n) => n === idx ? { ...i, [field]: val } : i));

  const subtotal = items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);
  // Afecto a IGV: los costos ya traen el IGV; solo se calcula lo que va dentro.
  const taxAmount = includeTax ? subtotal - subtotal / 1.18 : 0;
  const total = subtotal;

  const mutation = useMutation({
    mutationFn: () => api.post('/purchases', {
      supplierId, expectedDate: expectedDate || undefined, notes, includeTax,
      items: items.map(i => ({ productId: i.productId, orderedQty: i.orderedQty, unitCost: i.unitCost })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Orden de compra creada.');
      onCreated();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="lg" keepOpen
      title="Nueva Orden de Compra"
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!supplierId || items.length === 0}>
            Crear Orden
          </Btn>
      </>}
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-body font-medium">Proveedor *</label>
              <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-body font-medium">Fecha esperada</label>
              <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-body font-medium">Notas</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
            </div>
          </div>

          {/* Catálogo del proveedor seleccionado (plegado, opcional) */}
          {supplierId && catalog && (
            <SupplierCatalogPicker
              catalog={catalog.filter(c => !items.find(i => i.productId === c.productId))}
              onPick={quickAddFromCatalog} />
          )}

          {/* Product search */}
          <div>
            <label className="mb-1 block text-body font-medium">Agregar productos</label>
            <div className="relative">
              <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input ref={searchRef} className="pl-9" placeholder="Buscar por nombre o escanear código de barras..." value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={handleScanKeyDown} />
            </div>
            {products && products.length > 0 && search.length >= 2 && (
              <div className="border rounded-srf mt-1 divide-y max-h-40 overflow-y-auto bg-surface shadow-lg z-10">
                {products.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-body hover:bg-ink/[0.03] flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-ink-muted">Stock: {p.currentStock} · {formatCost(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <table className="w-full text-body">
              <thead>
                <tr className="border-b text-left text-meta uppercase tracking-wide text-ink-muted">
                  <th className="py-2 font-semibold">Producto</th>
                  <th className="py-2 font-semibold text-center w-24">Cant.</th>
                  <th className="py-2 font-semibold text-right w-36">Costo unit.</th>
                  <th className="py-2 font-semibold text-right w-28">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => (
                  <tr key={item.productId}>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 px-2">
                      <Input ref={el => { qtyRefs.current[item.productId] = el; }} type="number" min={1} value={item.orderedQty}
                        onKeyDown={onQtyEnter(item.productId)}
                        onChange={e => updateItem(idx, 'orderedQty', Number(e.target.value))}
                        className="h-9 text-center" />
                    </td>
                    <td className="py-2 px-2">
                      <MoneyInput ref={el => { costRefs.current[item.productId] = el; }} size="sm" min={0} value={item.unitCost}
                        onKeyDown={onCostEnter}
                        onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))} />
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(item.orderedQty * item.unitCost)}</td>
                    <td className="py-2">
                      <Btn variant="ghost" size="sm" className="w-7 w-8 px-0"
                        onClick={() => setItems(v => v.filter((_, n) => n !== idx))}>
                        <X className="h-3.5 w-3.5" />
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={3} className="py-2 text-right font-semibold">Subtotal</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(subtotal)}</td>
                  <td />
                </tr>
                {includeTax && (
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-ink-muted text-meta">IGV incluido (18%)</td>
                    <td className="py-1 text-right text-ink-muted text-meta tabular-nums">{formatCurrency(taxAmount)}</td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="py-2 text-right text-body font-semibold uppercase tracking-wide text-ink-muted">Total</td>
                  <td className="py-2 text-right text-section font-semibold tabular-nums">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {items.length > 0 && (
            <label className="flex items-center gap-2 text-body cursor-pointer w-fit ml-auto">
              <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Afecto a IGV (los costos ya traen el IGV; solo se calcula lo que va dentro)
            </label>
          )}
        </div>
    </Modal>
  );
}

/* ─── Suggest Order Modal (a partir de stock bajo) ───────────────────────── */
