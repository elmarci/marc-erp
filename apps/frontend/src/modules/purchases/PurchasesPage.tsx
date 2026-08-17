import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ChevronDown, ChevronUp, CheckCircle, XCircle,
  PackageCheck, Truck, Clock, FileText, X, ScanBarcode, Sparkles, ArrowLeft,
  BookOpen, Star, Trash2, FileSpreadsheet, Undo2, Pencil, Receipt, HandCoins,
  Wallet, Smartphone, AlertTriangle, SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, formatDateTime, cn, looksLikeScannedCode, todayLimaDateString } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { printThermalHtml } from '@/lib/printThermal';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Supplier {
  id: string; businessName: string; taxId: string | null;
  contactName: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; paymentTermDays: number;
  isActive: boolean; _count?: { purchaseOrders: number };
}

type AccountingState = 'ANULADO' | 'OBSERVADO' | 'REGISTRADO' | 'PAGADO' | 'VENCIDO' | 'PARCIAL' | 'PENDIENTE_PAGO';

interface PurchaseOrder {
  id: string; orderNumber: string; status: string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'CREDIT';
  paidAmount: number;
  payerId: string | null; payerAmount: number;
  dueDate: string | null; hasDiscrepancy: boolean; discrepancyNotes: string | null;
  accountingState: AccountingState;
  createdAt: string; expectedDate: string | null;
  subtotal: number; taxAmount: number; totalAmount: number;
  supplier: { businessName: string };
  user: { firstName: string; lastName: string };
  _count: { items: number };
}

// Tercero que puso el dinero de su bolsillo para pagar una compra — distinto
// del proveedor (quien vendió). Ver comentario del modelo Payer en el backend.
interface Payer {
  id: string; name: string; phone: string | null; notes: string | null;
  creditLimit: number; isActive: boolean;
  totalOwed?: number; orderCount?: number; overLimit?: boolean;
  aging?: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
}

interface OrderDetail extends PurchaseOrder {
  supplierInvoice: string | null; notes: string | null;
  supplier: Supplier;
  payer: { id: string; name: string; phone: string | null } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  voidedAt: string | null; voidReason: string | null;
  voidedBy: { firstName: string; lastName: string } | null;
  items: Array<{
    id: string; orderedQty: number; receivedQty: number;
    unitCost: number; subtotal: number; isBonus: boolean;
    product: { id: string; name: string; barcode: string | null; currentStock: number };
  }>;
  receipts: Array<{ id: string; receivedAt: string; notes: string | null }>;
  payments: Array<{ id: string; amount: number; method: string; paidAt: string; reference: string | null; notes: string | null }>;
}

interface PayableOrder extends PurchaseOrder {
  outstanding: number;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = { PAID: 'Pagada', PARTIAL: 'Pago parcial', CREDIT: 'Crédito' };
const PAYMENT_STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  PAID: 'success', PARTIAL: 'default', CREDIT: 'destructive',
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TRANSFER: 'Transferencia', DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito', OTHER: 'Otro',
};

interface Product {
  id: string; name: string; barcode: string | null; costPrice: number;
  currentStock: number; category: { name: string };
  isBulk?: boolean; bulkUnit?: string | null;
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

// Estado contable de 8 valores (calculado en el backend a partir de status +
// paymentStatus + vencimiento + observado) — ver purchase-state.util.ts.
const ACCOUNTING_STATE_LABELS: Record<AccountingState, string> = {
  ANULADO: 'Anulado', OBSERVADO: 'Observado', REGISTRADO: 'Registrado',
  PAGADO: 'Pagado', VENCIDO: 'Vencido', PARCIAL: 'Pago parcial', PENDIENTE_PAGO: 'Pendiente de pago',
};
const ACCOUNTING_STATE_VARIANT: Record<AccountingState, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  ANULADO: 'secondary', OBSERVADO: 'destructive', REGISTRADO: 'outline',
  PAGADO: 'success', VENCIDO: 'destructive', PARCIAL: 'default', PENDIENTE_PAGO: 'default',
};
const AGING_BUCKET_LABELS: Record<string, string> = { '0-15': '0-15 días', '16-30': '16-30 días', '31-60': '31-60 días', '60+': '60+ días' };

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
  const debouncedSearch = useDebouncedValue(search, 300);
  const [draft, setDraft] = useState<{ productId: string; name: string; price: string } | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['supplier-products', supplier.id],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplier.id}/products`)).data.data,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search-catalog', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${debouncedSearch}&limit=15`)).data.data,
    enabled: debouncedSearch.length >= 2,
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
                    <span className="text-muted-foreground">{existingIds.has(p.id) ? 'Ya en catálogo' : formatCost(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
            {draft && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border p-3">
                <span className="flex-1 text-sm font-medium truncate">{draft.name}</span>
                <span className="text-sm text-muted-foreground">S/</span>
                <Input type="number" min={0} step={0.0001} value={draft.price} autoFocus
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
                      <Input type="number" min={0} step={0.0001} defaultValue={item.price}
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

/* ─── Print de comprobante de compra ─────────────────────────────────────── */
function printPurchaseReceipt(order: OrderDetail) {
  const rows = order.items.map(i => `
    <tr>
      <td>${i.product.name}${i.isBonus ? ' <b>(bonif.)</b>' : ''}</td>
      <td style="text-align:center">${Number(i.orderedQty).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>
      <td style="text-align:right">${i.isBonus ? 'GRATIS' : formatCost(i.unitCost)}</td>
      <td style="text-align:right">S/ ${Number(i.subtotal).toFixed(2)}</td>
    </tr>`).join('');
  const outstanding = Number(order.totalAmount) - Number(order.paidAmount);
  const paymentsRows = order.payments.map(p => `
    <div class="row"><span>${PAYMENT_METHOD_LABELS[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ''}:</span><span>S/ ${Number(p.amount).toFixed(2)}</span></div>`).join('');
  const body = `
    <p class="c b" style="font-size:14px">COMPROBANTE DE COMPRA</p>
    <p class="c">${order.orderNumber}</p>
    <div class="line"></div>
    <div class="row"><span>Proveedor:</span><span>${order.supplier.businessName}</span></div>
    ${order.supplierInvoice ? `<div class="row"><span>Documento:</span><span>${order.supplierInvoice}</span></div>` : ''}
    <div class="row"><span>Fecha:</span><span>${new Date(order.createdAt).toLocaleString('es-PE')}</span></div>
    <div class="row"><span>Estado de pago:</span><span>${PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span></div>
    <div class="line"></div>
    <table><thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Costo</th><th style="text-align:right">Subt.</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="line"></div>
    <div class="row b" style="font-size:14px"><span>TOTAL:</span><span>S/ ${Number(order.totalAmount).toFixed(2)}</span></div>
    ${order.payer ? `<div class="row"><span>Financiado por:</span><span>${order.payer.name} — S/ ${Number(order.payerAmount).toFixed(2)}</span></div>` : ''}
    ${paymentsRows ? `<div class="line"></div><p class="b">Pagos registrados:</p>${paymentsRows}` : ''}
    ${outstanding > 0.009 ? `<div class="row b"><span>Pendiente:</span><span>S/ ${outstanding.toFixed(2)}</span></div>` : ''}
    ${order.dueDate ? `<div class="row"><span>Vence:</span><span>${new Date(order.dueDate).toLocaleDateString('es-PE')}</span></div>` : ''}
    <p class="c" style="margin-top:10px">MARC ERP</p>`;
  printThermalHtml(`Compra ${order.orderNumber}`, body);
}

/* ─── Fuente y forma de pago (reutilizado en Registrar/Recibir/Pagar) ────── */
interface PaymentLeg { amount: number; method: string; cashSessionId?: string; }

// Cajas del día con sesión abierta ahora mismo — para poder elegir "de qué
// caja sale el dinero" en vez de asumir siempre Caja General.
function useOpenCashSessions() {
  return useQuery({
    queryKey: ['cash-registers-open-sessions'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; name: string;
        sessions: Array<{ id: string; user: { firstName: string; lastName: string } }>;
      }> }>('/cash/registers');
      return res.data.data
        .filter(r => r.sessions.length > 0)
        .map(r => ({ cashSessionId: r.sessions[0].id, label: `Caja del día — ${r.name} (${r.sessions[0].user.firstName})` }));
    },
    staleTime: 15_000,
  });
}

function legsSum(legs: PaymentLeg[]) {
  return legs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

function legsMatch(legs: PaymentLeg[], total: number) {
  return legs.length > 0 && legs.every(l => l.amount > 0) && Math.abs(legsSum(legs) - total) <= 0.01;
}

function PaymentLegsEditor({ total, legs, onChange }: {
  total: number; legs: PaymentLeg[]; onChange: (legs: PaymentLeg[]) => void;
}) {
  const { data: openSessions = [] } = useOpenCashSessions();
  const remaining = total - legsSum(legs);

  const updateLeg = (idx: number, patch: Partial<PaymentLeg>) =>
    onChange(legs.map((l, i) => i === idx ? { ...l, ...patch } : l));

  return (
    <div className="space-y-2">
      {legs.map((leg, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <MoneyInput size="sm" min={0} value={leg.amount}
            state={leg.amount > 0 ? 'ok' : undefined}
            onChange={e => updateLeg(idx, { amount: Number(e.target.value) })}
            className="w-28 shrink-0" />
          <Select compact value={leg.method}
            onChange={e => updateLeg(idx, { method: e.target.value, cashSessionId: undefined })}
            className="flex-1">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {leg.method === 'CASH' && (
            <Select compact value={leg.cashSessionId ?? ''}
              onChange={e => updateLeg(idx, { cashSessionId: e.target.value || undefined })}
              className="flex-1">
              <option value="">Caja General</option>
              {openSessions.map(s => <option key={s.cashSessionId} value={s.cashSessionId}>{s.label}</option>)}
            </Select>
          )}
          {legs.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
              onClick={() => onChange(legs.filter((_, i) => i !== idx))}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" size="sm"
          onClick={() => onChange([...legs, { amount: Math.max(0, remaining), method: 'CASH' }])}>
          + Agregar otra forma de pago
        </Button>
        <span className={cn('rounded-md px-2 py-1 text-sm font-bold tabular-nums',
          Math.abs(remaining) > 0.01 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          {Math.abs(remaining) > 0.01 ? `Falta ${formatCurrency(remaining)}` : 'Cuadra ✓'}
        </span>
      </div>
    </div>
  );
}

function PaymentStatusPicker({ paid, legs, total, onChange }: {
  paid: boolean; legs: PaymentLeg[]; total: number;
  onChange: (v: { paid: boolean; legs: PaymentLeg[] }) => void;
}) {
  return (
    <div className="rounded-lg border-2 p-4 space-y-2.5">
      <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        ¿Cómo se paga esta compra?
        <span className="text-sm font-bold tabular-nums text-foreground normal-case tracking-normal">{formatCurrency(total)}</span>
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={paid ? 'default' : 'outline'} className="flex-1"
          onClick={() => onChange({ paid: true, legs: legs.length ? legs : [{ amount: total, method: 'CASH' }] })}>
          Pagado ahora
        </Button>
        <Button type="button" size="sm" variant={!paid ? 'destructive' : 'outline'} className="flex-1"
          onClick={() => onChange({ paid: false, legs })}>
          Crédito (pendiente)
        </Button>
      </div>
      {paid && <PaymentLegsEditor total={total} legs={legs} onChange={l => onChange({ paid: true, legs: l })} />}
      {!paid && (
        <p className="text-xs text-muted-foreground">
          Queda como cuenta por pagar al proveedor. Puedes saldarla luego desde la pestaña "Cuentas por Pagar".
        </p>
      )}
    </div>
  );
}

/* ─── Registrar Compra (directa, con CPP/bonificación/granel) ───────────── */
interface DirectLine {
  productId: string; name: string; isBulk: boolean; bulkUnit: string | null;
  isBonus: boolean; quantity: string; unitCost: string;
  useBulkEntry: boolean; sacks: string; weightPerSack: string; totalCost: string;
}

function RegisterPurchaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: (order: OrderDetail) => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [date, setDate] = useState(() => todayLimaDateString());
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [lines, setLines] = useState<DirectLine[]>([]);
  const [payment, setPayment] = useState<{ paid: boolean; legs: PaymentLeg[] }>({ paid: true, legs: [{ amount: 0, method: 'CASH' }] });
  const [includeTax, setIncludeTax] = useState(false);
  // "La empresa" (flujo normal, con caja) vs. un tercero que puso el dinero
  // de su bolsillo — en ese caso la compra nace pagada al proveedor y se
  // abre una deuda interna con ese pagador, sin tocar Caja General.
  const [payerMode, setPayerMode] = useState(false);
  const [payerId, setPayerId] = useState('');
  // Cuánto de esta compra financia el pagador — puede ser menos que el total
  // (pago mixto: el resto se paga al contado o queda a crédito con el proveedor).
  const [payerAmountInput, setPayerAmountInput] = useState('');
  const [showNewPayer, setShowNewPayer] = useState(false);
  const [newPayerName, setNewPayerName] = useState('');
  const [newPayerPhone, setNewPayerPhone] = useState('');

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () => (await api.get<{ data: Supplier[] }>('/suppliers?limit=200')).data.data,
  });

  const { data: payers } = useQuery({
    queryKey: ['payers'],
    queryFn: async () => (await api.get<{ data: Payer[] }>('/purchases/payers')).data.data,
  });

  const createPayerMutation = useMutation({
    mutationFn: () => api.post<{ data: Payer }>('/purchases/payers', { name: newPayerName, phone: newPayerPhone || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      setPayerId(res.data.data.id);
      setShowNewPayer(false);
      setNewPayerName('');
      setNewPayerPhone('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { data: catalog } = useQuery({
    queryKey: ['supplier-products', supplierId],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplierId}/products`)).data.data,
    enabled: !!supplierId,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${debouncedSearch}&limit=20`)).data.data,
    enabled: debouncedSearch.length >= 2,
  });

  const addLine = (p: { id: string; name: string; isBulk?: boolean; bulkUnit?: string | null }, defaultCost: number) => {
    if (lines.find(l => l.productId === p.id)) return;
    setLines(v => [...v, {
      productId: p.id, name: p.name, isBulk: !!p.isBulk, bulkUnit: p.bulkUnit ?? null,
      isBonus: false, quantity: '1', unitCost: String(defaultCost),
      useBulkEntry: false, sacks: '', weightPerSack: '', totalCost: '',
    }]);
    setSearch('');
  };

  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    if (!looksLikeScannedCode(value)) return;
    try {
      const res = await api.get<{ data: Product }>(`/products/barcode/${value}`);
      addLine(res.data.data, Number(res.data.data.costPrice));
    } catch {
      toast.error(`No se encontró ningún producto con código ${value}.`);
    }
  };

  const updateLine = (idx: number, patch: Partial<DirectLine>) =>
    setLines(v => v.map((l, n) => n === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setLines(v => v.filter((_, n) => n !== idx));

  const effQty = (l: DirectLine) => l.useBulkEntry
    ? (Number(l.sacks) || 0) * (Number(l.weightPerSack) || 0)
    : Number(l.quantity) || 0;
  const effUnitCost = (l: DirectLine) => {
    if (l.isBonus) return 0;
    if (l.useBulkEntry) {
      const q = effQty(l);
      return q > 0 ? (Number(l.totalCost) || 0) / q : 0;
    }
    return Number(l.unitCost) || 0;
  };

  const subtotal = lines.reduce((s, l) => s + effQty(l) * effUnitCost(l), 0);
  const taxAmount = includeTax ? subtotal * 0.18 : 0;
  const total = subtotal + taxAmount;

  const payerAmountNum = payerMode ? Math.min(Number(payerAmountInput) || 0, total) : 0;
  // Lo que no cubre el pagador se paga al contado (legs) o queda a crédito
  // con el proveedor — es el "total" contra el que corre el picker de pago.
  const payTarget = payerMode ? Math.max(0, total - payerAmountNum) : total;

  // Si solo hay una forma de pago, la mantenemos igualada al monto a cubrir
  // ahora mientras se editan las líneas o el monto del pagador — si el
  // usuario ya fraccionó el pago, no la tocamos (que ajuste él mismo).
  useEffect(() => {
    setPayment(p => p.legs.length === 1 && p.legs[0].amount !== payTarget
      ? { ...p, legs: [{ ...p.legs[0], amount: payTarget }] }
      : p);
  }, [payTarget]);

  const canSubmit = !!supplierId && lines.length > 0 && lines.every(l => effQty(l) > 0)
    && (payerMode
      ? !!payerId && payerAmountNum > 0.009 && (payTarget === 0 || !payment.paid || legsMatch(payment.legs, payTarget))
      : (!payment.paid || total === 0 || legsMatch(payment.legs, total)));

  const mutation = useMutation({
    mutationFn: () => api.post<{ data: OrderDetail }>('/purchases/direct', {
      supplierId,
      documentNumber: documentNumber || undefined,
      date: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      notes: notes || undefined,
      includeTax,
      payerId: payerMode ? (payerId || undefined) : undefined,
      payerAmount: payerMode ? payerAmountNum : undefined,
      items: lines.map(l => ({
        productId: l.productId,
        quantity: effQty(l),
        unitCost: effUnitCost(l),
        isBonus: l.isBonus,
      })),
      payment: (payerMode && payTarget === 0) ? undefined : payment,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable-summary'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success(payerMode
        ? (payTarget > 0
          ? `Compra registrada — ${formatCurrency(payerAmountNum)} financiado por el pagador, resto ${payment.paid ? 'pagado' : 'a crédito'}.`
          : 'Compra registrada — pagada al proveedor, queda pendiente reponer al pagador.')
        : payment.paid
          ? 'Compra registrada y pagada — stock, costo y caja actualizados.'
          : 'Compra registrada como crédito — queda en Cuentas por Pagar.');
      onCreated(res.data.data);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const catalogToShow = (catalog ?? []).filter(c => !lines.find(l => l.productId === c.productId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Registrar Compra</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Mercadería que ya llegó — actualiza stock y costo promedio de inmediato.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="rounded-lg border p-4 grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Proveedor *</label>
              <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">N° Documento</label>
              <Input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="F001-000123" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {supplierId && catalogToShow.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">Catálogo de este proveedor</label>
              <div className="flex flex-wrap gap-1.5">
                {catalogToShow.map(c => (
                  <button key={c.productId} onClick={() => addLine(c.product, c.price)}
                    className="rounded-full border px-3 py-1 text-xs hover:border-primary hover:bg-primary/5 transition-colors">
                    {c.product.name} · S/ {c.price.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                  <button key={p.id} onClick={() => addLine(p, Number(p.costPrice))}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                    <span>{p.name}{p.isBulk && <span className="ml-1.5 text-xs text-muted-foreground">(granel · {p.bulkUnit})</span>}</span>
                    <span className="text-muted-foreground">Stock: {p.currentStock} · {formatCost(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={l.productId} className={cn('rounded-lg border p-3 space-y-2', l.isBonus && 'bg-success/5 border-success/30')}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-medium truncate">{l.name}</p>
                      {l.isBulk && <Badge variant="secondary" className="shrink-0 text-xs">Granel · {l.bulkUnit}</Badge>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button type="button" size="sm" variant={l.isBonus ? 'outline' : 'default'}
                        className="h-7 px-2 text-xs" onClick={() => updateLine(idx, { isBonus: false })}>
                        Compra
                      </Button>
                      <Button type="button" size="sm" variant={l.isBonus ? 'success' : 'outline'}
                        className="h-7 px-2 text-xs" onClick={() => updateLine(idx, { isBonus: true })}>
                        Bonificación
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {l.isBulk && (
                    <button type="button" onClick={() => updateLine(idx, { useBulkEntry: !l.useBulkEntry })}
                      className="text-xs text-primary hover:underline">
                      {l.useBulkEntry ? '← Ingresar cantidad directamente' : 'Ingresar por N° de sacos/bultos →'}
                    </button>
                  )}

                  {l.useBulkEntry ? (
                    <div className="grid grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">N° sacos</label>
                        <Input type="number" min={0} value={l.sacks} onChange={e => updateLine(idx, { sacks: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Peso/saco ({l.bulkUnit})</label>
                        <Input type="number" min={0} step={0.01} value={l.weightPerSack} onChange={e => updateLine(idx, { weightPerSack: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">{l.isBonus ? 'Costo total (n/a)' : 'Costo total del lote'}</label>
                        <MoneyInput size="sm" min={0} value={l.totalCost} disabled={l.isBonus}
                          onChange={e => updateLine(idx, { totalCost: e.target.value })} />
                      </div>
                      <div className="text-xs text-muted-foreground pb-2 tabular-nums">
                        = {effQty(l).toLocaleString('es-PE', { maximumFractionDigits: 3 })} {l.bulkUnit} · S/ {effUnitCost(l).toFixed(4)} c/u
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Cantidad{l.isBulk ? ` (${l.bulkUnit})` : ''}</label>
                        <Input type="number" min={0} step={l.isBulk ? 0.01 : 1} value={l.quantity}
                          onChange={e => updateLine(idx, { quantity: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Costo unit.</label>
                        <MoneyInput size="sm" min={0} value={l.isBonus ? '0' : l.unitCost} disabled={l.isBonus}
                          onChange={e => updateLine(idx, { unitCost: e.target.value })} />
                      </div>
                      <div className="text-base text-right font-bold tabular-nums pb-1.5">
                        {l.isBonus ? <span className="text-success">GRATIS</span> : formatCurrency(effQty(l) * effUnitCost(l))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>

          {lines.length > 0 && (
            <>
              <div className="rounded-lg border p-4 space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit ml-auto">
                  <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} className="h-4 w-4 rounded border-input" />
                  Sumar IGV 18% (solo si el proveedor factura y lo desglosa aparte)
                </label>
                {includeTax && (
                  <>
                    <div className="flex justify-end text-sm text-muted-foreground tabular-nums">Subtotal: {formatCurrency(subtotal)}</div>
                    <div className="flex justify-end text-sm text-muted-foreground tabular-nums">IGV (18%): {formatCurrency(taxAmount)}</div>
                  </>
                )}
                <div className="flex justify-end items-baseline gap-2 border-t pt-1.5">
                  <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="rounded-lg border-2 p-4 space-y-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">¿Quién pagó esta compra?</label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={!payerMode ? 'default' : 'outline'} className="flex-1"
                    onClick={() => { setPayerMode(false); setPayerId(''); setShowNewPayer(false); }}>
                    La empresa
                  </Button>
                  <Button type="button" size="sm" variant={payerMode ? 'default' : 'outline'} className="flex-1"
                    onClick={() => {
                      setPayerMode(true);
                      setPayerAmountInput(String(total));
                      if (!payers || payers.length === 0) setShowNewPayer(true);
                    }}>
                    Un tercero (todo o en parte)
                  </Button>
                </div>
                {payerMode && !!payers?.length && (
                  <Select compact value={payerId} onChange={e => setPayerId(e.target.value)}>
                    <option value="">Seleccionar pagador...</option>
                    {payers.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                  </Select>
                )}
                {payerMode && payerId && (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Monto que financia {payers?.find(p => p.id === payerId)?.name}</label>
                      <MoneyInput size="sm" min={0} max={total} value={payerAmountInput}
                        onChange={e => setPayerAmountInput(e.target.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General — se abre
                      una deuda con <strong>{payers?.find(p => p.id === payerId)?.name}</strong> que se repone luego
                      desde la pestaña "Pagadores".
                      {payTarget > 0 && <> El resto ({formatCurrency(payTarget)}) se paga al contado o queda a crédito con el proveedor, abajo.</>}
                    </p>
                  </div>
                )}
                {payerMode && showNewPayer && (
                  <div className="rounded-md bg-muted/50 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Nombre *" value={newPayerName} onChange={e => setNewPayerName(e.target.value)} className="h-8" />
                      <Input placeholder="Teléfono (opcional)" value={newPayerPhone} onChange={e => setNewPayerPhone(e.target.value)} className="h-8" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      {!!payers?.length && <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewPayer(false)}>Cancelar</Button>}
                      <Button type="button" size="sm" disabled={!newPayerName.trim()} loading={createPayerMutation.isPending}
                        onClick={() => createPayerMutation.mutate()}>
                        Crear pagador
                      </Button>
                    </div>
                  </div>
                )}
                {payerMode && !showNewPayer && (
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewPayer(true)}>
                    + Nuevo pagador
                  </button>
                )}
              </div>

              {!payerMode && <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={total} onChange={setPayment} />}
              {payerMode && payerId && payTarget > 0 && (
                <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={payTarget} onChange={setPayment} />
              )}
            </>
          )}
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Registrar Compra
          </Button>
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
  const taxAmount = includeTax ? subtotal * 0.18 : 0;
  const total = subtotal + taxAmount;

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
              <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
              </Select>
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
                    <span className="text-muted-foreground">Stock: {p.currentStock} · {formatCost(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                      <Input type="number" min={1} value={item.orderedQty}
                        onChange={e => updateItem(idx, 'orderedQty', Number(e.target.value))}
                        className="h-9 text-center" />
                    </td>
                    <td className="py-2 px-2">
                      <MoneyInput size="sm" min={0} value={item.unitCost}
                        onChange={e => updateItem(idx, 'unitCost', Number(e.target.value))} />
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(item.orderedQty * item.unitCost)}</td>
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
                  <td colSpan={3} className="py-2 text-right font-semibold">Subtotal</td>
                  <td className="py-2 text-right font-bold tabular-nums">{formatCurrency(subtotal)}</td>
                  <td />
                </tr>
                {includeTax && (
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-muted-foreground text-xs">IGV (18%)</td>
                    <td className="py-1 text-right text-muted-foreground text-xs tabular-nums">{formatCurrency(taxAmount)}</td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="py-2 text-right text-sm font-semibold uppercase tracking-wide text-muted-foreground">Total</td>
                  <td className="py-2 text-right text-xl font-bold tabular-nums">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}

          {items.length > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer w-fit ml-auto">
              <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Sumar IGV 18% (solo si el proveedor factura y lo desglosa aparte)
            </label>
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
                        <p className="text-lg font-bold tabular-nums text-primary">{formatCurrency(groupTotal)}</p>
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
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                          <p className="text-xs text-muted-foreground">
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
                    <td colSpan={3} className="py-2 text-right text-sm font-semibold uppercase tracking-wide text-muted-foreground">Subtotal (sin IGV)</td>
                    <td className="py-2 text-right text-xl font-bold tabular-nums">{formatCurrency(total)}</td>
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
      unitCost: Number(i.unitCost), isBonus: false,
    }))
  );
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState('');
  const [bonusSearch, setBonusSearch] = useState('');
  const debouncedBonusSearch = useDebouncedValue(bonusSearch, 300);
  const [payment, setPayment] = useState<{ paid: boolean; legs: PaymentLeg[] }>({ paid: true, legs: [{ amount: 0, method: 'CASH' }] });
  const receiptTotal = items.reduce((s, i) => s + (i.isBonus ? 0 : i.receivedQty * i.unitCost), 0);

  // Igual que en Registrar Compra: si esta orden ya viene financiada por un
  // pagador (asignado al recibir una entrega anterior) se mantiene fijo —
  // no se puede cambiar de pagador a mitad de camino.
  const [payerMode, setPayerMode] = useState(!!order.payerId);
  const [payerId, setPayerId] = useState(order.payerId ?? '');
  const [payerAmountInput, setPayerAmountInput] = useState('');
  const [showNewPayer, setShowNewPayer] = useState(false);
  const [newPayerName, setNewPayerName] = useState('');
  const [newPayerPhone, setNewPayerPhone] = useState('');

  const { data: payers } = useQuery({
    queryKey: ['payers'],
    queryFn: async () => (await api.get<{ data: Payer[] }>('/purchases/payers')).data.data,
  });

  const createPayerMutation = useMutation({
    mutationFn: () => api.post<{ data: Payer }>('/purchases/payers', { name: newPayerName, phone: newPayerPhone || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      setPayerId(res.data.data.id);
      setShowNewPayer(false);
      setNewPayerName('');
      setNewPayerPhone('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const payerAmountNum = payerMode ? Math.min(Number(payerAmountInput) || 0, receiptTotal) : 0;
  const payTarget = payerMode ? Math.max(0, receiptTotal - payerAmountNum) : receiptTotal;

  useEffect(() => {
    setPayment(p => p.legs.length === 1 && p.legs[0].amount !== payTarget
      ? { ...p, legs: [{ ...p.legs[0], amount: payTarget }] }
      : p);
  }, [payTarget]);

  const canSubmitPayment = payerMode
    ? !!payerId && payerAmountNum > 0.009 && (payTarget === 0 || !payment.paid || legsMatch(payment.legs, payTarget))
    : (!payment.paid || receiptTotal === 0 || legsMatch(payment.legs, receiptTotal));

  const { data: bonusResults } = useQuery({
    queryKey: ['products-search', debouncedBonusSearch],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; barcode: string | null; costPrice: number }> }>(`/products?q=${debouncedBonusSearch}&limit=10`)).data.data,
    enabled: debouncedBonusSearch.length >= 2,
  });

  const addBonusProduct = (p: { id: string; name: string; barcode: string | null }) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(v => [...v, { productId: p.id, name: p.name, barcode: p.barcode, orderedQty: 0, receivedQty: 1, unitCost: 0, isBonus: true }]);
    setBonusSearch('');
  };

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
      items: items.map(i => ({ productId: i.productId, receivedQty: i.receivedQty, unitCost: i.unitCost, isBonus: i.isBonus })),
      notes,
      payerId: payerMode ? (payerId || undefined) : undefined,
      payerAmount: payerMode ? payerAmountNum : undefined,
      payment: (payerMode && payTarget === 0) ? undefined : payment,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success(payerMode
        ? (payTarget > 0
          ? `Mercadería recibida — ${formatCurrency(payerAmountNum)} financiado por el pagador, resto ${payment.paid ? 'pagado' : 'a crédito'}.`
          : 'Mercadería recibida — pagada al proveedor, queda pendiente reponer al pagador.')
        : payment.paid
          ? 'Mercadería recibida y pagada — stock y caja actualizados.'
          : 'Mercadería recibida como crédito — queda en Cuentas por Pagar.');
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
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-semibold">Producto</th>
                <th className="py-2 font-semibold text-center w-20">Pedido</th>
                <th className="py-2 font-semibold text-center w-24">Recibido</th>
                <th className="py-2 font-semibold text-right w-32">Costo unit.</th>
                <th className="py-2 font-semibold text-center w-16">Bonif.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <tr key={item.productId} className={cn(item.isBonus && 'bg-success/5')}>
                  <td className="py-2">{item.name}</td>
                  <td className="py-2 text-center text-muted-foreground">{item.orderedQty || '—'}</td>
                  <td className="py-2 px-2">
                    <Input type="number" min={0} step={0.001} value={item.receivedQty}
                      onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, receivedQty: Number(e.target.value) } : i))}
                      className="h-9 text-center" />
                  </td>
                  <td className="py-2 px-2">
                    <MoneyInput size="sm" min={0} value={item.isBonus ? 0 : item.unitCost} disabled={item.isBonus}
                      onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, unitCost: Number(e.target.value) } : i))} />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={item.isBonus} className="h-4 w-4"
                      onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, isBonus: e.target.checked } : i))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <label className="mb-1 block text-sm font-medium">Agregar producto bonificado (que no estaba en la orden)</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Ej: te regalaron un producto distinto..." value={bonusSearch}
                onChange={e => setBonusSearch(e.target.value)} />
            </div>
            {bonusResults && bonusResults.length > 0 && bonusSearch.length >= 2 && (
              <div className="border rounded-lg mt-1 divide-y max-h-32 overflow-y-auto bg-popover shadow-lg">
                {bonusResults.map(p => (
                  <button key={p.id} onClick={() => addBonusProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted">{p.name}</button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Notas de recepción</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>

          {receiptTotal > 0 && (
            <>
              <div className="rounded-lg border-2 p-4 space-y-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">¿Quién paga esta recepción?</label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={!payerMode ? 'default' : 'outline'} className="flex-1"
                    disabled={!!order.payerId}
                    onClick={() => { setPayerMode(false); setPayerId(''); setShowNewPayer(false); }}>
                    La empresa
                  </Button>
                  <Button type="button" size="sm" variant={payerMode ? 'default' : 'outline'} className="flex-1"
                    onClick={() => {
                      setPayerMode(true);
                      setPayerAmountInput(String(receiptTotal));
                      if (!payers || payers.length === 0) setShowNewPayer(true);
                    }}>
                    Un tercero (todo o en parte)
                  </Button>
                </div>
                {order.payerId && (
                  <p className="text-xs text-muted-foreground">
                    Esta orden ya está financiada por un pagador — no se puede cambiar de tercero, solo sumar más monto o completar con la empresa.
                  </p>
                )}
                {payerMode && !!payers?.length && (
                  <Select compact value={payerId} onChange={e => setPayerId(e.target.value)} disabled={!!order.payerId}>
                    <option value="">Seleccionar pagador...</option>
                    {payers.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                  </Select>
                )}
                {payerMode && payerId && (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Monto que financia {payers?.find(p => p.id === payerId)?.name}</label>
                      <MoneyInput size="sm" min={0} max={receiptTotal} value={payerAmountInput}
                        onChange={e => setPayerAmountInput(e.target.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General — se abre
                      una deuda con <strong>{payers?.find(p => p.id === payerId)?.name}</strong> que se repone luego
                      desde la pestaña "Pagadores".
                      {payTarget > 0 && <> El resto ({formatCurrency(payTarget)}) se paga al contado o queda a crédito con el proveedor, abajo.</>}
                    </p>
                  </div>
                )}
                {payerMode && showNewPayer && (
                  <div className="rounded-md bg-muted/50 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Nombre *" value={newPayerName} onChange={e => setNewPayerName(e.target.value)} className="h-8" />
                      <Input placeholder="Teléfono (opcional)" value={newPayerPhone} onChange={e => setNewPayerPhone(e.target.value)} className="h-8" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      {!!payers?.length && <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewPayer(false)}>Cancelar</Button>}
                      <Button type="button" size="sm" disabled={!newPayerName.trim()} loading={createPayerMutation.isPending}
                        onClick={() => createPayerMutation.mutate()}>
                        Crear pagador
                      </Button>
                    </div>
                  </div>
                )}
                {payerMode && !showNewPayer && (
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewPayer(true)}>
                    + Nuevo pagador
                  </button>
                )}
              </div>

              {!payerMode && <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={receiptTotal} onChange={setPayment} />}
              {payerMode && payerId && payTarget > 0 && (
                <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={payTarget} onChange={setPayment} />
              )}
            </>
          )}
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmitPayment}>
            <PackageCheck className="mr-2 h-4 w-4" />Confirmar recepción
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Registrar pago de una compra a crédito ─────────────────────────────── */
function PayPurchaseModal({ order, onClose, onPaid }: {
  order: { id: string; orderNumber: string; totalAmount: number; paidAmount: number; payerId?: string | null };
  onClose: () => void; onPaid: () => void;
}) {
  const outstanding = order.totalAmount - order.paidAmount;
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [legs, setLegs] = useState<PaymentLeg[]>([{ amount: outstanding, method: 'CASH' }]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const amountNum = Number(amount) || 0;

  // Igual que en Recibir/Registrar: si esta orden ya está financiada por un
  // pagador, no se puede cambiar de tercero a mitad de camino.
  const [payerMode, setPayerMode] = useState(!!order.payerId);
  const [payerId, setPayerId] = useState(order.payerId ?? '');
  const [payerAmountInput, setPayerAmountInput] = useState('');
  const [showNewPayer, setShowNewPayer] = useState(false);
  const [newPayerName, setNewPayerName] = useState('');
  const [newPayerPhone, setNewPayerPhone] = useState('');

  const { data: payers } = useQuery({
    queryKey: ['payers'],
    queryFn: async () => (await api.get<{ data: Payer[] }>('/purchases/payers')).data.data,
  });

  const createPayerMutation = useMutation({
    mutationFn: () => api.post<{ data: Payer }>('/purchases/payers', { name: newPayerName, phone: newPayerPhone || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      setPayerId(res.data.data.id);
      setShowNewPayer(false);
      setNewPayerName('');
      setNewPayerPhone('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const payerAmountNum = payerMode ? Math.min(Number(payerAmountInput) || 0, amountNum) : 0;
  // Lo que no cubre el pagador se paga al contado (legs), igual que en los
  // otros dos formularios de pago mixto.
  const legsTarget = Math.max(0, amountNum - payerAmountNum);

  // Igual que en Registrar/Recibir: mientras haya una sola forma de pago, se
  // mantiene igualada al monto a pagar — si ya se fraccionó, no se toca.
  useEffect(() => {
    setLegs(l => l.length === 1 && l[0].amount !== legsTarget ? [{ ...l[0], amount: legsTarget }] : l);
  }, [legsTarget]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/pay`, {
      legs: legsTarget > 0 ? legs : [],
      reference: reference || undefined, notes: notes || undefined,
      payerId: payerMode ? (payerId || undefined) : undefined,
      payerAmount: payerMode ? payerAmountNum : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success('Pago registrado.');
      onPaid();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = amountNum > 0 && amountNum <= outstanding + 0.009
    && (payerMode
      ? !!payerId && payerAmountNum > 0.009 && (legsTarget === 0 || legsMatch(legs, legsTarget))
      : legsMatch(legs, amountNum));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Pagar a proveedor</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{order.orderNumber} · Saldo pendiente: {formatCurrency(outstanding)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Monto a pagar</label>
            <MoneyInput min={0.01} max={outstanding} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div className="rounded-lg border-2 p-4 space-y-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">¿Quién paga esto?</label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={!payerMode ? 'default' : 'outline'} className="flex-1"
                disabled={!!order.payerId}
                onClick={() => { setPayerMode(false); setPayerId(''); setShowNewPayer(false); }}>
                La empresa
              </Button>
              <Button type="button" size="sm" variant={payerMode ? 'default' : 'outline'} className="flex-1"
                onClick={() => {
                  setPayerMode(true);
                  setPayerAmountInput(String(amountNum));
                  if (!payers || payers.length === 0) setShowNewPayer(true);
                }}>
                Un tercero (todo o en parte)
              </Button>
            </div>
            {payerMode && !!payers?.length && (
              <Select compact value={payerId} onChange={e => setPayerId(e.target.value)} disabled={!!order.payerId}>
                <option value="">Seleccionar pagador...</option>
                {payers.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
              </Select>
            )}
            {payerMode && payerId && (
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Monto que financia {payers?.find(p => p.id === payerId)?.name}</label>
                  <MoneyInput size="sm" min={0} max={amountNum} value={payerAmountInput}
                    onChange={e => setPayerAmountInput(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General — se abre
                  una deuda con <strong>{payers?.find(p => p.id === payerId)?.name}</strong> que se repone luego
                  desde la pestaña "Pagadores".
                  {legsTarget > 0 && <> El resto ({formatCurrency(legsTarget)}) se paga al contado, abajo.</>}
                </p>
              </div>
            )}
            {payerMode && showNewPayer && (
              <div className="rounded-md bg-muted/50 p-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nombre *" value={newPayerName} onChange={e => setNewPayerName(e.target.value)} className="h-8" />
                  <Input placeholder="Teléfono (opcional)" value={newPayerPhone} onChange={e => setNewPayerPhone(e.target.value)} className="h-8" />
                </div>
                <div className="flex gap-2 justify-end">
                  {!!payers?.length && <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewPayer(false)}>Cancelar</Button>}
                  <Button type="button" size="sm" disabled={!newPayerName.trim()} loading={createPayerMutation.isPending}
                    onClick={() => createPayerMutation.mutate()}>
                    Crear pagador
                  </Button>
                </div>
              </div>
            )}
            {payerMode && !showNewPayer && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowNewPayer(true)}>
                + Nuevo pagador
              </button>
            )}
          </div>

          {legsTarget > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">¿De dónde sale el dinero?</label>
              <PaymentLegsEditor total={legsTarget} legs={legs} onChange={setLegs} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Referencia (opcional)</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° operación, voucher..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Confirmar pago
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Pago "por monto" a un proveedor o pagador — amortiza sus compras más
 * antiguas hasta agotar el monto, en vez de tener que pagar orden por orden. */
function PayAmountModal({ title, subtitle, totalOwed, payUrl, invalidateKeys, onClose, onPaid }: {
  title: string; subtitle: string; totalOwed: number; payUrl: string;
  invalidateKeys: string[][];
  onClose: () => void; onPaid: () => void;
}) {
  const [amount, setAmount] = useState(totalOwed.toFixed(2));
  const [legs, setLegs] = useState<PaymentLeg[]>([{ amount: totalOwed, method: 'CASH' }]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const amountNum = Number(amount) || 0;

  useEffect(() => {
    setLegs(l => l.length === 1 && l[0].amount !== amountNum ? [{ ...l[0], amount: amountNum }] : l);
  }, [amountNum]);

  const mutation = useMutation({
    mutationFn: () => api.post(payUrl, { legs, reference: reference || undefined, notes: notes || undefined }),
    onSuccess: () => {
      invalidateKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success('Pago registrado — repartido automáticamente entre las compras más antiguas.');
      onPaid();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = amountNum > 0 && amountNum <= totalOwed + 0.009 && legsMatch(legs, amountNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle} · Total: {formatCurrency(totalOwed)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Monto a pagar</label>
            <MoneyInput min={0.01} max={totalOwed} value={amount} onChange={e => setAmount(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Se reparte solo entre las compras más antiguas hasta agotar el monto.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">¿De dónde sale el dinero?</label>
            <PaymentLegsEditor total={amountNum} legs={legs} onChange={setLegs} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Referencia (opcional)</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° operación, voucher..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Confirmar pago
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Corregir una línea recibida (producto, costo y/o bonificación) ─────── */
// Editar cantidad/costo de una línea ANTES de recibirla — para errores de
// tipeo (ej. "1" en vez de "20") sin anular y rehacer toda la orden.
function EditOrderItemModal({ order, item, onClose, onEdited }: {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Editar línea</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{order.orderNumber} · {item.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Cantidad</label>
              <Input type="number" min={0.001} step={0.001} value={orderedQty}
                onChange={e => setOrderedQty(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Costo unitario</label>
              <MoneyInput min={0} value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Nuevo subtotal: {formatCurrency(qtyNum * costNum)} — el total de la orden se recalcula automáticamente.
          </p>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasChanges || qtyNum <= 0}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CorrectItemModal({ order, item, onClose, onCorrected }: {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Corregir línea</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{order.orderNumber} · Registrado como: {item.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            El stock, costo y lo que se le debe al proveedor se recalculan automáticamente con los valores que corrijas abajo.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">Cambiar producto (opcional)</label>
            {toProduct ? (
              <div className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <span className="font-medium">{toProduct.name}</span>
                <button onClick={() => setToProduct(null)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar el producto correcto..." value={search}
                  onChange={e => setSearch(e.target.value)} />
                {results && results.length > 0 && search.length >= 2 && (
                  <div className="absolute z-10 w-full border rounded-lg mt-1 divide-y max-h-40 overflow-y-auto bg-popover shadow-lg">
                    {results.filter(p => p.id !== item.productId).map(p => (
                      <button key={p.id} onClick={() => { setToProduct(p); setSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted">{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cantidad recibida</label>
            <Input type="number" min={0.001} step={0.001} value={quantity} onChange={e => setQuantity(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Solo se puede corregir si este producto se recibió en una única entrega dentro de esta orden.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" id="correctIsBonus" checked={isBonus}
              onChange={e => setIsBonus(e.target.checked)} className="h-4 w-4 rounded border-input" />
            <label htmlFor="correctIsBonus" className="text-sm font-medium cursor-pointer">Es bonificación del proveedor (costo S/ 0.00)</label>
          </div>
          {!isBonus && (
            <div>
              <label className="mb-1 block text-sm font-medium">Costo unitario</label>
              <MoneyInput min={0} value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Motivo</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: se recibió mal, era bonificación del proveedor" autoFocus />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasChanges || reason.trim().length < 3}>
            Confirmar corrección
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
  const [showPay, setShowPay] = useState(false);
  const [correctingItem, setCorrectingItem] = useState<{ productId: string; name: string; receivedQty: number; unitCost: number; isBonus: boolean } | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; orderedQty: number; unitCost: number } | null>(null);
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

  const voidMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${order.id}/void`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Compra anulada — stock y costo revertidos a como estaban antes.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const discrepancyMutation = useMutation({
    mutationFn: (hasDiscrepancy: boolean) => {
      const notes = hasDiscrepancy ? window.prompt('¿Cuál es la discrepancia? (ej: llegó menos cantidad de la pedida)') ?? undefined : undefined;
      return api.patch(`/purchases/${order.id}/discrepancy`, { hasDiscrepancy, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Se actualizó el estado de observación.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const revertPaymentMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${order.id}/revert-payment`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success('Pago revertido — el dinero volvió a Caja General y la orden quedó a crédito.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleRevertPayment = () => {
    const reason = window.prompt('Motivo de la corrección (ej: se marcó pagada por error, en realidad es a crédito):');
    if (reason) revertPaymentMutation.mutate(reason);
  };

  const handleVoid = async () => {
    try {
      const checkRes = await api.get<{ data: { hasWarning: boolean; affectedProducts: string[] } }>(`/purchases/${order.id}/void-check`);
      const { hasWarning, affectedProducts } = checkRes.data.data;
      if (hasWarning) {
        const proceed = confirm(
          `Ya se vendieron estos productos después de esta compra: ${affectedProducts.join(', ')}.\n\n` +
          `Anular esta compra podría no reflejar el estado real de tu inventario. ¿Anular de todas formas?`,
        );
        if (!proceed) return;
      }
      const reason = window.prompt('Motivo de la anulación:');
      if (reason) voidMutation.mutate(reason);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const canApprove = order.status === 'PENDING_APPROVAL';
  const canReceive = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order.status);
  const canCancel = !['RECEIVED', 'CANCELLED'].includes(order.status);
  const canVoid = order.status === 'RECEIVED';
  // Antes de recibir mercadería no hay stock/costo que revertir — se puede
  // corregir cantidad/costo directo en la línea, sin pasar por "corregir
  // línea recibida" (que sí revierte kardex).
  const canEditItems = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(order.status);

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <td className="px-4 py-3.5 font-semibold">{order.orderNumber}</td>
        <td className="px-4 py-3.5">{order.supplier.businessName}</td>
        <td className="px-4 py-3.5">
          <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </td>
        <td className="px-4 py-3.5">
          <Badge variant={ACCOUNTING_STATE_VARIANT[order.accountingState] ?? 'default'}>
            {ACCOUNTING_STATE_LABELS[order.accountingState] ?? order.accountingState}
          </Badge>
        </td>
        <td className="px-4 py-3.5 text-muted-foreground">{formatDateTime(order.createdAt)}</td>
        <td className="px-4 py-3.5 text-right text-base font-bold tabular-nums">{formatCurrency(order.totalAmount)}</td>
        <td className="px-4 py-3.5 text-center">{order._count.items}</td>
        <td className="px-4 py-3.5">
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
            {canVoid && <Button size="sm" variant="ghost" className="text-destructive" onClick={handleVoid} loading={voidMutation.isPending}>
              Anular
            </Button>}
          </div>
        </td>
        <td className="px-4 py-3.5">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>

      {expanded && detail && (
        <tr>
          <td colSpan={9} className="bg-muted/20 px-6 py-4">
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
                    {(!detail.voidedAt || canEditItems) && <th className="py-1" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detail.items.map(item => (
                    <tr key={item.id}>
                      <td className="py-1.5">
                        {item.product.name}
                        {item.isBonus && <Badge variant="success" className="ml-1.5 text-xs">Bonificación</Badge>}
                      </td>
                      <td className="py-1.5 text-center">{item.orderedQty}</td>
                      <td className={cn('py-1.5 text-center', item.receivedQty >= item.orderedQty ? 'text-success' : item.receivedQty > 0 ? 'text-amber-500' : '')}>
                        {item.receivedQty}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{item.isBonus ? 'GRATIS' : formatCost(item.unitCost)}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{formatCurrency(item.subtotal)}</td>
                      {(!detail.voidedAt || canEditItems) && (
                        <td className="py-1.5 text-right">
                          {canEditItems && (
                            <button
                              title="Editar cantidad o costo de esta línea"
                              className="text-muted-foreground hover:text-primary"
                              onClick={() => setEditingItem({
                                id: item.id, name: item.product.name,
                                orderedQty: Number(item.orderedQty), unitCost: Number(item.unitCost),
                              })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!canEditItems && !detail.voidedAt && item.receivedQty > 0 && (
                            <button
                              title="Corregir esta línea (producto, costo o bonificación)"
                              className="text-muted-foreground hover:text-primary"
                              onClick={() => setCorrectingItem({
                                productId: item.product.id, name: item.product.name,
                                receivedQty: Number(item.receivedQty), unitCost: Number(item.unitCost), isBonus: item.isBonus,
                              })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.notes && <p className="text-muted-foreground text-xs">Notas: {detail.notes}</p>}

              {detail.hasDiscrepancy && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive space-y-1">
                  <p className="font-semibold">Observada — no entra a pagos "por monto" (FIFO) hasta resolverse</p>
                  {detail.discrepancyNotes && <p>{detail.discrepancyNotes}</p>}
                </div>
              )}

              {['RECEIVED', 'PARTIALLY_RECEIVED'].includes(detail.status) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wide">Pagos a proveedor</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={PAYMENT_STATUS_VARIANT[detail.paymentStatus] ?? 'default'}>
                        {PAYMENT_STATUS_LABELS[detail.paymentStatus] ?? detail.paymentStatus}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Pagado {formatCurrency(detail.paidAmount)} de {formatCurrency(detail.totalAmount)}
                        {detail.dueDate && <> · vence {formatDateTime(detail.dueDate)}</>}
                      </span>
                    </div>
                  </div>
                  {detail.payerAmount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(detail.payerAmount)} financiado por un pagador (no salió de Caja General).
                    </p>
                  )}
                  {detail.payments.length > 0 && (
                    <div className="space-y-1">
                      {detail.payments.map(p => (
                        <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatDateTime(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                          <span className="font-semibold tabular-nums text-foreground">{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {detail.paymentStatus !== 'PAID' && (
                      <Button size="sm" onClick={() => setShowPay(true)}>Registrar pago</Button>
                    )}
                    {detail.paymentStatus !== 'CREDIT' && !detail.voidedAt && (
                      <Button size="sm" variant="outline" onClick={handleRevertPayment} loading={revertPaymentMutation.isPending}>
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" />Revertir pago (era a crédito)
                      </Button>
                    )}
                    {!detail.voidedAt && (
                      <Button
                        size="sm" variant="outline"
                        className={detail.hasDiscrepancy ? '' : 'text-destructive'}
                        onClick={() => discrepancyMutation.mutate(!detail.hasDiscrepancy)}
                        loading={discrepancyMutation.isPending}
                      >
                        {detail.hasDiscrepancy ? 'Quitar observación' : 'Marcar como observada'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {detail.voidedAt && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  <p className="font-semibold">Anulada el {formatDateTime(detail.voidedAt)}{detail.voidedBy ? ` por ${detail.voidedBy.firstName} ${detail.voidedBy.lastName}` : ''}</p>
                  {detail.voidReason && <p className="mt-0.5">Motivo: {detail.voidReason}</p>}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => printPurchaseReceipt(detail)}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />Imprimir comprobante
              </Button>
            </div>
          </td>
        </tr>
      )}

      {showPay && detail && (
        <PayPurchaseModal order={detail} onClose={() => setShowPay(false)} onPaid={() => setShowPay(false)} />
      )}

      {showReceive && detail && (
        <ReceiveOrderModal
          order={detail}
          onClose={() => setShowReceive(false)}
          onReceived={() => setShowReceive(false)}
        />
      )}

      {correctingItem && (
        <CorrectItemModal
          order={order}
          item={correctingItem}
          onClose={() => setCorrectingItem(null)}
          onCorrected={() => setCorrectingItem(null)}
        />
      )}

      {editingItem && (
        <EditOrderItemModal
          order={order}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onEdited={() => setEditingItem(null)}
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
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Razón social</th>
                  <th className="px-4 py-3 text-left font-semibold">RUC</th>
                  <th className="px-4 py-3 text-left font-semibold">Contacto</th>
                  <th className="px-4 py-3 text-left font-semibold">Teléfono</th>
                  <th className="px-4 py-3 text-center font-semibold">Órdenes</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data ?? []).map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3.5 font-semibold">{s.businessName}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{s.taxId ?? '—'}</td>
                    <td className="px-4 py-3.5">{s.contactName ?? '—'}</td>
                    <td className="px-4 py-3.5">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-center">{s._count?.purchaseOrders ?? 0}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Badge variant={s.isActive ? 'success' : 'secondary'}>{s.isActive ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="px-4 py-3.5">
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
const METHOD_USED_LABELS: Record<string, string> = {
  ...PAYMENT_METHOD_LABELS,
  CREDITO_PAGADOR: 'Crédito de pagador', MIXTO: 'Mixto', SIN_PAGO: 'Sin pago',
};

function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [methodUsedFilter, setMethodUsedFilter] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [justRegistered, setJustRegistered] = useState<OrderDetail | null>(null);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sortBy, sortOrder] = sort.split(':');

  const queryString = () => {
    const params = new URLSearchParams({ limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
    if (methodUsedFilter) params.set('methodUsed', methodUsedFilter);
    if (onlyPending) params.set('onlyPending', 'true');
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (dateFrom) params.set('dateFrom', dateFrom);
    // El input type="date" da solo la fecha (medianoche) — sumamos el resto
    // del día para que "Hasta" incluya las compras registradas ese mismo día.
    if (dateTo) params.set('dateTo', `${dateTo}T23:59:59.999`);
    if (dueFrom) params.set('dueFrom', dueFrom);
    if (dueTo) params.set('dueTo', `${dueTo}T23:59:59.999`);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
    return params;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', statusFilter, paymentStatusFilter, methodUsedFilter, onlyPending, debouncedSearch, dateFrom, dateTo, dueFrom, dueTo, sort, page],
    queryFn: async () => {
      const params = queryString();
      params.set('page', String(page));
      return (await api.get<{
        data: PurchaseOrder[];
        pagination: { total: number; totalPages: number };
        totals: { totalAmount: number; paidAmount: number };
      }>(`/purchases?${params}`)).data;
    },
  });

  const hasFilters = !!(statusFilter || paymentStatusFilter || methodUsedFilter || onlyPending || debouncedSearch || dateFrom || dateTo || dueFrom || dueTo);
  const advancedCount = [methodUsedFilter, dateFrom, dateTo, dueFrom, dueTo].filter(Boolean).length + (onlyPending ? 1 : 0);
  const clearFilters = () => {
    setStatusFilter(''); setPaymentStatusFilter(''); setMethodUsedFilter(''); setOnlyPending(false);
    setSearch(''); setDateFrom(''); setDateTo(''); setDueFrom(''); setDueTo(''); setPage(1);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="N° orden, factura o proveedor..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select className="w-44" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select className="w-40" value={paymentStatusFilter} onChange={e => { setPaymentStatusFilter(e.target.value); setPage(1); }}>
              <option value="">Cualquier pago</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select className="w-44" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="createdAt:desc">Más recientes</option>
              <option value="createdAt:asc">Más antiguas</option>
              <option value="totalAmount:desc">Mayor total</option>
              <option value="totalAmount:asc">Menor total</option>
              <option value="orderNumber:desc">N° orden (desc)</option>
              <option value="orderNumber:asc">N° orden (asc)</option>
            </Select>
            <Button variant={showAdvanced ? 'secondary' : 'outline'} size="sm" onClick={() => setShowAdvanced(v => !v)}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />Más filtros
              {advancedCount > 0 && <Badge variant="default" className="ml-1.5 px-1.5">{advancedCount}</Badge>}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" />Limpiar
              </Button>
            )}
          </div>

          {showAdvanced && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Método usado</label>
                <Select compact className="w-44" value={methodUsedFilter} onChange={e => { setMethodUsedFilter(e.target.value); setPage(1); }}>
                  <option value="">Cualquier método</option>
                  {Object.entries(METHOD_USED_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Fecha desde</label>
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Fecha hasta</label>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Vence desde</label>
                <Input type="date" value={dueFrom} onChange={e => { setDueFrom(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Vence hasta</label>
                <Input type="date" value={dueTo} onChange={e => { setDueTo(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <label className="flex items-center gap-2 px-2 pb-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={onlyPending} onChange={e => { setOnlyPending(e.target.checked); setPage(1); }} />
                Solo con saldo pendiente
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            <Button variant="outline"
              onClick={() => downloadExcel(`/purchases/export?${queryString()}`, 'compras.xlsx')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
            </Button>
            <Button variant="outline" onClick={() => setShowSuggest(true)}
              className="border-primary/30 text-primary hover:bg-primary/10">
              <Sparkles className="mr-2 h-4 w-4" />Sugerir Orden
            </Button>
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-2 h-4 w-4" />Nueva Orden
            </Button>
            <Button onClick={() => setShowRegister(true)} className="bg-success text-success-foreground hover:bg-success/90">
              <PackageCheck className="mr-2 h-4 w-4" />Registrar Compra
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">{data.pagination.total} {data.pagination.total === 1 ? 'orden' : 'órdenes'}</span>
          <span className="font-semibold tabular-nums">Total: {formatCurrency(data.totals.totalAmount)}</span>
          <span className="font-semibold tabular-nums text-success">Pagado: {formatCurrency(data.totals.paidAmount)}</span>
          <span className="font-semibold tabular-nums text-destructive">Pendiente: {formatCurrency(data.totals.totalAmount - data.totals.paidAmount)}</span>
        </div>
      )}

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">N° Orden</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Pago</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-center">Ítems</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.data ?? []).map(order => <OrderRow key={order.id} order={order} />)}
                {(data?.data ?? []).length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">No hay órdenes de compra</td></tr>
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
      {showRegister && (
        <RegisterPurchaseModal
          onClose={() => setShowRegister(false)}
          onCreated={(order) => { setShowRegister(false); setJustRegistered(order); }}
        />
      )}

      {justRegistered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl p-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
            <div>
              <h3 className="font-bold text-lg">Compra registrada</h3>
              <p className="text-sm text-muted-foreground">{justRegistered.orderNumber} — {formatCurrency(justRegistered.totalAmount)}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setJustRegistered(null)}>Cerrar</Button>
              <Button className="flex-1" onClick={() => printPurchaseReceipt(justRegistered)}>
                <FileText className="mr-2 h-4 w-4" />Imprimir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Cuentas por Pagar Tab ──────────────────────────────────────────────── */
interface SupplierPayableSummary {
  supplierId: string; businessName: string; totalOwed: number; orderCount: number; oldestDate: string;
  overdueCount: number; observedCount: number;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
}

function AgingRow({ aging }: { aging: Record<'0-15' | '16-30' | '31-60' | '60+', number> }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(['0-15', '16-30', '31-60', '60+'] as const).filter(b => aging[b] > 0).map((b) => (
        <span key={b} className={cn('rounded-full px-2 py-0.5', b === '60+' ? 'bg-destructive/10 text-destructive' : b === '31-60' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground')}>
          {AGING_BUCKET_LABELS[b]}: {formatCurrency(aging[b])}
        </span>
      ))}
    </div>
  );
}

// Detalle de las órdenes pendientes de UN proveedor — se pide solo cuando se
// expande su fila, no de entrada (evita traer todo el detalle de golpe).
function SupplierPayableDetail({ supplierId, onPayOrder }: { supplierId: string; onPayOrder: (o: PayableOrder) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchases-payable', supplierId],
    queryFn: async () => (await api.get<{ data: PayableOrder[] }>(`/purchases/payable?supplierId=${supplierId}&limit=100`)).data.data,
  });

  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground">Cargando...</div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 font-semibold">N° Orden</th>
          <th className="py-2 font-semibold">Fecha</th>
          <th className="py-2 font-semibold text-right">Total</th>
          <th className="py-2 font-semibold text-right">Pagado</th>
          <th className="py-2 font-semibold text-right">Pendiente</th>
          <th className="py-2 w-20" />
        </tr>
      </thead>
      <tbody className="divide-y">
        {(data ?? []).map((o) => (
          <tr key={o.id}>
            <td className="py-2 font-medium">{o.orderNumber}</td>
            <td className="py-2 text-muted-foreground">{formatDateTime(o.createdAt)}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(o.totalAmount)}</td>
            <td className="py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(o.paidAmount)}</td>
            <td className="py-2 text-right font-bold tabular-nums text-destructive">{formatCurrency(o.outstanding)}</td>
            <td className="py-2 text-right">
              <Button size="sm" variant="outline" onClick={() => onPayOrder(o)}>Pagar esta</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PayableTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payOrder, setPayOrder] = useState<PayableOrder | null>(null);
  const [paySupplier, setPaySupplier] = useState<SupplierPayableSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases-payable-summary'],
    queryFn: async () => (await api.get<{ data: { suppliers: SupplierPayableSummary[]; grandTotal: number } }>(
      '/purchases/payable-summary'
    )).data.data,
  });

  return (
    <div className="space-y-4">
      {(data?.suppliers.length ?? 0) > 0 && (
        <Card className="border-t-4 border-t-destructive">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total pendiente a proveedores</span>
            <span className="text-2xl font-bold tabular-nums text-destructive">{formatCurrency(data!.grandTotal)}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="divide-y">
            {(data?.suppliers ?? []).map((s) => (
              <div key={s.supplierId}>
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left"
                  onClick={() => setExpanded(v => v === s.supplierId ? null : s.supplierId)}>
                  <div className="flex items-center gap-2">
                    {expanded === s.supplierId ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{s.businessName}</p>
                        {s.overdueCount > 0 && <Badge variant="destructive">{s.overdueCount} vencida(s)</Badge>}
                        {s.observedCount > 0 && <Badge variant="secondary">{s.observedCount} observada(s)</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{s.orderCount} compra(s) pendiente(s) · desde {formatDateTime(s.oldestDate)}</p>
                      <AgingRow aging={s.aging} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold tabular-nums text-destructive">{formatCurrency(s.totalOwed)}</span>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setPaySupplier(s); }}>Pagar monto</Button>
                  </div>
                </button>
                {expanded === s.supplierId && (
                  <div className="px-4 pb-4 bg-muted/20">
                    <SupplierPayableDetail supplierId={s.supplierId} onPayOrder={setPayOrder} />
                  </div>
                )}
              </div>
            ))}
            {(data?.suppliers ?? []).length === 0 && (
              <div className="py-12 text-center text-muted-foreground">No hay compras pendientes de pago 🎉</div>
            )}
          </div>
        )}
      </Card>

      {payOrder && <PayPurchaseModal order={payOrder} onClose={() => setPayOrder(null)} onPaid={() => setPayOrder(null)} />}
      {paySupplier && (
        <PayAmountModal
          title="Pagar a proveedor"
          subtitle={paySupplier.businessName}
          totalOwed={paySupplier.totalOwed}
          payUrl={`/purchases/suppliers/${paySupplier.supplierId}/pay`}
          invalidateKeys={[['purchases-payable-summary'], ['purchases-payable', paySupplier.supplierId], ['purchases']]}
          onClose={() => setPaySupplier(null)}
          onPaid={() => setPaySupplier(null)}
        />
      )}
    </div>
  );
}

/* ─── Liquidaciones (pagos consolidados a proveedor) Tab ────────────────── */
interface SettlementPayment {
  id: string; paidAt: string; amount: number; method: string;
  reference: string | null; notes: string | null;
  orderNumber: string; orderTotal: number; supplierInvoice: string | null; user: string;
}
interface Settlement {
  supplier: { id: string; businessName: string; taxId: string | null };
  payments: SettlementPayment[];
  totalsByMethod: Record<string, number>;
  grandTotal: number;
  count: number;
}

function printSettlement(s: Settlement, dateFrom: string, dateTo: string) {
  const rangeLabel = dateFrom || dateTo ? `${dateFrom || '...'} a ${dateTo || '...'}` : 'Todo el historial';
  const rows = s.payments.map(p => `
    <tr>
      <td>${formatDateTime(p.paidAt)}</td>
      <td>${p.orderNumber}</td>
      <td>${PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
      <td style="text-align:right">${formatCurrency(p.amount)}</td>
    </tr>`).join('');
  const methodRows = Object.entries(s.totalsByMethod)
    .map(([m, amt]) => `<div class="row"><span>${PAYMENT_METHOD_LABELS[m] ?? m}</span><span>${formatCurrency(amt)}</span></div>`)
    .join('');
  printThermalHtml('Liquidación de Pagos', `
    <p class="c b">LIQUIDACIÓN DE PAGOS</p>
    <p class="c">${s.supplier.businessName}</p>
    ${s.supplier.taxId ? `<p class="c">RUC: ${s.supplier.taxId}</p>` : ''}
    <p class="c">${rangeLabel}</p>
    <div class="line"></div>
    <table><thead><tr><th>Fecha</th><th>OC</th><th>Método</th><th style="text-align:right">Monto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="line"></div>
    ${methodRows}
    <div class="row b"><span>TOTAL (${s.count} pagos)</span><span>${formatCurrency(s.grandTotal)}</span></div>
  `);
}

/* ─── Pagadores (terceros que ponen el dinero de su bolsillo) ───────────── */
interface PayerDebt {
  orderId: string; orderNumber: string; date: string; supplierName: string;
  totalAmount: number; payerAmount: number; reimbursedAmount: number; outstanding: number;
  agingBucket: '0-15' | '16-30' | '31-60' | '60+';
}
interface PaymentHistoryRow {
  id: string; paidAt: string; amount: number; method: string;
  reference: string | null; notes: string | null; batchId: string | null; orderNumber: string; user: string;
}
interface PayerStatement {
  payer: { id: string; name: string; phone: string | null; creditLimit: number };
  totalOwed: number;
  overLimit: boolean;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
  debts: PayerDebt[];
  recentRepayments: PaymentHistoryRow[];
}

function NewPayerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post('/purchases/payers', {
      name, phone: phone || undefined, notes: notes || undefined,
      creditLimit: creditLimit ? Number(creditLimit) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payers'] });
      toast.success('Pagador creado.');
      onCreated();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Nuevo pagador</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Papá, Juan..." autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Límite de crédito (opcional)</label>
            <MoneyInput min={0} value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
              placeholder="0 = sin límite" />
            <p className="mt-1 text-xs text-muted-foreground">Solo avisa si se supera — no bloquea nuevas compras.</p>
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Crear</Button>
        </div>
      </div>
    </div>
  );
}

// Una reposición puede repartirse (FIFO) entre varias compras de un mismo
// pagador — todas esas filas comparten `batchId` (el evento de pago real,
// una sola salida de Caja); se agrupan para mostrar "un pago, N compras"
// en vez de una fila repetida por cada orden que tocó.
function groupRepaymentBatches(rows: PaymentHistoryRow[]) {
  const map = new Map<string, { key: string; paidAt: string; amount: number; method: string; reference: string | null; user: string; orders: string[] }>();
  for (const r of rows) {
    const key = r.batchId ?? r.id;
    const existing = map.get(key);
    if (existing) {
      existing.amount += r.amount;
      existing.orders.push(r.orderNumber);
    } else {
      map.set(key, { key, paidAt: r.paidAt, amount: r.amount, method: r.method, reference: r.reference, user: r.user, orders: [r.orderNumber] });
    }
  }
  return Array.from(map.values());
}

function RepaymentHistoryTable({ batches }: { batches: ReturnType<typeof groupRepaymentBatches> }) {
  if (batches.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Historial de reposiciones</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 font-semibold">Fecha</th>
            <th className="py-2 font-semibold">Método</th>
            <th className="py-2 font-semibold">Compras cubiertas</th>
            <th className="py-2 font-semibold text-right">Monto</th>
            <th className="py-2 font-semibold">Usuario</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {batches.map((b) => (
            <tr key={b.key}>
              <td className="py-2 text-muted-foreground">{formatDateTime(b.paidAt)}</td>
              <td className="py-2">{PAYMENT_METHOD_LABELS[b.method] ?? b.method}{b.reference ? ` (${b.reference})` : ''}</td>
              <td className="py-2 text-xs text-muted-foreground">{b.orders.join(', ')}</td>
              <td className="py-2 text-right font-bold tabular-nums text-success">{formatCurrency(b.amount)}</td>
              <td className="py-2 text-xs text-muted-foreground">{b.user}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Detalle expandido de UN pagador — sus compras fronteadas todavía no
// repuestas, con fecha, proveedor y monto, el botón para reponerle dinero
// (mismo mecanismo de amortización FIFO que a un proveedor), y el historial
// de reposiciones ya hechas (para saber qué se le pagó, cuándo y con qué
// compras se cubrió).
function PayerDetail({ payerId, payerName, onPay }: { payerId: string; payerName: string; onPay: () => void }) {
  const { data: statement, isLoading } = useQuery({
    queryKey: ['purchases-payer-statement', payerId],
    queryFn: async () => (await api.get<{ data: PayerStatement }>(`/purchases/payers/${payerId}/statement`)).data.data,
  });

  if (isLoading) return <div className="py-4 text-center text-xs text-muted-foreground">Cargando...</div>;
  if (!statement) return null;

  const repaymentBatches = groupRepaymentBatches(statement.recentRepayments);

  if (statement.debts.length === 0 && repaymentBatches.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Sin movimientos todavía.</p>;
  }

  return (
    <div className="space-y-4">
      {statement.debts.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin compras pendientes de reponer.</p>
      )}
      {statement.debts.length > 0 && (
      <div className="space-y-2">
      {statement.overLimit && (
        <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
          Supera el límite de crédito ({formatCurrency(statement.payer.creditLimit)}).
        </p>
      )}
      <AgingRow aging={statement.aging} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 font-semibold">N° Orden</th>
            <th className="py-2 font-semibold">Proveedor</th>
            <th className="py-2 font-semibold">Fecha</th>
            <th className="py-2 font-semibold text-right">Financiado</th>
            <th className="py-2 font-semibold text-right">Repuesto</th>
            <th className="py-2 font-semibold text-right">Pendiente</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {statement.debts.map((d) => (
            <tr key={d.orderId}>
              <td className="py-2 font-medium">{d.orderNumber}</td>
              <td className="py-2">{d.supplierName}</td>
              <td className="py-2 text-muted-foreground">{formatDateTime(d.date)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(d.payerAmount)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(d.reimbursedAmount)}</td>
              <td className="py-2 text-right font-bold tabular-nums text-destructive">{formatCurrency(d.outstanding)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={6} className="pt-2">
            <Button size="sm" onClick={onPay}>Reponer dinero a {payerName}</Button>
          </td></tr>
        </tfoot>
      </table>
      </div>
      )}
      <RepaymentHistoryTable batches={repaymentBatches} />
    </div>
  );
}

function PayersTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payPayer, setPayPayer] = useState<Payer | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data: payers, isLoading } = useQuery({
    queryKey: ['payers'],
    queryFn: async () => (await api.get<{ data: Payer[] }>('/purchases/payers')).data.data,
  });

  const grandTotal = (payers ?? []).reduce((s, p) => s + (p.totalOwed ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-xl">
          Terceros que a veces pagan una compra de su bolsillo (no la empresa) — ej. compras en el mercado pagadas
          en efectivo por el dueño. Aquí se ve cuánto se le debe a cada uno y se le repone el dinero.
        </p>
        <Button onClick={() => setShowNew(true)}><Plus className="mr-2 h-4 w-4" />Nuevo pagador</Button>
      </div>

      {grandTotal > 0 && (
        <Card className="border-t-4 border-t-destructive">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total pendiente a pagadores</span>
            <span className="text-2xl font-bold tabular-nums text-destructive">{formatCurrency(grandTotal)}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="divide-y">
            {(payers ?? []).map((p) => (
              <div key={p.id}>
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left"
                  onClick={() => setExpanded(v => v === p.id ? null : p.id)}>
                  <div className="flex items-center gap-2">
                    {expanded === p.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{p.name}</p>
                        {p.overLimit && <Badge variant="destructive">Supera límite</Badge>}
                      </div>
                      {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
                      {p.aging && <AgingRow aging={p.aging} />}
                    </div>
                  </div>
                  <span className={cn('text-xl font-bold tabular-nums', (p.totalOwed ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {formatCurrency(p.totalOwed ?? 0)}
                  </span>
                </button>
                {expanded === p.id && (
                  <div className="px-4 pb-4 bg-muted/20">
                    <PayerDetail payerId={p.id} payerName={p.name} onPay={() => setPayPayer(p)} />
                  </div>
                )}
              </div>
            ))}
            {(payers ?? []).length === 0 && (
              <div className="py-12 text-center text-muted-foreground">No hay pagadores registrados todavía.</div>
            )}
          </div>
        )}
      </Card>

      {showNew && <NewPayerModal onClose={() => setShowNew(false)} onCreated={() => setShowNew(false)} />}
      {payPayer && (
        <PayAmountModal
          title="Reponer dinero"
          subtitle={payPayer.name}
          totalOwed={payPayer.totalOwed ?? 0}
          payUrl={`/purchases/payers/${payPayer.id}/pay`}
          invalidateKeys={[['payers'], ['purchases-payer-statement', payPayer.id]]}
          onClose={() => setPayPayer(null)}
          onPaid={() => setPayPayer(null)}
        />
      )}
    </div>
  );
}

interface SupplierStatementDebt {
  orderId: string; orderNumber: string; date: string; dueDate: string | null; supplierInvoice: string | null;
  totalAmount: number; paidAmount: number; outstanding: number;
  agingBucket: '0-15' | '16-30' | '31-60' | '60+'; accountingState: AccountingState;
}
interface SupplierStatement {
  supplier: { id: string; businessName: string; taxId: string | null };
  totalOwed: number;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
  debts: SupplierStatementDebt[];
  recentPayments: PaymentHistoryRow[];
}

// "Cuánto le debo y por qué" — a diferencia del historial de pagos de abajo
// (que solo muestra lo ya pagado), esto muestra la deuda pendiente real con
// sus compras de origen, fechas y montos.
function SupplierDebtCard({ supplierId, businessName }: { supplierId: string; businessName: string }) {
  const [payOpen, setPayOpen] = useState(false);
  const { data: statement, isLoading } = useQuery({
    queryKey: ['purchases-supplier-statement', supplierId],
    queryFn: async () => (await api.get<{ data: SupplierStatement }>(`/purchases/suppliers/${supplierId}/statement`)).data.data,
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Cargando estado de cuenta...</div>;
  if (!statement) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Deuda pendiente — {businessName}</CardTitle>
          <p className="text-sm text-muted-foreground">Qué se debe y de qué compras viene, con fechas y montos.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-destructive">{formatCurrency(statement.totalOwed)}</p>
          {statement.totalOwed > 0 && <Button size="sm" className="mt-1" onClick={() => setPayOpen(true)}>Pagar monto</Button>}
        </div>
      </CardHeader>
      {statement.debts.length > 0 && (
        <CardContent className="space-y-3">
          <AgingRow aging={statement.aging} />
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">N° Orden</th>
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-4 py-2 font-semibold">Vence</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Factura</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                  <th className="px-4 py-2 font-semibold text-right">Pagado</th>
                  <th className="px-4 py-2 font-semibold text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statement.debts.map((d) => (
                  <tr key={d.orderId}>
                    <td className="px-4 py-2 font-medium">{d.orderNumber}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDateTime(d.date)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.dueDate ? formatDateTime(d.dueDate) : '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant={ACCOUNTING_STATE_VARIANT[d.accountingState] ?? 'default'}>
                        {ACCOUNTING_STATE_LABELS[d.accountingState] ?? d.accountingState}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{d.supplierInvoice ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(d.totalAmount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(d.paidAmount)}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-destructive">{formatCurrency(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
      {statement.recentPayments.length > 0 && (
        <CardContent>
          <RepaymentHistoryTable batches={groupRepaymentBatches(statement.recentPayments)} />
        </CardContent>
      )}
      {payOpen && (
        <PayAmountModal
          title="Pagar a proveedor"
          subtitle={businessName}
          totalOwed={statement.totalOwed}
          payUrl={`/purchases/suppliers/${supplierId}/pay`}
          invalidateKeys={[['purchases-supplier-statement', supplierId], ['purchases-payable-summary'], ['purchases-payable', supplierId], ['purchases']]}
          onClose={() => setPayOpen(false)}
          onPaid={() => setPayOpen(false)}
        />
      )}
    </Card>
  );
}

function SettlementsTab() {
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [runFilters, setRunFilters] = useState<{ supplierId: string; dateFrom: string; dateTo: string } | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () => (await api.get<{ data: Supplier[] }>('/suppliers?limit=200')).data.data,
  });

  const { data: settlement, isLoading, isFetching } = useQuery({
    queryKey: ['purchase-settlement', runFilters],
    queryFn: async () => {
      const params = new URLSearchParams({ supplierId: runFilters!.supplierId });
      if (runFilters!.dateFrom) params.set('dateFrom', runFilters!.dateFrom);
      if (runFilters!.dateTo) params.set('dateTo', `${runFilters!.dateTo}T23:59:59.999`);
      return (await api.get<{ data: Settlement }>(`/purchases/settlements?${params}`)).data.data;
    },
    enabled: !!runFilters,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Elige un proveedor para ver cuánto se le debe y de qué compras viene esa deuda. También puedes generar un
        resumen de los pagos ya hechos en un rango de fechas, para cuadrar cuentas o entregarle una liquidación.
      </p>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Proveedor</label>
            <Select className="w-64" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selecciona un proveedor...</option>
              {(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Desde</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Hasta</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Button disabled={!supplierId} loading={isFetching}
            onClick={() => setRunFilters({ supplierId, dateFrom, dateTo })}>
            Generar liquidación
          </Button>
        </CardContent>
      </Card>

      {supplierId && (
        <SupplierDebtCard supplierId={supplierId} businessName={suppliers?.find(s => s.id === supplierId)?.businessName ?? ''} />
      )}

      {isLoading && <div className="py-12 text-center text-muted-foreground">Cargando...</div>}

      {settlement && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{settlement.supplier.businessName}</CardTitle>
              {settlement.supplier.taxId && <p className="text-sm text-muted-foreground">RUC: {settlement.supplier.taxId}</p>}
            </div>
            <Button variant="outline" onClick={() => printSettlement(settlement, dateFrom, dateTo)}>
              <FileText className="mr-2 h-4 w-4" />Imprimir
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {settlement.payments.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No hay pagos registrados a este proveedor en el rango seleccionado.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-semibold">Fecha</th>
                        <th className="px-4 py-2 font-semibold">Orden</th>
                        <th className="px-4 py-2 font-semibold">Factura</th>
                        <th className="px-4 py-2 font-semibold">Método</th>
                        <th className="px-4 py-2 font-semibold">Referencia</th>
                        <th className="px-4 py-2 font-semibold">Registrado por</th>
                        <th className="px-4 py-2 font-semibold text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {settlement.payments.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-2">{formatDateTime(p.paidAt)}</td>
                          <td className="px-4 py-2">{p.orderNumber}</td>
                          <td className="px-4 py-2">{p.supplierInvoice ?? '—'}</td>
                          <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                          <td className="px-4 py-2">{p.reference ?? '—'}</td>
                          <td className="px-4 py-2">{p.user}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-6 border-t pt-4 text-sm">
                  {Object.entries(settlement.totalsByMethod).map(([m, amt]) => (
                    <span key={m} className="text-muted-foreground tabular-nums">
                      {PAYMENT_METHOD_LABELS[m] ?? m}: <span className="font-semibold text-foreground">{formatCurrency(amt)}</span>
                    </span>
                  ))}
                  <span className="text-lg font-bold tabular-nums">
                    Total ({settlement.count} {settlement.count === 1 ? 'pago' : 'pagos'}): {formatCurrency(settlement.grandTotal)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Dashboard consolidado ─────────────────────────────────────────────── */
interface PurchasesDashboard {
  treasury: { cash: number; yape: number; plin: number; total: number };
  payableToSuppliers: number;
  payableToPayers: number;
}

function PurchasesDashboardBar() {
  const { data } = useQuery({
    queryKey: ['purchases-dashboard'],
    queryFn: async () => (await api.get<{ data: PurchasesDashboard }>('/purchases/dashboard')).data.data,
  });
  if (!data) return null;

  const cards: Array<[string, number, typeof Wallet, 'neutral' | 'debt']> = [
    ['Caja Efectivo', data.treasury.cash, Wallet, 'neutral'],
    ['Caja Yape', data.treasury.yape, Smartphone, 'neutral'],
    ['Caja Plin', data.treasury.plin, Smartphone, 'neutral'],
    ['Por pagar a proveedores', data.payableToSuppliers, AlertTriangle, 'debt'],
    ['Por pagar a pagadores', data.payableToPayers, AlertTriangle, 'debt'],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(([label, amount, Icon, kind]) => (
        <Card key={label} className={cn('border-t-4', kind === 'debt' ? 'border-t-destructive' : 'border-t-success')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', kind === 'debt' && amount > 0 ? 'text-destructive' : 'text-foreground')}>
              {formatCurrency(amount)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function PurchasesPage() {
  const [tab, setTab] = useState<'orders' | 'payable' | 'suppliers' | 'settlements' | 'payers'>('orders');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Compras y Proveedores</h1>
        <p className="text-sm text-muted-foreground">Gestión de órdenes de compra, recepción y proveedores</p>
      </div>

      <PurchasesDashboardBar />

      <div className="flex gap-1 border-b">
        {([
          ['orders', FileText, 'Órdenes de Compra'],
          ['payable', Clock, 'Cuentas por Pagar'],
          ['settlements', Receipt, 'Liquidaciones'],
          ['payers', HandCoins, 'Pagadores'],
          ['suppliers', Truck, 'Proveedores'],
        ] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? <OrdersTab />
        : tab === 'payable' ? <PayableTab />
        : tab === 'settlements' ? <SettlementsTab />
        : tab === 'payers' ? <PayersTab />
        : <SuppliersTab />}
    </div>
  );
}
