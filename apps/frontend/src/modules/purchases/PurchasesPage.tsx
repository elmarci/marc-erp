import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ChevronDown, ChevronUp, CheckCircle, XCircle,
  PackageCheck, Truck, Clock, FileText, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';

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
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?search=${search}&limit=20`)).data.data,
    enabled: search.length >= 2,
  });

  const addProduct = (p: Product) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(v => [...v, { productId: p.id, name: p.name, orderedQty: 1, unitCost: Number(p.costPrice) }]);
    setSearch('');
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

          {/* Product search */}
          <div>
            <label className="mb-1 block text-sm font-medium">Agregar productos</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar producto por nombre..." value={search}
                onChange={e => setSearch(e.target.value)} />
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

/* ─── Receive Order Modal ────────────────────────────────────────────────── */
function ReceiveOrderModal({ order, onClose, onReceived }: {
  order: OrderDetail; onClose: () => void; onReceived: () => void;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState(
    order.items.map(i => ({
      productId: i.product.id, name: i.product.name,
      orderedQty: i.orderedQty, receivedQty: i.orderedQty - i.receivedQty,
      unitCost: Number(i.unitCost),
    }))
  );
  const [notes, setNotes] = useState('');

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
    </div>
  );
}

/* ─── Orders Tab ────────────────────────────────────────────────────────── */
function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
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
