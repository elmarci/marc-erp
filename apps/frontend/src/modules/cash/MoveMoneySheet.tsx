// "Sacar dinero" y "Meter dinero" de una caja abierta. Cada salida reutiliza el
// flujo que ya existía: volver a Caja General (movimiento de caja), pagar una
// compra por pagar (mismo endpoint que Compras) o registrar un gasto (mismo
// endpoint que Caja General). Si el medio es efectivo, queda atado a la sesión.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Btn, Field, Sheet, fieldCls, invalidCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { EXPENSE_CATEGORY_LABELS, type CashSession, type PayableOrderPick } from './types';

type Destino = 'CAJA_GENERAL' | 'OC' | 'GASTO';

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT');

function RadioCard({ checked, onClick, title, desc }: { checked: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick}
      className={cn('tap flex w-full items-center gap-3 rounded-ctl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        checked ? 'bg-brand-soft shadow-[inset_0_0_0_1px_hsl(var(--brand))]' : 'shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2')}>
      <span className={cn('grid size-4 shrink-0 place-items-center rounded-full', checked ? 'bg-brand' : 'shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]')}>
        {checked && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <span>
        <span className="block text-table font-medium text-ink">{title}</span>
        <span className="block text-meta text-ink-muted">{desc}</span>
      </span>
    </button>
  );
}

export function MoveMoneySheet({ session, mode, expectedCash, onClose }: {
  session: CashSession; mode: 'out' | 'in'; expectedCash?: number; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { hasMinRole } = useAuthStore();
  const [destino, setDestino] = useState<Destino>('CAJA_GENERAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [orderId, setOrderId] = useState('');
  const [ocMethod, setOcMethod] = useState('CASH');
  const [expenseCategory, setExpenseCategory] = useState('OTHER');
  const [expenseMethod, setExpenseMethod] = useState('CASH');

  const reset = () => { setAmount(''); setReason(''); setOrderId(''); setOcMethod('CASH'); setExpenseCategory('OTHER'); setExpenseMethod('CASH'); };
  const pick = (d: Destino) => { setDestino(d); reset(); };

  const { data: payableOrders } = useQuery({
    queryKey: ['payable-orders-picker'],
    queryFn: async () => (await api.get<{ data: PayableOrderPick[] }>('/purchases/payable?limit=50')).data.data,
    enabled: mode === 'out' && destino === 'OC',
  });
  const order = payableOrders?.find((o) => o.id === orderId);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cash-movements', session.id] });
    queryClient.invalidateQueries({ queryKey: ['cash-summary', session.id] });
  };
  const done = (msg: string) => { refresh(); toast.success(msg); onClose(); };
  const fail = (err: unknown) => toast.error(getErrorMessage(err));
  const value = parseFloat(amount);

  // Meter dinero, o sacarlo de vuelta a Caja General: movimiento simple de caja (efectivo).
  const movMutation = useMutation({
    mutationFn: () => api.post(`/cash/sessions/${session.id}/movements`, {
      type: mode === 'in' ? 'DEPOSIT' : 'WITHDRAWAL', amount: value, reason,
    }),
    onSuccess: () => done('Movimiento registrado.'),
    onError: fail,
  });
  const payOrderMutation = useMutation({
    mutationFn: () => api.post(`/purchases/${orderId}/pay`, {
      legs: [{ amount: value, method: ocMethod, cashSessionId: ocMethod === 'CASH' ? session.id : undefined }],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payable-orders-picker'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      done('Pago a proveedor registrado.');
    },
    onError: fail,
  });
  const expenseMutation = useMutation({
    mutationFn: () => api.post('/treasury/expenses', {
      category: expenseCategory, description: reason, amount: value,
      method: expenseMethod, cashSessionId: expenseMethod === 'CASH' ? session.id : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      done('Gasto registrado.');
    },
    onError: fail,
  });

  const overOrder = !!order && value > order.outstanding + 0.009;
  const valid = value > 0 && (mode === 'in' || destino === 'CAJA_GENERAL' || destino === 'GASTO'
    ? !!reason.trim()
    : !!orderId && !overOrder);
  const pending = movMutation.isPending || payOrderMutation.isPending || expenseMutation.isPending;
  const submit = () => {
    if (mode === 'in' || destino === 'CAJA_GENERAL') movMutation.mutate();
    else if (destino === 'OC') payOrderMutation.mutate();
    else expenseMutation.mutate();
  };
  const submitLabel = mode === 'in' ? 'Registrar depósito'
    : destino === 'CAJA_GENERAL' ? 'Registrar retiro' : destino === 'OC' ? 'Pagar orden de compra' : 'Registrar gasto';

  const amountInput = (props: { max?: number } = {}) => (
    <Field label="Monto (S/)" error={overOrder ? `La compra debe ${formatCurrency(order!.outstanding)}.` : undefined}>
      <input type="number" inputMode="decimal" min={0} step={0.1} placeholder="0.00" value={amount} {...props}
        onChange={(e) => setAmount(e.target.value)} className={cn(fieldCls, 'text-right tabular-nums', overOrder && invalidCls)} />
    </Field>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="sm"
      title={mode === 'in' ? `Meter dinero a ${session.cashRegister.name}` : `Sacar dinero de ${session.cashRegister.name}`}
      description={mode === 'in' ? 'Este monto sale siempre de Caja General (efectivo).'
        : expectedCash !== undefined ? `Debe haber ${formatCurrency(expectedCash)} en efectivo.` : undefined}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" disabled={!valid} loading={pending} onClick={submit}>{submitLabel}</Btn></>}>
      <div className="flex flex-col gap-5">
        {mode === 'out' && (
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Para qué">
            <RadioCard checked={destino === 'CAJA_GENERAL'} onClick={() => pick('CAJA_GENERAL')} title="Vuelve a Caja General" desc="Excedente o depósito del día" />
            <RadioCard checked={destino === 'OC'} onClick={() => pick('OC')} title="Pagar orden de compra" desc="Salda una compra por pagar" />
            {hasMinRole('SUPERVISOR') && (
              <RadioCard checked={destino === 'GASTO'} onClick={() => pick('GASTO')} title="Registrar gasto" desc="Luz, transporte, adelanto…" />
            )}
          </div>
        )}

        {(mode === 'in' || destino === 'CAJA_GENERAL') && (<>
          {amountInput()}
          <Field label={mode === 'in' ? 'Motivo' : 'Detalle'}>
            <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'in' ? 'Ej: cambio para el día' : 'Ej: excedente de caja'} />
          </Field>
        </>)}

        {mode === 'out' && destino === 'OC' && (<>
          <Field label="Compra por pagar" hint={payableOrders?.length === 0 ? 'No hay órdenes de compra pendientes de pago.' : undefined}>
            <select className={fieldCls} value={orderId} onChange={(e) => {
              const id = e.target.value;
              setOrderId(id);
              const o = payableOrders?.find((p) => p.id === id);
              setAmount(o ? o.outstanding.toFixed(2) : '');
            }}>
              <option value="">Selecciona una orden de compra…</option>
              {(payableOrders ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber} · {o.supplier.businessName} · debe S/ {o.outstanding.toFixed(2)}</option>
              ))}
            </select>
          </Field>
          {order && (
            <div className="grid grid-cols-2 gap-3">
              {amountInput({ max: order.outstanding })}
              <Field label="Medio de pago">
                <select className={fieldCls} value={ocMethod} onChange={(e) => setOcMethod(e.target.value)}>
                  {METHOD_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          {order && ocMethod !== 'CASH' && <p className="text-meta text-ink-muted">Con {PAYMENT_METHOD_LABELS[ocMethod]} sale directo de esa cuenta en Caja General, no de esta caja.</p>}
        </>)}

        {mode === 'out' && destino === 'GASTO' && (<>
          <Field label="Categoría">
            <select className={fieldCls} value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Descripción del gasto">
            <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: taxi para recoger pedido" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {amountInput()}
            <Field label="Medio de pago">
              <select className={fieldCls} value={expenseMethod} onChange={(e) => setExpenseMethod(e.target.value)}>
                {METHOD_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        </>)}
      </div>
    </Sheet>
  );
}
