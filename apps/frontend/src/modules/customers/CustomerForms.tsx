// Ventanas de Clientes: crear o editar un cliente y cobrar su deuda.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, Field, Modal, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { usePosStore } from '@/stores/posStore';
import { printDebtPaymentReceipt } from './printDebtPaymentReceipt';
import { PAYMENT_METHODS_OPTS, TYPE_LABELS, fullName, type Customer, type UnpaidSale } from './types';

/* ─── Crear o editar cliente ────────────────────────────────────────────── */
export function CustomerModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
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
      setForm((v) => ({ ...v, [k]: e.target.value }));

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
    <Modal open onOpenChange={(o) => !o && onClose()} title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.firstName}>
          {isEdit ? 'Guardar cambios' : 'Crear cliente'}
        </Btn>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required><input className={fieldCls} value={form.firstName} onChange={set('firstName')} placeholder="Juan" autoFocus /></Field>
        <Field label="Apellido"><input className={fieldCls} value={form.lastName} onChange={set('lastName')} placeholder="Pérez" /></Field>
        <Field label="Tipo doc.">
          <select className={fieldCls} value={form.taxIdType} onChange={set('taxIdType')}>
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="CE">C.E.</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </Field>
        <Field label="N° documento"><input className={cn(fieldCls, 'tabular-nums')} value={form.taxId} onChange={set('taxId')} placeholder="12345678" /></Field>
        <Field label="Razón social / empresa" className="col-span-2"><input className={fieldCls} value={form.businessName} onChange={set('businessName')} placeholder="Empresa S.A.C. (opcional)" /></Field>
        <Field label="Teléfono"><input className={cn(fieldCls, 'tabular-nums')} value={form.phone} onChange={set('phone')} placeholder="987654321" /></Field>
        <Field label="Email"><input type="email" className={fieldCls} value={form.email} onChange={set('email')} placeholder="correo@ejemplo.com" /></Field>
        <Field label="Dirección" className="col-span-2"><input className={fieldCls} value={form.address} onChange={set('address')} placeholder="Av. Los Clientes 123" /></Field>
        <Field label="Tipo de cliente">
          <select className={fieldCls} value={form.type} onChange={set('type')}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Límite de crédito (S/)">
          <input type="number" min={0} step={50} className={cn(fieldCls, 'text-right tabular-nums')} value={form.creditLimit} onChange={set('creditLimit')} />
        </Field>
        <Field label="Notas" className="col-span-2"><input className={fieldCls} value={form.notes} onChange={set('notes')} placeholder="Observaciones del cliente…" /></Field>
        {isEdit && (
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-table font-medium text-ink">
            <Check checked={form.isActive} onChange={() => setForm((v) => ({ ...v, isActive: !v.isActive }))} label="Cliente activo" />
            Cliente activo
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ─── Cobrar deuda ──────────────────────────────────────────────────────── */
export function DebtPaymentModal({ customer, onClose, onPaid }: {
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

  // unpaidSales viene del más antiguo al más reciente: el monto se reparte en
  // ese orden entre las ventas elegidas.
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
        customerName: fullName(customer),
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
  const allSelected = !!unpaidSales && unpaidSales.length > 0 && selectedIds.size === unpaidSales.length;

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Registrar pago de deuda" description={fullName(customer)}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}><DollarSign />Confirmar pago</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-ctl bg-surface-2 px-3 py-2.5">
          <div>
            <p className="text-meta text-ink-muted">Deuda pendiente (total)</p>
            <p className="text-kpi font-semibold tabular-nums text-bad-ink">{formatCurrency(debt)}</p>
          </div>
          {/* Para saldar todo sin marcar cada venta fiada una por una. */}
          {unpaidSales && unpaidSales.length > 0 && !allSelected && (
            <Btn size="sm" onClick={() => { setSelectedIds(new Set(unpaidSales.map((s) => s.id))); setAmountTouched(false); }}>Pagar toda la deuda</Btn>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">¿A cuáles ventas fiadas aplica este pago? (puede elegir varias)</span>
          {isLoading ? <p className="py-4 text-center text-table text-ink-muted">Cargando…</p>
            : !unpaidSales || unpaidSales.length === 0 ? <p className="py-4 text-center text-table text-ink-muted">Sin ventas fiadas pendientes.</p>
            : (
              <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
                {unpaidSales.map((s) => (
                  <label key={s.id} className={cn('flex cursor-pointer items-center justify-between gap-3 px-3 py-2', selectedIds.has(s.id) ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                    <span className="flex items-center gap-2.5">
                      <Check checked={selectedIds.has(s.id)} onChange={() => toggleSale(s)} label={`Elegir ${s.saleNumber}`} />
                      <span>
                        <span className="block font-mono text-meta font-medium text-ink">{s.saleNumber}</span>
                        <span className="block text-meta text-ink-muted">{formatDateTime(s.createdAt)}</span>
                      </span>
                    </span>
                    <span className="text-table font-semibold tabular-nums">{formatCurrency(s.outstanding)}</span>
                  </label>
                ))}
              </div>
            )}
        </div>

        {selectedIds.size > 0 && (<>
          <Field label={`Monto a pagar (S/), ${selectedIds.size} venta${selectedIds.size !== 1 ? 's' : ''} elegida${selectedIds.size !== 1 ? 's' : ''}`}
            hint={`Total elegido: ${formatCurrency(selectedTotal)}. Si el monto es menor, se aplica primero a la venta más antigua.`}>
            <input type="number" min={0.01} max={selectedTotal} step={0.10} autoFocus
              value={amountTouched ? amount : selectedTotal.toFixed(2)}
              onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
              className={cn(fieldCls, 'h-11 text-right text-section font-semibold tabular-nums')} />
          </Field>
          <Field label="Método de pago"
            hint={method === 'CASH' && !cashSessionId ? <span className="text-warn-ink">No tienes una caja abierta: este cobro no se reflejará en un arqueo.</span> : undefined}>
            <select className={fieldCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Notas (opcional)"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones…" /></Field>
          {effectiveAmount > 0 && effectiveAmount < selectedTotal - 0.009 && (
            <p className="rounded-ctl bg-surface-2 px-3 py-2 text-center text-table">
              Saldo restante de lo elegido: <strong className="tabular-nums">{formatCurrency(selectedTotal - effectiveAmount)}</strong>
            </p>
          )}
        </>)}
      </div>
    </Modal>
  );
}
