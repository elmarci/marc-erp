import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Modal, StatusBadge, surfaceCls, useConfirm } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { PayAmountModal } from './PayModals';
import { AgingRow } from './PayableTab';
import { PAYMENT_METHOD_LABELS, Payer } from './types';

export interface PayerDebt {
  orderId: string; orderNumber: string; date: string; supplierName: string;
  totalAmount: number; payerAmount: number; reimbursedAmount: number; outstanding: number;
  agingBucket: '0-15' | '16-30' | '31-60' | '60+';
}
export interface PaymentHistoryRow {
  id: string; paidAt: string; amount: number; method: string;
  reference: string | null; notes: string | null; batchId: string | null; orderNumber: string; user: string;
  reversedAt: string | null; reversalReason: string | null; reversedBy: string | null;
}
export interface PayerStatement {
  payer: { id: string; name: string; phone: string | null; creditLimit: number };
  totalOwed: number;
  overLimit: boolean;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
  debts: PayerDebt[];
  recentRepayments: PaymentHistoryRow[];
}

export function NewPayerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="sm" keepOpen
      title="Nuevo pagador"
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={!name.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>Crear</Btn>
      </>}
    >
      <div className="space-y-3">
          <div>
            <label className="mb-1 block text-body font-medium">Nombre *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Papá, Juan..." autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Teléfono</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Notas</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Límite de crédito (opcional)</label>
            <MoneyInput min={0} value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
              placeholder="0 = sin límite" />
            <p className="mt-1 text-meta text-ink-muted">Solo avisa si se supera — no bloquea nuevas compras.</p>
          </div>
        </div>
    </Modal>
  );
}

// Una reposición puede repartirse (FIFO) entre varias compras de un mismo
// pagador — todas esas filas comparten `batchId` (el evento de pago real,
// una sola salida de Caja); se agrupan para mostrar "un pago, N compras"
// en vez de una fila repetida por cada orden que tocó.
export function groupRepaymentBatches(rows: PaymentHistoryRow[]) {
  const map = new Map<string, {
    key: string; paidAt: string; amount: number; method: string; reference: string | null; user: string; orders: string[];
    allReversed: boolean; reversedAt: string | null; reversalReason: string | null; reversedBy: string | null;
  }>();
  for (const r of rows) {
    const key = r.batchId ?? r.id;
    const existing = map.get(key);
    if (existing) {
      existing.amount += r.amount;
      existing.orders.push(r.orderNumber);
      existing.allReversed = existing.allReversed && !!r.reversedAt;
    } else {
      map.set(key, {
        key, paidAt: r.paidAt, amount: r.amount, method: r.method, reference: r.reference, user: r.user, orders: [r.orderNumber],
        allReversed: !!r.reversedAt, reversedAt: r.reversedAt, reversalReason: r.reversalReason, reversedBy: r.reversedBy,
      });
    }
  }
  return Array.from(map.values());
}

export function RepaymentHistoryTable({ batches, canRevert, onRevert, revertingKey }: {
  batches: ReturnType<typeof groupRepaymentBatches>;
  canRevert?: boolean;
  onRevert?: (batchKey: string) => void;
  revertingKey?: string | null;
}) {
  if (batches.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-meta font-medium text-ink-muted">Historial de reposiciones</p>
      <table className="w-full text-body">
        <thead>
          <tr className="border-b text-left text-meta uppercase tracking-wide text-ink-muted">
            <th className="py-2 font-semibold">Fecha</th>
            <th className="py-2 font-semibold">Método</th>
            <th className="py-2 font-semibold">Compras cubiertas</th>
            <th className="py-2 font-semibold text-right">Monto</th>
            <th className="py-2 font-semibold">Usuario</th>
            {canRevert && <th className="py-2 font-semibold"></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {batches.map((b) => (
            <tr key={b.key} className={cn(b.allReversed && 'opacity-60')}>
              <td className="py-2 text-ink-muted">{formatDateTime(b.paidAt)}</td>
              <td className="py-2">{PAYMENT_METHOD_LABELS[b.method] ?? b.method}{b.reference ? ` (${b.reference})` : ''}</td>
              <td className="py-2 text-meta text-ink-muted">{b.orders.join(', ')}</td>
              <td className={cn('py-2 text-right font-semibold tabular-nums', b.allReversed ? 'text-ink-muted line-through' : 'text-ok-ink')}>
                {formatCurrency(b.amount)}
              </td>
              <td className="py-2 text-meta text-ink-muted">
                {b.user}
                {b.allReversed && (
                  <div className="mt-0.5 flex flex-col text-bad-ink">
                    <span className="font-semibold">Revertido{b.reversedBy ? ` por ${b.reversedBy}` : ''}</span>
                    {b.reversalReason && <span className="italic">"{b.reversalReason}"</span>}
                  </div>
                )}
              </td>
              {canRevert && (
                <td className="py-2 text-right">
                  {!b.allReversed && onRevert && (
                    <Btn size="sm" className="text-bad-ink hover:text-bad-ink"
                      loading={revertingKey === b.key} onClick={() => onRevert(b.key)}>
                      Revertir
                    </Btn>
                  )}
                </td>
              )}
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
export function PayerDetail({ payerId, payerName, onPay }: { payerId: string; payerName: string; onPay: () => void }) {
  const queryClient = useQueryClient();
  const { data: statement, isLoading } = useQuery({
    queryKey: ['purchases-payer-statement', payerId],
    queryFn: async () => (await api.get<{ data: PayerStatement }>(`/purchases/payers/${payerId}/statement`)).data.data,
  });

  const confirm = useConfirm();
  const revertMutation = useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) =>
      api.post(`/purchases/payer-repayment-batches/${batchId}/revert`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases-payer-statement', payerId] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payers'] });
      toast.success('Reposición revertida — el dinero volvió y la deuda con el pagador se restauró.');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === '__cancelled__') return;
      toast.error(getErrorMessage(err));
    },
  });

  if (isLoading) return <div className="py-4 text-center text-meta text-ink-muted">Cargando...</div>;
  if (!statement) return null;

  const repaymentBatches = groupRepaymentBatches(statement.recentRepayments);

  if (statement.debts.length === 0 && repaymentBatches.length === 0) {
    return <p className="py-4 text-center text-meta text-ink-muted">Sin movimientos todavía.</p>;
  }

  return (
    <div className="space-y-4">
      {statement.debts.length === 0 && (
        <p className="text-meta text-ink-muted">Sin compras pendientes de reponer.</p>
      )}
      {statement.debts.length > 0 && (
      <div className="space-y-2">
      {statement.overLimit && (
        <p className="rounded-srf bg-bad/10 border border-bad/20 px-3 py-2 text-meta text-bad-ink">
          Supera el límite de crédito ({formatCurrency(statement.payer.creditLimit)}).
        </p>
      )}
      <AgingRow aging={statement.aging} />
      <table className="w-full text-body">
        <thead>
          <tr className="border-b text-left text-meta uppercase tracking-wide text-ink-muted">
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
              <td className="py-2 text-ink-muted">{formatDateTime(d.date)}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(d.payerAmount)}</td>
              <td className="py-2 text-right tabular-nums text-ink-muted">{formatCurrency(d.reimbursedAmount)}</td>
              <td className="py-2 text-right font-semibold tabular-nums text-bad-ink">{formatCurrency(d.outstanding)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={6} className="pt-2">
            <Btn variant="primary" size="sm" onClick={onPay}>Reponer dinero a {payerName}</Btn>
          </td></tr>
        </tfoot>
      </table>
      </div>
      )}
      <RepaymentHistoryTable batches={repaymentBatches} canRevert
        onRevert={async (batchId) => {
          const r = await confirm({
            title: 'Revertir esta reposición al pagador',
            description: 'El dinero vuelve a donde salió y las compras recuperan su saldo pendiente.',
            confirmLabel: 'Revertir',
            reason: { label: 'Motivo', placeholder: 'Ej.: se le repuso al pagador equivocado, monto mal tipeado' },
          });
          if (r.ok && r.reason) revertMutation.mutate({ batchId, reason: r.reason });
        }}
        revertingKey={revertMutation.isPending ? revertMutation.variables?.batchId ?? null : null} />
    </div>
  );
}

export function PayersTab() {
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
        <p className="text-body text-ink-muted max-w-xl">
          Terceros que a veces pagan una compra de su bolsillo (no la empresa) — ej. compras en el mercado pagadas
          en efectivo por el dueño. Aquí se ve cuánto se le debe a cada uno y se le repone el dinero.
        </p>
        <Btn variant="primary" onClick={() => setShowNew(true)}><Plus />Nuevo pagador</Btn>
      </div>

      {grandTotal > 0 && (
        <div className={cn(surfaceCls, 'border-t-4 border-t-destructive')}>
          <div className="p-4 flex items-center justify-between">
            <span className="text-meta font-semibold uppercase tracking-wide text-ink-muted">Total pendiente a pagadores</span>
            <span className="text-kpi font-semibold tabular-nums text-bad-ink">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      )}

      <div className={surfaceCls}>
        {isLoading ? <div className="py-12 text-center text-ink-muted">Cargando...</div> : (
          <div className="divide-y">
            {(payers ?? []).map((p) => (
              <div key={p.id}>
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink/[0.03] text-left"
                  onClick={() => setExpanded(v => v === p.id ? null : p.id)}>
                  <div className="flex items-center gap-2">
                    {expanded === p.id ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{p.name}</p>
                        {p.overLimit && <StatusBadge tone="bad">Supera límite</StatusBadge>}
                      </div>
                      {p.phone && <p className="text-meta text-ink-muted">{p.phone}</p>}
                      {p.aging && <AgingRow aging={p.aging} />}
                    </div>
                  </div>
                  <span className={cn('text-section font-semibold tabular-nums', (p.totalOwed ?? 0) > 0 ? 'text-bad-ink' : 'text-ink-muted')}>
                    {formatCurrency(p.totalOwed ?? 0)}
                  </span>
                </button>
                {expanded === p.id && (
                  <div className="px-4 pb-4 bg-surface-2">
                    <PayerDetail payerId={p.id} payerName={p.name} onPay={() => setPayPayer(p)} />
                  </div>
                )}
              </div>
            ))}
            {(payers ?? []).length === 0 && (
              <div className="py-12 text-center text-ink-muted">No hay pagadores registrados todavía.</div>
            )}
          </div>
        )}
      </div>

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
