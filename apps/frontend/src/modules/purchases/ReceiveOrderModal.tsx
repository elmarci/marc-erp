import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, PackageCheck, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import { Modal, Btn } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';
import { notifyMarginAlerts, type MarginAlert } from '@/lib/marginAlerts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SupplierDocFields, docPayload, emptyDoc, docProblem, type SupplierDoc } from './SupplierDocuments';
import { PaymentLeg, PaymentStatusPicker, legsMatch } from './payment';
import { OrderDetail, Payer } from './types';

export function ReceiveOrderModal({ order, onClose, onReceived }: {
  order: OrderDetail; onClose: () => void; onReceived: () => void;
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState(
    order.items.map(i => ({
      productId: i.product.id, name: i.product.name, barcode: i.product.barcode,
      orderedQty: i.orderedQty, receivedQty: i.orderedQty - i.receivedQty,
      unitCost: Number(i.unitCost), isBonus: false,
      trackExpiry: i.product.trackExpiry, batchNumber: '', expiryDate: '',
    }))
  );
  const [notes, setNotes] = useState('');
  const [doc, setDoc] = useState<SupplierDoc>(() => ({
    ...emptyDoc(), docType: order.docType ?? '', docSeries: order.docSeries ?? '', docNumber: order.docNumber ?? '',
    docIssueDate: order.docIssueDate ? order.docIssueDate.slice(0, 10) : '',
  }));
  const docIssue = docProblem(doc, order.supplier.taxId);
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

  // Fecha de vencimiento obligatoria en lo que se recibe de productos que la controlan.
  const missingExpiry = items.some(i => i.trackExpiry && i.receivedQty > 0 && !i.expiryDate);

  const canSubmitPayment = !missingExpiry && !docIssue && (payerMode
    ? !!payerId && payerAmountNum > 0.009 && (payTarget === 0 || !payment.paid || legsMatch(payment.legs, payTarget))
    : (!payment.paid || receiptTotal === 0 || legsMatch(payment.legs, receiptTotal)));

  const { data: bonusResults } = useQuery({
    queryKey: ['products-search', debouncedBonusSearch],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; barcode: string | null; costPrice: number; trackExpiry?: boolean }> }>(`/products?q=${debouncedBonusSearch}&limit=10`)).data.data,
    enabled: debouncedBonusSearch.length >= 2,
  });

  const addBonusProduct = (p: { id: string; name: string; barcode: string | null; trackExpiry?: boolean }) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(v => [...v, {
      productId: p.id, name: p.name, barcode: p.barcode, orderedQty: 0, receivedQty: 1, unitCost: 0, isBonus: true,
      trackExpiry: !!p.trackExpiry, batchNumber: '', expiryDate: '',
    }]);
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
    mutationFn: () => api.post<{ marginAlerts?: MarginAlert[] }>(`/purchases/${order.id}/receive`, {
      items: items.map(i => ({
        productId: i.productId, receivedQty: i.receivedQty, unitCost: i.unitCost, isBonus: i.isBonus,
        batchNumber: i.trackExpiry && i.batchNumber ? i.batchNumber : undefined,
        expiryDate: i.trackExpiry && i.expiryDate ? new Date(`${i.expiryDate}T12:00:00`).toISOString() : undefined,
      })),
      notes,
      doc: docPayload(doc),
      payerId: payerMode ? (payerId || undefined) : undefined,
      payerAmount: payerMode ? payerAmountNum : undefined,
      payment: (payerMode && payTarget === 0) ? undefined : payment,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inv-alerts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inv-margin-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inv-expiry'] });
      notifyMarginAlerts(res.data.marginAlerts);
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
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="md" keepOpen
      title={<>Recibir Mercadería — {order.orderNumber}</>}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmitPayment}>
            <PackageCheck />Confirmar recepción
          </Btn>
      </>}
    >
      <div className="space-y-4">
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
            <Input className="pl-9" placeholder="Escanear código de barras para sumar 1 a lo recibido..."
              value={scan} onChange={e => setScan(e.target.value)} onKeyDown={handleScanKeyDown} autoFocus />
          </div>
          <table className="w-full text-body">
            <thead>
              <tr className="border-b text-left text-meta uppercase tracking-wide text-ink-muted">
                <th className="py-2 font-semibold">Producto</th>
                <th className="py-2 font-semibold text-center w-20">Pedido</th>
                <th className="py-2 font-semibold text-center w-24">Recibido</th>
                <th className="py-2 font-semibold text-right w-32">Costo unit.</th>
                <th className="py-2 font-semibold text-center w-16">Bonif.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <>
                  <tr key={item.productId} className={cn(item.isBonus && 'bg-ok/5')}>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-center text-ink-muted">{item.orderedQty || '—'}</td>
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
                  {item.trackExpiry && (
                    <tr key={`${item.productId}-exp`} className="bg-warn/5">
                      <td colSpan={5} className="px-2 pb-2">
                        <div className="flex items-center gap-2">
                          <label className="text-meta font-medium whitespace-nowrap">Vence <span className="text-bad-ink">*</span></label>
                          <Input type="date" value={item.expiryDate}
                            onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, expiryDate: e.target.value } : i))}
                            className={cn('h-8 w-40', !item.expiryDate && item.receivedQty > 0 && 'border-bad')} />
                          {!item.expiryDate && item.receivedQty > 0 && <span className="text-meta text-bad-ink whitespace-nowrap">Obligatorio</span>}
                          <label className="text-meta text-ink-muted whitespace-nowrap">N° lote</label>
                          <Input value={item.batchNumber} placeholder="Opcional"
                            onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, batchNumber: e.target.value } : i))}
                            className="h-8" />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          <div>
            <label className="mb-1 block text-body font-medium">Agregar producto bonificado (que no estaba en la orden)</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input className="pl-9" placeholder="Ej: te regalaron un producto distinto..." value={bonusSearch}
                onChange={e => setBonusSearch(e.target.value)} />
            </div>
            {bonusResults && bonusResults.length > 0 && bonusSearch.length >= 2 && (
              <div className="border rounded-srf mt-1 divide-y max-h-32 overflow-y-auto bg-surface shadow-lg">
                {bonusResults.map(p => (
                  <button key={p.id} onClick={() => addBonusProduct(p)}
                    className="w-full text-left px-3 py-2 text-body hover:bg-ink/[0.03]">{p.name}</button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-srf border p-4 space-y-2">
            <p className="text-body font-medium">Comprobante que llegó con la mercadería</p>
            <SupplierDocFields value={doc} onChange={setDoc} supplierTaxId={order.supplier.taxId} />
            {docIssue && <p className="text-meta text-bad-ink">{docIssue}</p>}
          </div>

          <div>
            <label className="mb-1 block text-body font-medium">Notas de recepción</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>

          {receiptTotal > 0 && (
            <>
              <div className="rounded-srf border-2 p-4 space-y-2">
                <label className="mb-1 block text-meta font-semibold uppercase tracking-wide text-ink-muted">¿Quién paga esta recepción?</label>
                <div className="flex gap-2">
                  <Btn type="button" size="sm" variant={!payerMode ? 'primary' : 'secondary' as 'primary' | 'secondary' | 'ghost' | 'danger'} className="flex-1"
                    disabled={!!order.payerId}
                    onClick={() => { setPayerMode(false); setPayerId(''); setShowNewPayer(false); }}>
                    La empresa
                  </Btn>
                  <Btn type="button" size="sm" variant={payerMode ? 'primary' : 'secondary' as 'primary' | 'secondary' | 'ghost' | 'danger'} className="flex-1"
                    onClick={() => {
                      setPayerMode(true);
                      setPayerAmountInput(String(receiptTotal));
                      if (!payers || payers.length === 0) setShowNewPayer(true);
                    }}>
                    Un tercero (todo o en parte)
                  </Btn>
                </div>
                {order.payerId && (
                  <p className="text-meta text-ink-muted">
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
                      <label className="mb-1 block text-meta text-ink-muted">Monto que financia {payers?.find(p => p.id === payerId)?.name}</label>
                      <MoneyInput size="sm" min={0} max={receiptTotal} value={payerAmountInput}
                        onChange={e => setPayerAmountInput(e.target.value)} />
                    </div>
                    <p className="text-meta text-ink-muted">
                      {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General — se abre
                      una deuda con <strong>{payers?.find(p => p.id === payerId)?.name}</strong> que se repone luego
                      desde la pestaña "Pagadores".
                      {payTarget > 0 && <> El resto ({formatCurrency(payTarget)}) se paga al contado o queda a crédito con el proveedor, abajo.</>}
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

              {!payerMode && <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={receiptTotal} onChange={setPayment} />}
              {payerMode && payerId && payTarget > 0 && (
                <PaymentStatusPicker paid={payment.paid} legs={payment.legs} total={payTarget} onChange={setPayment} />
              )}
            </>
          )}
        </div>
    </Modal>
  );
}

/* ─── Registrar pago de una compra a crédito ─────────────────────────────── */
