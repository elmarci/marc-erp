import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageX, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';

/* ─── Comprobante del proveedor ─────────────────────────────────────────── */

export const DOC_TYPE_LABELS: Record<string, string> = {
  FACTURA: 'Factura',
  BOLETA: 'Boleta',
  TICKET: 'Ticket',
  NOTA_VENTA: 'Nota de venta',
  RECIBO_SERVICIO: 'Recibo de servicio',
  RECIBO_HONORARIOS: 'Recibo por honorarios',
  OTHER: 'Otro',
};

export interface SupplierDoc {
  docType: string;
  docSeries: string;
  docNumber: string;
  docIssueDate: string; // YYYY-MM-DD
  supplierTaxId: string;
}

export const emptyDoc = (): SupplierDoc => ({ docType: '', docSeries: '', docNumber: '', docIssueDate: '', supplierTaxId: '' });

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
/** Mismo control que el backend: 11 dígitos, prefijo y dígito verificador. */
export function isValidRuc(value: string | null | undefined): boolean {
  if (!value || !/^\d{11}$/.test(value)) return false;
  if (!['10', '15', '16', '17', '20'].includes(value.slice(0, 2))) return false;
  const sum = RUC_WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  return (11 - (sum % 11)) % 10 === Number(value[10]);
}

/** Lo que se manda al backend, o undefined si no se llenó nada. */
export function docPayload(doc: SupplierDoc) {
  if (!doc.docType && !doc.docSeries.trim() && !doc.docNumber.trim()) return undefined;
  return {
    docType: doc.docType || null,
    docSeries: doc.docSeries.trim() || null,
    docNumber: doc.docNumber.trim() || null,
    docIssueDate: doc.docIssueDate ? new Date(`${doc.docIssueDate}T12:00:00`).toISOString() : null,
    supplierTaxId: doc.supplierTaxId.trim() || null,
  };
}

/** Falta algo para poder guardar (factura sin serie/número o sin RUC válido). */
export function docProblem(doc: SupplierDoc, supplierTaxId: string | null | undefined): string | null {
  if (doc.docType !== 'FACTURA') return null;
  if (!doc.docSeries.trim() || !doc.docNumber.trim()) return 'Escribe la serie y el número de la factura.';
  if (!isValidRuc(supplierTaxId) && !isValidRuc(doc.supplierTaxId.trim())) return 'Falta un RUC válido del proveedor.';
  return null;
}

export function SupplierDocFields({ value, onChange, supplierTaxId, className }: {
  value: SupplierDoc;
  onChange: (doc: SupplierDoc) => void;
  supplierTaxId?: string | null;
  className?: string;
}) {
  const set = (patch: Partial<SupplierDoc>) => onChange({ ...value, ...patch });
  const needsRuc = value.docType === 'FACTURA' && !isValidRuc(supplierTaxId);
  const rucTyped = value.supplierTaxId.trim();
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      <div>
        <label className="mb-1 block text-sm font-medium">Comprobante</label>
        <Select value={value.docType} onChange={(e) => set({ docType: e.target.value })}>
          <option value="">Sin comprobante</option>
          {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Serie</label>
        <Input value={value.docSeries} maxLength={10} placeholder="F001"
          onChange={(e) => set({ docSeries: e.target.value.toUpperCase() })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Número</label>
        <Input value={value.docNumber} maxLength={20} inputMode="numeric" placeholder="123"
          onChange={(e) => set({ docNumber: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Fecha de emisión</label>
        <Input type="date" value={value.docIssueDate} onChange={(e) => set({ docIssueDate: e.target.value })} />
      </div>
      {needsRuc && (
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1 block text-sm font-medium">RUC del proveedor (está en la factura)</label>
          <Input value={value.supplierTaxId} maxLength={11} inputMode="numeric" placeholder="11 dígitos"
            onChange={(e) => set({ supplierTaxId: e.target.value.replace(/\D/g, '') })} />
          <p className={cn('mt-1 text-xs', rucTyped.length === 11 && !isValidRuc(rucTyped) ? 'text-destructive' : 'text-muted-foreground')}>
            {rucTyped.length === 11 && !isValidRuc(rucTyped)
              ? 'Ese RUC no pasa la verificación. Revisa los 11 dígitos.'
              : supplierTaxId
                ? `El RUC guardado (${supplierTaxId}) no es válido. Se reemplaza por este.`
                : 'Se guarda en la ficha del proveedor para las próximas facturas.'}
          </p>
        </div>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">{children}</div>
        <div className="flex justify-end gap-2 border-t p-4">{footer}</div>
      </div>
    </div>
  );
}

interface OrderDocInfo {
  id: string; orderNumber: string;
  docType?: string | null; docSeries?: string | null; docNumber?: string | null; docIssueDate?: string | null;
  supplierInvoice?: string | null;
  supplier: { businessName: string; taxId: string | null };
}

export function EditDocumentModal({ order, onClose }: { order: OrderDocInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<SupplierDoc>({
    docType: order.docType ?? '',
    docSeries: order.docSeries ?? '',
    docNumber: order.docNumber ?? '',
    docIssueDate: order.docIssueDate ? order.docIssueDate.slice(0, 10) : '',
    supplierTaxId: '',
  });
  const problem = docProblem(doc, order.supplier.taxId);
  const mutation = useMutation({
    mutationFn: () => api.patch(`/purchases/${order.id}/document`, docPayload(doc) ?? { docType: null, docSeries: null, docNumber: null, docIssueDate: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Comprobante guardado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <Modal
      title="Comprobante del proveedor"
      subtitle={`${order.orderNumber} · ${order.supplier.businessName}`}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => mutation.mutate()} disabled={!!problem} loading={mutation.isPending}>Guardar</Button>
      </>}
    >
      {order.supplierInvoice && !order.docNumber && (
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Se había anotado como texto: <span className="font-medium text-foreground">{order.supplierInvoice}</span>
        </p>
      )}
      <SupplierDocFields value={doc} onChange={setDoc} supplierTaxId={order.supplier.taxId} className="sm:grid-cols-2" />
      {problem && <p className="text-xs text-destructive">{problem}</p>}
    </Modal>
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
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>Registrar devolución</Button>
      </>}
    >
      <div>
        <p className="mb-2 text-sm font-medium">¿Qué devuelves?</p>
        <div className="divide-y rounded-lg border">
          {(data?.lines ?? []).map((l) => {
            const q = Number(qty[l.productId] || 0);
            const over = q > l.available + 0.0005;
            return (
              <div key={l.productId} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Recibido {l.received}{l.returned > 0 ? ` · ya devuelto ${l.returned}` : ''} · {formatCurrency(l.unitCost)} c/u
                  </p>
                </div>
                <Input
                  className={cn('h-9 w-20 text-right', over && 'border-destructive')}
                  inputMode="decimal" placeholder="0" value={qty[l.productId] ?? ''}
                  disabled={l.available <= 0}
                  onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value.replace(',', '.') })}
                />
              </div>
            );
          })}
          {data && data.lines.length === 0 && <p className="p-3 text-sm text-muted-foreground">Esta compra no tiene productos recibidos.</p>}
        </div>
        {tooMuch && <p className="mt-1 text-xs text-destructive">Hay cantidades mayores a lo que se puede devolver o al stock actual.</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Motivo</label>
          <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {(reasons ?? []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">¿Cómo te lo reconoce?</label>
          <Select value={settlement} onChange={(e) => setSettlement(e.target.value)}>
            {Object.entries(SETTLEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{SETTLEMENT_HELP[settlement]}</p>
        </div>
      </div>

      {settlement !== 'REPLACEMENT' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Monto que reconoce</label>
            <MoneyInput value={shownAmount} min={0} step="0.01" state={overDebt ? 'error' : undefined}
              onChange={(e) => setAmountText(e.target.value)} />
            <p className={cn('mt-1 text-xs', overDebt ? 'text-destructive' : 'text-muted-foreground')}>
              {overDebt
                ? `Es más de lo que se debe de esta compra (${formatCurrency(data!.order.outstanding)}). Elige "Devolución de dinero".`
                : `Al costo de la compra: ${formatCurrency(computed)}`}
            </p>
          </div>
          {settlement === 'REFUND' ? (
            <div>
              <label className="mb-1 block text-sm font-medium">¿Dónde entró el dinero?</label>
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                {Object.entries(ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Serie NC</label>
                <Input value={series} maxLength={10} placeholder="FC01" onChange={(e) => setSeries(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Número</label>
                <Input value={number} maxLength={20} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">Notas</label>
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
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Devoluciones al proveedor</p>
      {returns.map((r) => (
        <div key={r.id} className={cn('text-xs', r.voidedAt && 'text-muted-foreground')}>
          <div className="flex items-start justify-between gap-3">
            <div className={cn('min-w-0', r.voidedAt && 'line-through')}>
              <p className="font-medium text-foreground">
                <PackageX className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                {r.returnNumber} · {SETTLEMENT_LABELS[r.settlement] ?? r.settlement}
                {r.docSeries || r.docNumber ? ` ${[r.docSeries, r.docNumber].filter(Boolean).join('-')}` : ''}
                {r.refundAccount ? ` · ${ACCOUNT_LABELS[r.refundAccount]}` : ''}
              </p>
              <p className="text-muted-foreground">
                {formatDateTime(r.createdAt)} · {r.items.map((i) => `${Number(i.quantity)} ${i.product.name}`).join(', ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {Number(r.amount) > 0 && <span className="font-semibold tabular-nums text-foreground">{formatCurrency(r.amount)}</span>}
              {!r.voidedAt && voiding !== r.id && (
                <button className="text-muted-foreground hover:text-destructive" onClick={() => setVoiding(r.id)}>Anular</button>
              )}
            </div>
          </div>
          {r.voidedAt && <p className="italic">Anulada{r.voidedBy ? ` por ${r.voidedBy.firstName}` : ''}{r.voidReason ? `: ${r.voidReason}` : ''}</p>}
          {voiding === r.id && (
            <div className="mt-2 flex gap-2">
              <Input className="h-8" autoFocus placeholder="Motivo de la anulación" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" variant="destructive" disabled={reason.trim().length < 3} loading={mutation.isPending} onClick={() => mutation.mutate(r.id)}>Anular</Button>
              <Button size="sm" variant="ghost" onClick={() => { setVoiding(null); setReason(''); }}>No</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
