import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ChevronDown, ChevronUp, CheckCircle, XCircle,
  PackageCheck, Truck, Clock, FileText, X, ScanBarcode, Sparkles, ArrowLeft,
  BookOpen, Star, Trash2, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Supplier {
  id: string; businessName: string; taxId: string | null;
  contactName: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; paymentTermDays: number;
  isActive: boolean; _count?: { purchaseOrders: number };
}

interface PurchaseOrder {
  id: string; orderNumber: string; status: string;
  createdAt: string; expectedDate: string | null;
  subtotal: number; taxAmount: number; totalAmount: number;
  supplier: { businessName: string };
  user: { firstName: string; lastName: string };
  _count: { items: number };
}

interface OrderDetail extends PurchaseOrder {
  supplierInvoice: string | null; notes: string | null;
  supplier: Supplier;
  approvedBy: { firstName: string; lastName: string } | null;
  items: Array<{
    id: string; orderedQty: number; receivedQty: number;
    unitCost: number; subtotal: number;
    product: { id: string; name: string; barcode: string | null; currentStock: number };
  }>;
  receipts: Array<{ id: string; receivedAt: string; notes: string | null }>;
}

interface Product {
  id: string; name: string; barcode: string | null; costPrice: number;
  currentStock: number; category: { name: string };
}

interface LowStockProduct {
  id: string; name: string; barcode: string | null;
  current_stock: number; min_stock: number; category: string;
  cost_price: number; supplier_id: string | null; supplier_name: string | null;
  supplier_source: 'preferred' | 'cheapest' | 'legacy' | null; alternatives_count: number;
  suggested_qty: number;
}

interface SupplierCatalogItem {
  supplierId: string; productId: string; price: number;
  supplierSku: string | null; isPreferred: boolean; lastPurchaseAt: string | null;
  product: { id: string; name: string; barcode: string | null; currentStock: number; minStock: number; costPrice: number };
}

/* ─── Status helpers ────────────────────────────────────────────────────── */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PENDING_APPROVAL: 'Pend. aprobación',
  APPROVED: 'Aprobada', SENT: 'Enviada',
  PARTIALLY_RECEIVED: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  DRAFT: 'secondary', PENDING_APPROVAL: 'default', APPROVED: 'default',
  SENT: 'default', PARTIALLY_RECEIVED: 'default', RECEIVED: 'success', CANCELLED: 'destructive',
};

/* ─── Supplier Form Modal ────────────────────────────────────────────────── */
function SupplierModal({ supplier, onClose, onSaved }: {
  supplier?: Supplier; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    businessName: supplier?.businessName ?? '',
    taxId: supplier?.taxId ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    city: supplier?.city ?? '',
    paymentTermDays: String(supplier?.paymentTermDays ?? 30),
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => supplier
      ? api.put(`/suppliers/${supplier.id}`, { ...form, paymentTermDays: Number(form.paymentTermDays) })
      : api.post('/suppliers', { ...form, paymentTermDays: Number(form.paymentTermDays) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(supplier ? 'Proveedor actualizado.' : 'Proveedor creado.');
      onSaved();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Razón social *</label>
            <Input value={form.businessName} onChange={f('businessName')} placeholder="Distribuidora ABC S.A.C." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RUC</label>
            <Input value={form.taxId} onChange={f('taxId')} placeholder="20XXXXXXXXX" maxLength={11} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Contacto</label>
            <Input value={form.contactName} onChange={f('contactName')} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input type="email" value={form.email} onChange={f('email')} placeholder="ventas@proveedor.com" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <Input value={form.phone} onChange={f('phone')} placeholder="987654321" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Dirección</label>
            <Input value={form.address} onChange={f('address')} placeholder="Av. Los Proveedores 123" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ciudad</label>
            <Input value={form.city} onChange={f('city')} placeholder="Lima" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Plazo pago (días)</label>
            <Input type="number" value={form.paymentTermDays} onChange={f('paymentTermDays')} min={0} />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.businessName}>Guardar</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Supplier Catalog Modal (qué vende cada proveedor y a qué precio) ──── */
function SupplierCatalogModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<{ productId: string; name: string; price: string } | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['supplier-products', supplier.id],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplier.id}/products`)).data.data,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search-catalog', search],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${search}&limit=15`)).data.data,
    enabled: search.length >= 2,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['supplier-products', supplier.id] });

  const addMutation = useMutation({
    mutationFn: (data: { productId: string; price: number }) => api.post(`/suppliers/${supplier.id}/products`, data),
    onSuccess: () => { invalidate(); setDraft(null); toast.success('Producto agregado al catálogo.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { productId: string; price: number; isPreferred?: boolean }) =>
      api.put(`/suppliers/${supplier.id}/products/${data.productId}`, { price: data.price, isPreferred: data.isPreferred }),
    onSuccess: invalidate,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => api.delete(`/suppliers/${supplier.id}/products/${productId}`),
    onSuccess: () => { invalidate(); toast.success('Producto quitado del catálogo.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const existingIds = new Set((catalog ?? []).map(c => c.productId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Catálogo — {supplier.businessName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Qué productos vende este proveedor y a qué precio, para armar pedidos y comparar precios.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div>
            <label className="mb-1 block text-sm font-medium">Agregar producto al catálogo</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar producto por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {products && products.length > 0 && search.length >= 2 && (
              <div className="border rounded-lg mt-1 divide-y max-h-40 overflow-y-auto bg-popover shadow-lg">
                {products.map(p => (
                  <button key={p.id} disabled={existingIds.has(p.id)} onClick={() => { setDraft({ productId: p.id, name: p.name, price: String(p.costPrice) }); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{existingIds.has(p.id) ? 'Ya en catálogo' : `S/ ${Number(p.costPrice).toFixed(2)}`}</span>
                  </button>
                ))}
              </div>
            )}
            {draft && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border p-3">
                <span className="flex-1 text-sm font-medium truncate">{draft.name}</span>
                <span className="text-sm text-muted-foreground">S/</span>
                <Input type="number" min={0} step={0.01} value={draft.price} autoFocus
                  onChange={e => setDraft(d => d && { ...d, price: e.target.value })} className="h-8 w-24 text-right" />
                <Button size="sm" loading={addMutation.isPending} disabled={!draft.price}
                  onClick={() => addMutation.mutate({ productId: draft.productId, price: Number(draft.price) })}>
                  Agregar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando catálogo...</div>
          ) : (catalog ?? []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Este proveedor aún no tiene productos registrados. Se agregan solos al crear/recibir órdenes de compra, o puedes registrarlos aquí manualmente.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium text-right w-28">Precio</th>
                  <th className="py-2 font-medium text-center w-16">Preferido</th>
                  <th className="py-2 font-medium text-right w-28">Última compra</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {catalog!.map(item => (
                  <tr key={item.productId}>
                    <td className="py-2">
                      <p className="font-medium">{item.product.name}</p>
                      {item.product.barcode && <p className="text-xs text-muted-foreground font-mono">{item.product.barcode}</p>}
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" min={0} step={0.01} defaultValue={item.price}
                        onBlur={e => {
                          const price = Number(e.target.value);
                          if (price !== item.price) updateMutation.mutate({ productId: item.productId, price, isPreferred: item.isPreferred });
                        }}
                        className="h-8 text-right" />
                    </td>
                    <td className="py-2 text-center">
                      <button onClick={() => updateMutation.mutate({ productId: item.productId, price: item.price, isPreferred: !item.isPreferred })}
                        title={item.isPreferred ? 'Proveedor preferido para este producto' : 'Marcar como preferido'}>
                        <Star className={cn('h-4 w-4 mx-auto', item.isPreferred ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                      </button>
                    </td>
                    <td className="py-2 text-right text-xs text-muted-foreground">
                      {item.lastPurchaseAt ? formatDateTime(item.lastPurchaseAt) : 'Sin compras aún'}
                    </td>
                    <td className="py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => { if (confirm(`¿Quitar "${item.product.name}" del catálogo de ${supplier.businessName}?`)) removeMutation.mutate(item.productId); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t p-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── New Purchase Order Modal ──────────────────────────────────────────── */
function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; name: string; orderedQty: number; unitCost: number }>>([]);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () => (await api.get<{ data: Supplier[] }>('/suppliers?limit=200')).data.data,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search', search],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${search}&limit=20`)).data.data,
    enabled: search.length >= 2,
  });

  // Catálogo conocido de este proveedor — permite armar la orden con un
  // clic (sin buscar) y precarga el último precio pagado, en vez del costo
  // genérico del producto.
  const { data: catalog } = useQuery({
    queryKey: ['supplier-products', supplierId],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplierId}/products`)).data.data,
    enabled: !!supplierId,
  });

  const addProduct = (p: Product) => {
    if (items.find(i => i.productId === p.id)) return;
    const catalogPrice = catalog?.find(c => c.productId === p.id)?.price;
    setItems(v => [...v, { productId: p.id, name: p.name, orderedQty: 1, unitCost: catalogPrice ?? Number(p.costPrice) }]);
    setSearch('');
  };

  const quickAddFromCatalog = (item: SupplierCatalogItem) => {
    if (items.find(i => i.productId === item.productId)) return;
    setItems(v => [...v, { productId: item.productId, name: item.product.name, orderedQty: 1, unitCost: item.price }]);
  };

  // Escanear código de barras agrega directo el producto a la orden — no
  // hace falta buscarlo ni hacer clic en la lista de coincidencias.
  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    if (!/^\d{8,}$/.test(value)) return;
    try {
      const res = await api.get<{ data: Product }>(`/products/barcode/${value}`);
      addProduct(res.data.data);
    } catch {
      toast.error(`No se encontró ningún producto con código ${value}.`);
    }
  };

  const updateItem = (idx: number, field: 'orderedQty' | 'unitCost', val: number) =>
    setItems(v => v.map((i, n) => n === idx ? { ...i, [field]: val } : i));

  const total = items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);

  const mutation = useMutation({
    mutationFn: () => api.post('/purchases', {
      supplierId, expectedDate: expectedDate || undefined, notes,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Nueva Orden de Compra</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Proveedor *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Seleccionar...</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha esperada</label>
              <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Notas</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
            </div>
          </div>

          {/* Catálogo del proveedor seleccionado */}
          {supplierId && catalog && catalog.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">Catálogo de este proveedor</label>
              <div className="flex flex-wrap gap-1.5">
                {catalog.filter(c => !items.find(i => i.productId === c.productId)).map(c => (
                  <button key={c.productId} onClick={() => quickAddFromCatalog(c)}
                    className="rounded-full border px-3 py-1 text-xs hover:border-primary hover:bg-primary/5 transition-colors">
                    {c.product.name} · S/ {c.price.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product search */}
          <div>
            <label className="mb-1 block text-sm font-medium">Agregar productos</label>
            <div className="relative">
              <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre o escanear código de barras..." value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={handleScanKeyDown} />
            </div>
            {products && products.length > 0 && search.length >= 2 && (
              <div className="border rounded-lg mt-1 divide-y max-h-40 overflow-y-auto bg-popover shadow-lg z-10">
                {products.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">Stock: {p.currentStock} · S/ {Number(p.costPrice).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium text-center w-24">Cant.</th>
                  <th className="py-2 font-medium text-right w-28">Costo unit.</th>
                  <th className="py-2 font-medium text-right w-24">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => (
                  <tr key={item.productId}>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 px-2">
                      <Input type="number" min={1} value={item.orderedQty}
                        onChange={e => updateItem(idx, 'orderedQty', Number(e.target.value))}
                        className="h-8 text-center" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" min={0} step={0.01} value={item.unitCost}
                        onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))}
                        className="h-8 text-right" />
                    </td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.orderedQty * item.unitCost)}</td>
                    <td className="py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setItems(v => v.filter((_, n) => n !== idx))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={3} className="py-2 text-right font-semibold">Subtotal (sin IGV)</td>
                  <td className="py-2 text-right font-bold">{formatCurrency(total)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-muted-foreground text-xs">Total con IGV 18%</td>
                  <td className="py-1 text-right text-muted-foreground text-xs">{formatCurrency(total * 1.18)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!supplierId || items.length === 0}>
            Crear Orden
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Suggest Order Modal (a partir de stock bajo) ───────────────────────── */
function SuggestOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {supplierId ? `Orden sugerida — ${pickedGroup?.supplierName}` : 'Sugerir Orden de Compra'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando productos con stock bajo...</div>
          ) : !supplierId ? (
            <>
              <p className="text-sm text-muted-foreground">
                Productos con stock bajo o sin stock, agrupados por el proveedor elegido automáticamente (el marcado
                como preferido, o si no el que vende más barato según el catálogo). Las cantidades se sugieren para
                llegar al stock máximo (o al doble del mínimo si no tiene máximo definido).
              </p>
              {groupList.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  No hay productos con stock bajo que tengan proveedor asignado.
                </div>
              ) : (
                <div className="space-y-2">
                  {groupList.map(g => {
                    const groupTotal = g.products.reduce((s, p) => s + p.suggested_qty * Number(p.cost_price), 0);
                    return (
                      <button key={g.supplierId} onClick={() => pickSupplier(g)}
                        className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between">
                        <div>
                          <p className="font-medium">{g.supplierName}</p>
                          <p className="text-xs text-muted-foreground">{g.products.length} producto{g.products.length !== 1 ? 's' : ''} con stock bajo</p>
                        </div>
                        <p className="font-bold text-primary">{formatCurrency(groupTotal)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {withoutSupplier.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  {withoutSupplier.length} producto{withoutSupplier.length !== 1 ? 's' : ''} con stock bajo no tiene{withoutSupplier.length !== 1 ? 'n' : ''} proveedor
                  asignado, así que no se puede{withoutSupplier.length !== 1 ? 'n' : ''} sugerir aquí — asígnaselo en Productos primero.
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setSupplierId(null); setItems([]); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <ArrowLeft className="h-3.5 w-3.5" />Elegir otro proveedor
              </button>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 font-medium text-center w-24">Cant. sugerida</th>
                    <th className="py-2 font-medium text-right w-28">Costo unit.</th>
                    <th className="py-2 font-medium text-right w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={item.productId}>
                      <td className="py-2">
                        <p>{item.name}</p>
                        {item.source && (
                          <p className="text-xs text-muted-foreground">
                            {item.source === 'preferred' ? '★ Proveedor preferido' : item.source === 'cheapest' ? 'Precio más bajo' : 'Proveedor asignado'}
                            {item.alternatives > 1 && ` · ${item.alternatives} proveedores lo venden`}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" min={1} value={item.orderedQty}
                          onChange={e => updateItem(idx, 'orderedQty', Number(e.target.value))}
                          className="h-8 text-center" />
                      </td>
                      <td className="py-2 px-2">
                        <Input type="number" min={0} step={0.01} value={item.unitCost}
                          onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))}
                          className="h-8 text-right" />
                      </td>
                      <td className="py-2 text-right font-medium">{formatCurrency(item.orderedQty * item.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="py-2 text-right font-semibold">Subtotal (sin IGV)</td>
                    <td className="py-2 text-right font-bold">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {supplierId && (
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={items.length === 0}>
              Crear Orden Sugerida
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Receive Order Modal ────────────────────────────────────────────────── */
function ReceiveOrderModal({ order, onClose, onReceived }: {
  order: OrderDetail; onClose: () => void; onReceived: () => void;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState(
    order.items.map(i => ({
      productId: i.product.id, name: i.product.name, barcode: i.product.barcode,
      orderedQty: i.orderedQty, receivedQty: i.orderedQty - i.receivedQty,
      unitCost: Number(i.unitCost),
    }))
  );
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState('');

  // Escanear el código de cada caja/unidad que va llegando suma 1 al
  // "Recibido" de esa línea — más rápido que teclear la cantidad a mano
  // cuando se está cotejando contra la guía de remisión físicamente.
  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    setScan('');
    if (!value) return;
    const idx = items.findIndex(i => i.barcode === value);
    if (idx === -1) {
      toast.error(`"${value}" no está en esta orden de compra.`);
      return;
    }
    setItems(v => v.map((i, n) => n === idx ? { ...i, receivedQty: Math.min(i.orderedQty, i.receivedQty + 1) } : i));
  };

  const mutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/receive`, {
      items: items.map(i => ({ productId: i.productId, receivedQty: i.receivedQty, unitCost: i.unitCost })),
      notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Mercadería recibida. Stock actualizado.');
      onReceived();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Recibir Mercadería — {order.orderNumber}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Escanear código de barras para sumar 1 a lo recibido..."
              value={scan} onChange={e => setScan(e.target.value)} onKeyDown={handleScanKeyDown} autoFocus />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium text-center w-24">Pedido</th>
                <th className="py-2 font-medium text-center w-28">Recibido</th>
                <th className="py-2 font-medium text-right w-28">Costo unit.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <tr key={item.productId}>
                  <td className="py-2">{item.name}</td>
                  <td className="py-2 text-center text-muted-foreground">{item.orderedQty}</td>
                  <td className="py-2 px-2">
                    <Input type="number" min={0} max={item.orderedQty} value={item.receivedQty}
                      onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, receivedQty: Number(e.target.value) } : i))}
                      className="h-8 text-center" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" min={0} step={0.01} value={item.unitCost}
                      onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, unitCost: Number(e.target.value) } : i))}
                      className="h-8 text-right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="mb-1 block text-sm font-medium">Notas de recepción</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            <PackageCheck className="mr-2 h-4 w-4" />Confirmar recepción
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Order Row ─────────────────────────────────────────────────────────── */
function OrderRow({ order }: { order: PurchaseOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const queryClient = useQueryClient();

  const { data: detail } = useQuery({
    queryKey: ['purchase', order.id],
    queryFn: async () => (await api.get<{ data: OrderDetail }>(`/purchases/${order.id}`)).data.data,
    enabled: expanded,
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/approve`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchases'] }); toast.success('Orden aprobada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchases'] }); toast.success('Orden cancelada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canApprove = order.status === 'PENDING_APPROVAL';
  const canReceive = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order.status);
  const canCancel = !['RECEIVED', 'CANCELLED'].includes(order.status);

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <td className="px-4 py-3 font-medium">{order.orderNumber}</td>
        <td className="px-4 py-3">{order.supplier.businessName}</td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(order.createdAt)}</td>
        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(order.totalAmount)}</td>
        <td className="px-4 py-3 text-center">{order._count.items}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            {canApprove && <Button size="sm" variant="outline" onClick={() => approveMutation.mutate()} loading={approveMutation.isPending}>
              <CheckCircle className="mr-1 h-3.5 w-3.5 text-success" />Aprobar
            </Button>}
            {canReceive && <Button size="sm" variant="outline" onClick={() => { setExpanded(true); setShowReceive(true); }}>
              <Truck className="mr-1 h-3.5 w-3.5" />Recibir
            </Button>}
            {canCancel && <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            </Button>}
          </div>
        </td>
        <td className="px-4 py-3">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>

      {expanded && detail && (
        <tr>
          <td colSpan={8} className="bg-muted/20 px-6 py-4">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wide">Productos</p>
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1 font-medium">Producto</th>
                    <th className="py-1 font-medium text-center">Pedido</th>
                    <th className="py-1 font-medium text-center">Recibido</th>
                    <th className="py-1 font-medium text-right">Costo unit.</th>
                    <th className="py-1 font-medium text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detail.items.map(item => (
                    <tr key={item.id}>
                      <td className="py-1.5">{item.product.name}</td>
                      <td className="py-1.5 text-center">{item.orderedQty}</td>
                      <td className={cn('py-1.5 text-center', item.receivedQty >= item.orderedQty ? 'text-success' : item.receivedQty > 0 ? 'text-amber-500' : '')}>
                        {item.receivedQty}
                      </td>
                      <td className="py-1.5 text-right">{formatCurrency(item.unitCost)}</td>
                      <td className="py-1.5 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.notes && <p className="text-muted-foreground text-xs">Notas: {detail.notes}</p>}
            </div>
          </td>
        </tr>
      )}

      {showReceive && detail && (
        <ReceiveOrderModal
          order={detail}
          onClose={() => setShowReceive(false)}
          onReceived={() => setShowReceive(false)}
        />
      )}
    </>
  );
}

/* ─── Suppliers Tab ─────────────────────────────────────────────────────── */
function SuppliersTab() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | undefined>();
  const [catalogSupplier, setCatalogSupplier] = useState<Supplier | undefined>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: async () => (await api.get<{ data: Supplier[] }>(`/suppliers?search=${search}&limit=50`)).data.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Proveedor eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline"
          onClick={() => downloadExcel(`/suppliers/export${search ? `?search=${encodeURIComponent(search)}` : ''}`, 'proveedores.xlsx')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
        </Button>
        <Button onClick={() => { setEditSupplier(undefined); setShowModal(true); }}>
          <Plus className="mr-2 h-4 w-4" />Nuevo Proveedor
        </Button>
      </div>

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Razón social</th>
                  <th className="px-4 py-3 text-left font-medium">RUC</th>
                  <th className="px-4 py-3 text-left font-medium">Contacto</th>
                  <th className="px-4 py-3 text-left font-medium">Teléfono</th>
                  <th className="px-4 py-3 text-center font-medium">Órdenes</th>
                  <th className="px-4 py-3 text-center font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data ?? []).map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.businessName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.taxId ?? '—'}</td>
                    <td className="px-4 py-3">{s.contactName ?? '—'}</td>
                    <td className="px-4 py-3">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-center">{s._count?.purchaseOrders ?? 0}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={s.isActive ? 'success' : 'secondary'}>{s.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setCatalogSupplier(s)}>
                          <BookOpen className="mr-1 h-3.5 w-3.5" />Catálogo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEditSupplier(s); setShowModal(true); }}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => { if (confirm('¿Eliminar este proveedor?')) deleteMutation.mutate(s.id); }}>
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No hay proveedores registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <SupplierModal
          supplier={editSupplier}
          onClose={() => setShowModal(false)}
          onSaved={() => setShowModal(false)}
        />
      )}
      {catalogSupplier && <SupplierCatalogModal supplier={catalogSupplier} onClose={() => setCatalogSupplier(undefined)} />}
    </div>
  );
}

/* ─── Orders Tab ────────────────────────────────────────────────────────── */
function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', statusFilter, page],
    queryFn: async () => (await api.get<{ data: PurchaseOrder[]; pagination: { total: number; totalPages: number } }>(
      `/purchases?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`
    )).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex-1" />
        <Button variant="outline"
          onClick={() => downloadExcel(`/purchases/export${statusFilter ? `?status=${statusFilter}` : ''}`, 'compras.xlsx')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
        </Button>
        <Button variant="outline" onClick={() => setShowSuggest(true)}
          className="border-primary/30 text-primary hover:bg-primary/10">
          <Sparkles className="mr-2 h-4 w-4" />Sugerir Orden
        </Button>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />Nueva Orden
        </Button>
      </div>

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">N° Orden</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-center">Ítems</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.data ?? []).map(order => <OrderRow key={order.id} order={order} />)}
                {(data?.data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No hay órdenes de compra</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={() => setShowNew(false)} />}
      {showSuggest && <SuggestOrderModal onClose={() => setShowSuggest(false)} onCreated={() => setShowSuggest(false)} />}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function PurchasesPage() {
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Compras y Proveedores</h1>
        <p className="text-sm text-muted-foreground">Gestión de órdenes de compra, recepción y proveedores</p>
      </div>

      <div className="flex gap-1 border-b">
        {([['orders', FileText, 'Órdenes de Compra'], ['suppliers', Truck, 'Proveedores']] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? <OrdersTab /> : <SuppliersTab />}
    </div>
  );
}
