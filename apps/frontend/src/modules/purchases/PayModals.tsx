import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Btn } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { PaymentLeg, PaymentLegsEditor, legsMatch } from './payment';
import { Payer } from './types';

export function PayPurchaseModal({ order, onClose, onPaid }: {
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
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="sm" keepOpen
      title="Pagar a proveedor" description={<>{order.orderNumber} · Saldo pendiente: {formatCurrency(outstanding)}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Confirmar pago
          </Btn>
      </>}
    >
      <div className="space-y-3">
          <div>
            <label className="mb-1 block text-body font-medium">Monto a pagar</label>
            <MoneyInput min={0.01} max={outstanding} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div className="rounded-srf border-2 p-4 space-y-2">
            <label className="mb-1 block text-meta font-semibold uppercase tracking-wide text-ink-muted">¿Quién paga esto?</label>
            <div className="flex gap-2">
              <Btn type="button" size="sm" variant={!payerMode ? 'primary' : 'secondary' as 'primary' | 'secondary' | 'ghost' | 'danger'} className="flex-1"
                disabled={!!order.payerId}
                onClick={() => { setPayerMode(false); setPayerId(''); setShowNewPayer(false); }}>
                La empresa
              </Btn>
              <Btn type="button" size="sm" variant={payerMode ? 'primary' : 'secondary' as 'primary' | 'secondary' | 'ghost' | 'danger'} className="flex-1"
                onClick={() => {
                  setPayerMode(true);
                  setPayerAmountInput(String(amountNum));
                  if (!payers || payers.length === 0) setShowNewPayer(true);
                }}>
                Un tercero (todo o en parte)
              </Btn>
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
                  <label className="mb-1 block text-meta text-ink-muted">Monto que financia {payers?.find(p => p.id === payerId)?.name}</label>
                  <MoneyInput size="sm" min={0} max={amountNum} value={payerAmountInput}
                    onChange={e => setPayerAmountInput(e.target.value)} />
                </div>
                <p className="text-meta text-ink-muted">
                  {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General — se abre
                  una deuda con <strong>{payers?.find(p => p.id === payerId)?.name}</strong> que se repone luego
                  desde la pestaña "Pagadores".
                  {legsTarget > 0 && <> El resto ({formatCurrency(legsTarget)}) se paga al contado, abajo.</>}
                </p>
              </div>
            )}
            {payerMode && showNewPayer && (
              <div className="rounded-ctl bg-surface-2 p-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nombre *" value={newPayerName} onChange={e => setNewPayerName(e.target.value)} className="h-8" />
                  <Input placeholder="Teléfono (opcional)" value={newPayerPhone} onChange={e => setNewPayerPhone(e.target.value)} className="h-8" />
                </div>
                <div className="flex gap-2 justify-end">
                  {!!payers?.length && <Btn type="button" size="sm" variant="ghost" onClick={() => setShowNewPayer(false)}>Cancelar</Btn>}
                  <Btn variant="primary" type="button" size="sm" disabled={!newPayerName.trim()} loading={createPayerMutation.isPending}
                    onClick={() => createPayerMutation.mutate()}>
                    Crear pagador
                  </Btn>
                </div>
              </div>
            )}
            {payerMode && !showNewPayer && (
              <button type="button" className="text-meta text-brand hover:underline" onClick={() => setShowNewPayer(true)}>
                + Nuevo pagador
              </button>
            )}
          </div>

          {legsTarget > 0 && (
            <div>
              <label className="mb-1 block text-body font-medium">¿De dónde sale el dinero?</label>
              <PaymentLegsEditor total={legsTarget} legs={legs} onChange={setLegs} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-body font-medium">Referencia (opcional)</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° operación, voucher..." />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
    </Modal>
  );
}

/* ─── Pago "por monto" a un proveedor o pagador — amortiza sus compras más
 * antiguas hasta agotar el monto, en vez de tener que pagar orden por orden. */
export function PayAmountModal({ title, subtitle, totalOwed, payUrl, invalidateKeys, onClose, onPaid }: {
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
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="sm" keepOpen
      title={title} description={<>{subtitle} · Total: {formatCurrency(totalOwed)}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Confirmar pago
          </Btn>
      </>}
    >
      <div className="space-y-3">
          <div>
            <label className="mb-1 block text-body font-medium">Monto a pagar</label>
            <MoneyInput min={0.01} max={totalOwed} value={amount} onChange={e => setAmount(e.target.value)} />
            <p className="mt-1 text-meta text-ink-muted">Se reparte solo entre las compras más antiguas hasta agotar el monto.</p>
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">¿De dónde sale el dinero?</label>
            <PaymentLegsEditor total={amountNum} legs={legs} onChange={setLegs} />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Referencia (opcional)</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° operación, voucher..." />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
        </div>
    </Modal>
  );
}

/* ─── Corregir una línea recibida (producto, costo y/o bonificación) ─────── */
// Editar cantidad/costo de una línea ANTES de recibirla — para errores de
// tipeo (ej. "1" en vez de "20") sin anular y rehacer toda la orden.
