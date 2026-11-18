// Devoluciones al proveedor: registrar una devolución de mercadería y su lista.
import { Btn, Modal as ErpModal } from '@/components/erp';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';

// Envoltura sobre la ventana común del ERP (misma firma de antes).
function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  return (
    <ErpModal open onOpenChange={(v) => { if (!v) onClose(); }} size={wide ? 'lg' : 'md'} keepOpen
      title={title} description={subtitle} footer={footer}>
      <div className="space-y-4">{children}</div>
    </ErpModal>
  );
}

/* ─── Devoluciones al proveedor ─────────────────────────────────────────── */

const SETTLEMENT_LABELS: Record<string, string> = {
  CREDIT_NOTE: 'Nota de crédito',
  REFUND: 'Devolución de dinero',
  REPLACEMENT: 'Cambio de producto',
};
const SETTLEMENT_HELP: Record<string, string> = {
  CREDIT_NOTE: 'Baja lo que le debes de esta compra.',
  REFUND: 'El proveedor te devuelve el dinero. Entra a Caja General.',
  REPLACEMENT: 'Te cambia el producto por otro igual. No cambia el stock ni el dinero.',
};
const ACCOUNT_LABELS: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin' };

interface Returnable {
  order: { id: string; orderNumber: string; outstanding: number };
  lines: Array<{ productId: string; name: string; received: number; returned: number; available: number; unitCost: number; currentStock: number }>;
}

export interface SupplierReturnRow {
  id: string; returnNumber: string; settlement: string; reasonCode: string; amount: number;
  refundAccount: string | null; docSeries: string | null; docNumber: string | null;
  notes: string | null; createdAt: string; voidedAt: string | null; voidReason: string | null;
  items: Array<{ id: string; quantity: number; product: { id: string; name: string } }>;
  user?: { firstName: string; lastName: string };
  voidedBy?: { firstName: string; lastName: string } | null;
}

export function SupplierReturnModal({ orderId, supplierName, onClose }: { orderId: string; supplierName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['purchase-returnable', orderId],
    queryFn: async () => (await api.get<{ data: Returnable }>(`/purchases/${orderId}/returnable`)).data.data,
  });
  const { data: reasons } = useQuery({
    queryKey: ['supplier-return-reasons'],
    queryFn: async () => (await api.get<{ data: Array<{ code: string; label: string }> }>('/purchases/returns/reasons')).data.data,
    staleTime: Infinity,
  });

  const [qty, setQty] = useState<Record<string, string>>({});
  const [settlement, setSettlement] = useState('CREDIT_NOTE');
  const [reasonCode, setReasonCode] = useState('EXPIRED');
  const [amountText, setAmountText] = useState<string | null>(null);
  const [account, setAccount] = useState('CASH');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');

  const items = useMemo(() => (data?.lines ?? [])
    .map((l) => ({ line: l, quantity: Number(qty[l.productId] || 0) }))
    .filter((x) => x.quantity > 0), [data, qty]);
  const computed = items.reduce((s, x) => s + x.quantity * x.line.unitCost, 0);
  const shownAmount = amountText ?? (computed > 0 ? computed.toFixed(2) : '');
  const finalAmount = settlement === 'REPLACEMENT' ? 0 : Math.round((Number(shownAmount) || 0) * 100) / 100;
  useEffect(() => { setAmountText(null); }, [computed]);

  const tooMuch = items.some((x) => x.quantity > x.line.available + 0.0005 || (settlement !== 'REPLACEMENT' && x.quantity > x.line.currentStock + 0.0005));
  const overDebt = settlement === 'CREDIT_NOTE' && data && finalAmount > data.order.outstanding + 0.009;
  const canSubmit = items.length > 0 && !tooMuch && !overDebt && (settlement === 'REPLACEMENT' || finalAmount > 0);

  const mutation = useMutation({
    mutationFn: () => api.post('/purchases/returns', {
      purchaseOrderId: orderId,
      settlement,
      reasonCode,
      items: items.map((x) => ({ productId: x.line.productId, quantity: x.quantity })),
      amount: settlement === 'REPLACEMENT' ? undefined : finalAmount,
      refundAccount: settlement === 'REFUND' ? account : undefined,
      docSeries: settlement === 'CREDIT_NOTE' ? (series.trim() || null) : null,
      docNumber: settlement === 'CREDIT_NOTE' ? (number.trim() || null) : null,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      ['purchases', 'purchase', 'purchase-returnable', 'purchases-payable', 'purchases-payable-summary', 'products', 'treasury-balance', 'inv-expiry']
        .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success(settlement === 'CREDIT_NOTE'
        ? 'Devolución registrada. La deuda con el proveedor bajó.'
        : settlement === 'REFUND' ? 'Devolución registrada. El dinero entró a Caja General.' : 'Cambio de producto registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal
      wide
      title="Devolver al proveedor"
      subtitle={data ? `${data.order.orderNumber} · ${supplierName}` : supplierName}
      onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>Registrar devolución</Btn>
      </>}
    >
      <div>
        <p className="mb-2 text-body font-medium">¿Qué devuelves?</p>
        <div className="divide-y rounded-srf border">
          {(data?.lines ?? []).map((l) => {
            const q = Number(qty[l.productId] || 0);
            const over = q > l.available + 0.0005;
            return (
              <div key={l.productId} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body">{l.name}</p>
                  <p className="text-meta text-ink-muted">
                    Recibido {l.received}{l.returned > 0 ? ` · ya devuelto ${l.returned}` : ''} · {formatCurrency(l.unitCost)} c/u
                  </p>
                </div>
                <Input
                  className={cn('h-9 w-20 text-right', over && 'border-bad')}
                  inputMode="decimal" placeholder="0" value={qty[l.productId] ?? ''}
                  disabled={l.available <= 0}
                  onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value.replace(',', '.') })}
                />
              </div>
            );
          })}
          {data && data.lines.length === 0 && <p className="p-3 text-body text-ink-muted">Esta compra no tiene productos recibidos.</p>}
        </div>
        {tooMuch && <p className="mt-1 text-meta text-bad-ink">Hay cantidades mayores a lo que se puede devolver o al stock actual.</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-body font-medium">Motivo</label>
          <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {(reasons ?? []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-body font-medium">¿Cómo te lo reconoce?</label>
          <Select value={settlement} onChange={(e) => setSettlement(e.target.value)}>
            {Object.entries(SETTLEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <p className="mt-1 text-meta text-ink-muted">{SETTLEMENT_HELP[settlement]}</p>
        </div>
      </div>

      {settlement !== 'REPLACEMENT' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-body font-medium">Monto que reconoce</label>
            <MoneyInput value={shownAmount} min={0} step="0.01" state={overDebt ? 'error' : undefined}
              onChange={(e) => setAmountText(e.target.value)} />
            <p className={cn('mt-1 text-meta', overDebt ? 'text-bad-ink' : 'text-ink-muted')}>
              {overDebt
                ? `Es más de lo que se debe de esta compra (${formatCurrency(data!.order.outstanding)}). Elige "Devolución de dinero".`
                : `Al costo de la compra: ${formatCurrency(computed)}`}
            </p>
          </div>
          {settlement === 'REFUND' ? (
            <div>
              <label className="mb-1 block text-body font-medium">¿Dónde entró el dinero?</label>
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                {Object.entries(ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-body font-medium">Serie NC</label>
                <Input value={series} maxLength={10} placeholder="FC01" onChange={(e) => setSeries(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="mb-1 block text-body font-medium">Número</label>
                <Input value={number} maxLength={20} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-body font-medium">Notas</label>
        <Input value={notes} maxLength={500} placeholder="Opcional" onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

export function SupplierReturnsList({ returns, orderId }: { returns: SupplierReturnRow[]; orderId: string }) {
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: (id: string) => api.post(`/purchases/returns/${id}/void`, { reason }),
    onSuccess: () => {
      ['purchases', 'purchase', 'purchase-returnable', 'purchases-payable', 'products', 'treasury-balance']
        .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      queryClient.invalidateQueries({ queryKey: ['purchase', orderId] });
      toast.success('Devolución anulada. El stock volvió.');
      setVoiding(null); setReason('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  if (returns.length === 0) return null;
  return (
    <div className="space-y-2 rounded-srf border p-3">
      <p className="text-meta font-semibold uppercase tracking-wide text-ink-muted">Devoluciones al proveedor</p>
      {returns.map((r) => (
        <div key={r.id} className={cn('text-meta', r.voidedAt && 'text-ink-muted')}>
          <div className="flex items-start justify-between gap-3">
            <div className={cn('min-w-0', r.voidedAt && 'line-through')}>
              <p className="font-medium text-ink">
                <PackageX className="mr-1 inline h-3.5 w-3.5 text-ink-muted" />
                {r.returnNumber} · {SETTLEMENT_LABELS[r.settlement] ?? r.settlement}
                {r.docSeries || r.docNumber ? ` ${[r.docSeries, r.docNumber].filter(Boolean).join('-')}` : ''}
                {r.refundAccount ? ` · ${ACCOUNT_LABELS[r.refundAccount]}` : ''}
              </p>
              <p className="text-ink-muted">
                {formatDateTime(r.createdAt)} · {r.items.map((i) => `${Number(i.quantity)} ${i.product.name}`).join(', ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {Number(r.amount) > 0 && <span className="font-semibold tabular-nums text-ink">{formatCurrency(r.amount)}</span>}
              {!r.voidedAt && voiding !== r.id && (
                <button className="text-ink-muted hover:text-bad-ink" onClick={() => setVoiding(r.id)}>Anular</button>
              )}
            </div>
          </div>
          {r.voidedAt && <p className="italic">Anulada{r.voidedBy ? ` por ${r.voidedBy.firstName}` : ''}{r.voidReason ? `: ${r.voidReason}` : ''}</p>}
          {voiding === r.id && (
            <div className="mt-2 flex gap-2">
              <Input className="h-8" autoFocus placeholder="Motivo de la anulación" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Btn size="sm" variant="danger" disabled={reason.trim().length < 3} loading={mutation.isPending} onClick={() => mutation.mutate(r.id)}>Anular</Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setVoiding(null); setReason(''); }}>No</Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
