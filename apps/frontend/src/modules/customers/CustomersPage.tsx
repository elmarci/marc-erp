import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Search, Plus, X, DollarSign, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { usePosStore } from '@/stores/posStore';
import { printDebtPaymentReceipt } from './printDebtPaymentReceipt';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Customer {
  id: string; firstName: string; lastName: string | null;
  taxId: string | null; taxIdType: string | null;
  businessName: string | null; email: string | null; phone: string | null;
  address: string | null; type: string;
  creditLimit: number; currentBalance: number; loyaltyPoints: number; isActive: boolean;
  notes: string | null; createdAt: string;
}

interface Sale {
  id: string; saleNumber: string; totalAmount: number; paidAmount: number; isCredit: boolean; status: string;
  createdAt: string; payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

interface UnpaidSale {
  id: string; saleNumber: string; createdAt: string; totalAmount: number; paidAmount: number; outstanding: number;
}

const TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Regular', WHOLESALE: 'Mayorista', VIP: 'VIP', CREDIT: 'Crédito',
};
const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada', CANCELLED: 'Anulada', RETURNED: 'Devuelta',
};
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', DEBIT_CARD: 'T. Débito', CREDIT_CARD: 'T. Crédito',
  YAPE: 'Yape', PLIN: 'Plin', TRANSFER: 'Transferencia', CREDIT: 'Crédito',
};

/* ─── Customer Form Modal ─────────────────────────────────────────────── */
function CustomerModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!customer;

  const [form, setForm] = useState({
    firstName: customer?.firstName ?? '',
    lastName: customer?.lastName ?? '',
    taxId: customer?.taxId ?? '',
    taxIdType: customer?.taxIdType ?? 'DNI',
    businessName: customer?.businessName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    type: customer?.type ?? 'REGULAR',
    creditLimit: String(customer?.creditLimit ?? 0),
    isActive: customer?.isActive ?? true,
    notes: customer?.notes ?? '',
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(v => ({ ...v, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        lastName: form.lastName || null,
        taxId: form.taxId || null,
        businessName: form.businessName || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        creditLimit: Number(form.creditLimit),
      };
      return isEdit
        ? api.put(`/customers/${customer!.id}`, payload)
        : api.post('/customers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEdit ? 'Cliente actualizado.' : 'Cliente creado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre *</label>
            <Input value={form.firstName} onChange={set('firstName')} placeholder="Juan" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Apellido</label>
            <Input value={form.lastName} onChange={set('lastName')} placeholder="Pérez" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo doc.</label>
            <select value={form.taxIdType} onChange={set('taxIdType')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">C.E.</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">N° Documento</label>
            <Input value={form.taxId} onChange={set('taxId')} placeholder="12345678" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Razón social / empresa</label>
            <Input value={form.businessName} onChange={set('businessName')} placeholder="Empresa S.A.C. (opcional)" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Teléfono</label>
            <Input value={form.phone} onChange={set('phone')} placeholder="987654321" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="correo@ejemplo.com" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Dirección</label>
            <Input value={form.address} onChange={set('address')} placeholder="Av. Los Clientes 123" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de cliente</label>
            <select value={form.type} onChange={set('type')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Límite de crédito (S/)</label>
            <Input type="number" min={0} step={50} value={form.creditLimit} onChange={set('creditLimit')} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Notas</label>
            <Input value={form.notes} onChange={set('notes')} placeholder="Observaciones del cliente..." />
          </div>
          {isEdit && (
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive}
                onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-input" />
              <label htmlFor="isActive" className="text-sm font-medium">Cliente activo</label>
            </div>
          )}
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.firstName}>
            {isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Debt Payment Modal ────────────────────────────────────────────────── */
const PAYMENT_METHODS_OPTS = [
  { value: 'CASH', label: 'Efectivo' }, { value: 'YAPE', label: 'Yape' },
  { value: 'PLIN', label: 'Plin' }, { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'DEBIT_CARD', label: 'Tarjeta débito' }, { value: 'CREDIT_CARD', label: 'Tarjeta crédito' },
  { value: 'OTHER', label: 'Otro' },
];

function DebtPaymentModal({ customer, onClose, onPaid }: {
  customer: Customer; onClose: () => void; onPaid: () => void;
}) {
  const queryClient = useQueryClient();
  const cashSessionId = usePosStore((s) => s.cashSessionId);
  const debt = Number(customer.currentBalance);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');

  const { data: unpaidSales, isLoading } = useQuery({
    queryKey: ['customer-unpaid-sales', customer.id],
    queryFn: async () => (await api.get<{ data: UnpaidSale[] }>(`/customers/${customer.id}/unpaid-sales`)).data.data,
  });

  // unpaidSales ya viene ordenado del más antiguo al más reciente — se
  // reparte el monto ingresado en ese orden entre las ventas seleccionadas.
  const selectedSales = (unpaidSales ?? []).filter((s) => selectedIds.has(s.id));
  const selectedTotal = selectedSales.reduce((sum, s) => sum + s.outstanding, 0);

  const toggleSale = (s: UnpaidSale) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
    setAmountTouched(false);
  };

  const effectiveAmount = amountTouched ? parseFloat(amount) || 0 : selectedTotal;

  const buildAllocations = () => {
    let remaining = effectiveAmount;
    const allocations: Array<{ saleId: string; amount: number }> = [];
    for (const s of selectedSales) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, s.outstanding);
      if (applied > 0) allocations.push({ saleId: s.id, amount: applied });
      remaining -= applied;
    }
    return allocations;
  };

  const mutation = useMutation({
    mutationFn: () => api.post(`/customers/${customer.id}/payments`, {
      allocations: buildAllocations(),
      method,
      notes: notes || undefined,
      cashSessionId: method === 'CASH' ? cashSessionId ?? undefined : undefined,
    }),
    onSuccess: (res) => {
      const { paid, remaining, appliedTo } = res.data.data as {
        paid: number; remaining: number; appliedTo: Array<{ saleNumber: string; amount: number }>;
      };
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-sales', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-unpaid-sales', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-debt-payments', customer.id] });
      toast.success(`Pago de ${formatCurrency(paid)} registrado. Saldo total restante: ${formatCurrency(remaining)}`);
      printDebtPaymentReceipt({
        customerName: `${customer.firstName} ${customer.lastName ?? ''}`.trim(),
        paidAt: new Date().toISOString(),
        amount: paid,
        method,
        appliedTo,
        remaining,
      });
      onPaid();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = selectedIds.size > 0 && effectiveAmount > 0 && effectiveAmount <= selectedTotal + 0.009;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b p-5 shrink-0">
          <div>
            <h2 className="text-lg font-bold">Registrar pago de deuda</h2>
            <p className="text-sm text-muted-foreground">{customer.firstName} {customer.lastName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">Deuda pendiente (total)</p>
            <p className="text-3xl font-bold text-destructive">{formatCurrency(debt)}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">¿A cuáles ventas fiadas aplica este pago? (puede elegir varias)</label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
            ) : !unpaidSales || unpaidSales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin ventas fiadas pendientes.</p>
            ) : (
              <div className="divide-y border rounded-lg max-h-56 overflow-y-auto">
                {unpaidSales.map((s) => (
                  <label key={s.id}
                    className={cn('flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors',
                      selectedIds.has(s.id) ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSale(s)} className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">{s.saleNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-destructive">{formatCurrency(s.outstanding)}</p>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Monto a pagar (S/) — {selectedIds.size} venta{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                </label>
                <Input type="number" min={0.01} max={selectedTotal} step={0.10}
                  value={amountTouched ? amount : selectedTotal.toFixed(2)}
                  onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
                  className="text-lg font-bold text-center" autoFocus />
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Total seleccionado: {formatCurrency(selectedTotal)}. Si el monto es menor, se aplica primero a la venta más antigua.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Método de pago</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {PAYMENT_METHODS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {method === 'CASH' && !cashSessionId && (
                  <p className="text-xs text-amber-600 mt-1">No tienes una caja abierta — este cobro no se reflejará en un arqueo.</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Notas (opcional)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
              </div>

              {effectiveAmount > 0 && effectiveAmount < selectedTotal - 0.009 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 text-center">
                  Saldo restante de lo seleccionado: <strong>{formatCurrency(selectedTotal - effectiveAmount)}</strong>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t p-5 flex gap-3 shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!canSubmit}>
            <DollarSign className="mr-2 h-4 w-4" />Confirmar pago
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Customer Detail Panel ──────────────────────────────────────────────── */
function CustomerDetail({ customer, onEdit, onClose, onRefresh }: {
  customer: Customer; onEdit: () => void; onClose: () => void; onRefresh: (c: Customer) => void;
}) {
  const queryClient = useQueryClient();
  const [salesPage, setSalesPage] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'debt'>('sales');

  const { data: salesData } = useQuery({
    queryKey: ['customer-sales', customer.id, salesPage],
    queryFn: async () => {
      const res = await api.get<{
        data: Sale[]; pagination: { total: number; totalPages: number }; totalSpent: number;
      }>(`/customers/${customer.id}/sales?page=${salesPage}&limit=10`);
      return res.data;
    },
  });

  const { data: debtPayments } = useQuery({
    queryKey: ['customer-debt-payments', customer.id],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; amount: number; method: string; notes: string | null; paidAt: string; sale: { saleNumber: string } | null }> }>(`/customers/${customer.id}/debt-payments`);
      return res.data.data;
    },
    enabled: activeTab === 'debt',
  });

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin',
    TRANSFER: 'Transferencia', DEBIT_CARD: 'T. Débito',
    CREDIT_CARD: 'T. Crédito', OTHER: 'Otro',
  };

  const hasDebt = Number(customer.currentBalance) > 0;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold">{customer.firstName} {customer.lastName}</h2>
            {customer.taxId && <p className="text-sm text-muted-foreground">{customer.taxIdType}: {customer.taxId}</p>}
          </div>
          <div className="flex gap-2">
            {Number(customer.currentBalance) > 0 && (
              <Button size="sm" variant="destructive" onClick={() => setShowPayment(true)}>
                <DollarSign className="mr-1.5 h-3.5 w-3.5" />Cobrar deuda
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              {customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span>{customer.phone}</span></div>}
              {customer.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{customer.email}</span></div>}
              {customer.address && <div className="flex justify-between"><span className="text-muted-foreground">Dirección</span><span>{customer.address}</span></div>}
              {customer.businessName && <div className="flex justify-between"><span className="text-muted-foreground">Empresa</span><span>{customer.businessName}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><Badge variant="secondary">{TYPE_LABELS[customer.type]}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estado</span><Badge variant={customer.isActive ? 'success' : 'secondary'}>{customer.isActive ? 'Activo' : 'Inactivo'}</Badge></div>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg bg-muted p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Crédito</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Límite</span><span className="font-semibold">{formatCurrency(customer.creditLimit)}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo deuda</span>
                  <span className={cn('font-bold', hasDebt ? 'text-destructive' : 'text-success')}>
                    {formatCurrency(customer.currentBalance)}
                  </span>
                </div>
                {salesData && <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Total comprado</span><span className="font-bold text-success">{formatCurrency(salesData.totalSpent)}</span></div>}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                  <Star className="h-3.5 w-3.5" />Puntos de fidelización
                </span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{customer.loyaltyPoints}</span>
              </div>
              {customer.notes && <p className="text-xs text-muted-foreground italic">"{customer.notes}"</p>}
              <p className="text-xs text-muted-foreground">Cliente desde {new Date(customer.createdAt).toLocaleDateString('es-PE')}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {([['sales', `Compras (${salesData?.pagination.total ?? 0})`], ['debt', 'Pagos de deuda']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>

          {/* Sales history */}
          {activeTab === 'sales' && <div>
            <p className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide sr-only">
              Historial de compras
            </p>
            {!salesData || salesData.data.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Sin compras registradas</p>
            ) : (
              <>
                <div className="divide-y border rounded-lg">
                  {salesData.data.map(sale => {
                    const outstanding = Number(sale.totalAmount) - Number(sale.paidAmount);
                    const paymentBadge = !sale.isCredit
                      ? { variant: 'secondary' as const, label: 'Contado' }
                      : outstanding > 0.009
                        ? { variant: 'destructive' as const, label: `Fiado — Pendiente ${formatCurrency(outstanding)}` }
                        : { variant: 'success' as const, label: 'Fiado — Pagado' };
                    return (
                      <Link key={sale.id} to={`/sales/${sale.id}`}
                        className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30">
                        <div>
                          <p className="font-medium">{sale.saleNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(sale.createdAt)} · {sale._count.items} ítem(s)</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(sale.totalAmount)}</p>
                          <div className="flex gap-1 justify-end mt-0.5">
                            <Badge variant={paymentBadge.variant} className="text-xs">{paymentBadge.label}</Badge>
                            {sale.status !== 'COMPLETED' && (
                              <Badge variant="secondary" className="text-xs">{STATUS_LABELS[sale.status] ?? sale.status}</Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {salesData.pagination.totalPages > 1 && (
                  <div className="flex justify-between items-center mt-3 text-sm text-muted-foreground">
                    <Button variant="outline" size="sm" disabled={salesPage === 1} onClick={() => setSalesPage(p => p - 1)}>Anterior</Button>
                    <span>Pág. {salesPage} / {salesData.pagination.totalPages}</span>
                    <Button variant="outline" size="sm" disabled={salesPage === salesData.pagination.totalPages} onClick={() => setSalesPage(p => p + 1)}>Siguiente</Button>
                  </div>
                )}
              </>
            )}
          </div>}

          {/* Debt payments history */}
          {activeTab === 'debt' && (
            <div>
              {!debtPayments || debtPayments.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Sin pagos de deuda registrados</p>
              ) : (
                <div className="divide-y border rounded-lg">
                  {debtPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                          {p.sale && <span className="text-muted-foreground font-normal"> · aplicado a {p.sale.saleNumber}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(p.paidAt)}</p>
                        {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                      </div>
                      <p className="font-bold text-success">{formatCurrency(p.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {showPayment && (
      <DebtPaymentModal
        customer={customer}
        onClose={() => setShowPayment(false)}
        onPaid={() => {
          setShowPayment(false);
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
      />
    )}
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [detailCustomer, setDetailCustomer] = useState<Customer | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '25', ...(search ? { search } : {}) });
      const res = await api.get<{ data: Customer[]; pagination: { total: number; totalPages: number } }>(`/customers?${params}`);
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); toast.success('Cliente eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openEdit = (c: Customer) => { setEditCustomer(c); setDetailCustomer(undefined); setShowModal(true); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Base de datos de clientes</p>
        </div>
        <Button onClick={() => { setEditCustomer(undefined); setShowModal(true); }}>
          <Plus className="mr-2 h-4 w-4" />Nuevo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nombre, DNI, teléfono..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : (data?.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <UserCheck className="h-12 w-12 opacity-20" />
              <p>{search ? 'No se encontraron clientes.' : 'No hay clientes registrados.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium">Documento</th>
                    <th className="px-4 py-3 text-left font-medium">Teléfono</th>
                    <th className="px-4 py-3 text-center font-medium">Tipo</th>
                    <th className="px-4 py-3 text-right font-medium">Límite</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo deuda</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.data ?? []).map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setDetailCustomer(c)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.firstName} {c.lastName}</p>
                        {c.businessName && <p className="text-xs text-muted-foreground">{c.businessName}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.taxId ? `${c.taxIdType ?? ''} ${c.taxId}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.creditLimit)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-semibold', Number(c.currentBalance) > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {formatCurrency(c.currentBalance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={c.isActive ? 'success' : 'secondary'}>
                          {c.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Editar</Button>
                          <Button variant="ghost" size="sm" className="text-destructive"
                            onClick={() => { if (confirm(`¿Eliminar a ${c.firstName}?`)) deleteMutation.mutate(c.id); }}>
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total} clientes</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>

      {showModal && (
        <CustomerModal
          customer={editCustomer}
          onClose={() => { setShowModal(false); setEditCustomer(undefined); }}
        />
      )}

      {detailCustomer && (
        <CustomerDetail
          customer={detailCustomer}
          onEdit={() => openEdit(detailCustomer)}
          onClose={() => setDetailCustomer(undefined)}
          onRefresh={(c) => setDetailCustomer(c)}
        />
      )}
    </div>
  );
}
