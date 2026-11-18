import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, cn, looksLikeScannedCode, todayLimaDateString } from '@/lib/utils';
import { notifyMarginAlerts, type MarginAlert } from '@/lib/marginAlerts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SupplierDocFields, emptyDoc, docPayload, docProblem, type SupplierDoc } from './SupplierDocuments';
import { PaymentLeg, PaymentLegsEditor, PaymentStatusPicker, legsMatch } from './payment';
import { Btn, Field, Modal, Panel, Segmented, Toggle, fieldCls } from '@/components/erp';
import { OrderDetail, Payer, Product, Supplier, SupplierCatalogItem } from './types';
import { DirectLineRow, SupplierCatalogPicker, useLineFocus, type DirectLine } from './purchaseLines';

export function RegisterPurchaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: (order: OrderDetail) => void }) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [doc, setDoc] = useState<SupplierDoc>(emptyDoc);
  const [date, setDate] = useState(() => todayLimaDateString());
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [lines, setLines] = useState<DirectLine[]>([]);
  const [payment, setPayment] = useState<{ paid: boolean; legs: PaymentLeg[] }>({ paid: true, legs: [{ amount: 0, method: 'CASH' }] });
  // Afecto a IGV: los costos que se escriben YA traen el IGV; solo se calcula
  // lo que va dentro para llevar la cuenta del IGV de facturas y boletas.
  const [includeTax, setIncludeTax] = useState(false);
  // Percepción: se le paga al proveedor, pero va aparte del costo.
  const [hasPerception, setHasPerception] = useState(false);
  const [perceptionInput, setPerceptionInput] = useState('');
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

  const { searchRef, qtyRefs, costRefs, focusLine, onQtyEnter, onCostEnter } = useLineFocus();

  // Lo último escaneado/agregado va siempre arriba de la lista, con el foco
  // en Cantidad. Si ya estaba, se sube al primer lugar (sin duplicarlo).
  const addLine = (p: { id: string; name: string; isBulk?: boolean; bulkUnit?: string | null; trackExpiry?: boolean }, defaultCost: number) => {
    setLines(v => {
      const existing = v.find(l => l.productId === p.id);
      const rest = v.filter(l => l.productId !== p.id);
      return [existing ?? {
        productId: p.id, name: p.name, isBulk: !!p.isBulk, bulkUnit: p.bulkUnit ?? null,
        isBonus: false, quantity: '1', unitCost: String(defaultCost),
        useBulkEntry: false, sacks: '', weightPerSack: '', totalCost: '',
        trackExpiry: !!p.trackExpiry, batchNumber: '', expiryDate: '',
      }, ...rest];
    });
    if (lines.some(l => l.productId === p.id)) toast.info(`${p.name} ya estaba en la lista — se movió arriba.`);
    setSearch('');
    focusLine(p.id);
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

  const goodsTotal = lines.reduce((s, l) => s + effQty(l) * effUnitCost(l), 0);
  const igvInside = includeTax ? goodsTotal - goodsTotal / 1.18 : 0;
  const perception = hasPerception ? Math.max(0, Number(perceptionInput) || 0) : 0;
  // Lo que se le paga al proveedor: mercadería (con IGV si corresponde) + percepción.
  const total = Math.round((goodsTotal + perception) * 100) / 100;
  const payMode: 'now' | 'credit' | 'payer' = payerMode ? 'payer' : payment.paid ? 'now' : 'credit';
  const setPayMode = (m: 'now' | 'credit' | 'payer') => {
    if (m === 'payer') {
      setPayerMode(true);
      setPayerAmountInput(String(total));
      if (!payers || payers.length === 0) setShowNewPayer(true);
      return;
    }
    setPayerMode(false); setPayerId(''); setShowNewPayer(false);
    setPayment(p => m === 'now'
      ? { paid: true, legs: p.legs.length ? p.legs : [{ amount: total, method: 'CASH' }] }
      : { ...p, paid: false });
  };

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

  // Lácteos, panadería, carnes y embutidos: sin fecha de vencimiento no se registra.
  const missingExpiry = lines.some(l => l.trackExpiry && effQty(l) > 0 && !l.expiryDate);

  const supplierTaxId = suppliers?.find(s => s.id === supplierId)?.taxId ?? null;
  // El RUC se llena con el del proveedor y se puede corregir.
  const pickSupplier = (id: string) => {
    setSupplierId(id);
    setDoc(d => ({ ...d, supplierTaxId: suppliers?.find(s => s.id === id)?.taxId ?? '' }));
  };
  const docIssue = docProblem(doc, supplierTaxId);
  const canSubmit = !!supplierId && lines.length > 0 && lines.every(l => effQty(l) > 0) && !missingExpiry && !docIssue
    && (payerMode
      ? !!payerId && payerAmountNum > 0.009 && (payTarget === 0 || !payment.paid || legsMatch(payment.legs, payTarget))
      : (!payment.paid || total === 0 || legsMatch(payment.legs, total)));

  const mutation = useMutation({
    mutationFn: () => api.post<{ data: OrderDetail; marginAlerts?: MarginAlert[] }>('/purchases/direct', {
      supplierId,
      doc: docPayload(doc) ?? (doc.supplierTaxId.trim() && doc.supplierTaxId.trim() !== (supplierTaxId ?? '')
        ? { supplierTaxId: doc.supplierTaxId.trim() } : undefined),
      date: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      notes: notes || undefined,
      includeTax,
      perceptionAmount: perception > 0 ? perception : undefined,
      payerId: payerMode ? (payerId || undefined) : undefined,
      payerAmount: payerMode ? payerAmountNum : undefined,
      items: lines.map(l => ({
        productId: l.productId,
        quantity: effQty(l),
        unitCost: effUnitCost(l),
        isBonus: l.isBonus,
        batchNumber: l.trackExpiry && l.batchNumber ? l.batchNumber : undefined,
        expiryDate: l.trackExpiry && l.expiryDate ? new Date(`${l.expiryDate}T12:00:00`).toISOString() : undefined,
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
      queryClient.invalidateQueries({ queryKey: ['inv-alerts-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inv-margin-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inv-expiry'] });
      notifyMarginAlerts(res.data.marginAlerts);
      onCreated(res.data.data);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(v) => { if (!v) onClose(); }} size="xl" keepOpen
      title="Registrar compra"
      description="Mercadería que ya llegó: actualiza stock y costo promedio de inmediato."
      footer={<>
        <div className="mr-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-table">
          <span className="text-ink-muted">Mercadería <span className="font-medium tabular-nums text-ink">{formatCurrency(goodsTotal)}</span></span>
          {perception > 0 && <span className="text-ink-muted">Percepción <span className="font-medium tabular-nums text-ink">{formatCurrency(perception)}</span></span>}
          <span className="text-ink-muted">A pagar <span className="text-section font-semibold tabular-nums text-ink">{formatCurrency(total)}</span></span>
        </div>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
          Registrar compra
        </Btn>
      </>}
    >
      <div className="flex flex-col gap-4">
        <Panel title="Proveedor y documento" bodyClassName="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Proveedor" required className="sm:col-span-2">
              <select className={fieldCls} value={supplierId} onChange={e => pickSupplier(e.target.value)}>
                <option value="">Elegir proveedor</option>
                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
              </select>
            </Field>
            <Field label="Fecha de recepción">
              <input type="date" className={fieldCls} value={date} onChange={e => setDate(e.target.value)} />
            </Field>
          </div>
          <SupplierDocFields value={doc} onChange={setDoc} supplierTaxId={supplierTaxId} editableRuc={!!supplierId} />
          {docIssue && supplierId && <p className="text-meta text-bad-ink">{docIssue}</p>}
        </Panel>

        <Panel title="Productos" meta={lines.length ? `${lines.length} ${lines.length === 1 ? 'producto' : 'productos'}` : undefined}
          bodyClassName="flex flex-col">
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <div className="relative">
              <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input ref={searchRef} className={cn(fieldCls, 'pl-8')} placeholder="Buscar por nombre o escanear el código de barras"
                aria-label="Agregar producto" value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={handleScanKeyDown} />
              {products && products.length > 0 && search.length >= 2 && (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-srf bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]">
                  {products.map(p => (
                    <button key={p.id} type="button" onClick={() => addLine(p, Number(p.costPrice))}
                      className="flex w-full items-center justify-between gap-3 rounded-ctl px-2.5 py-2 text-left text-table hover:bg-ink/[0.05]">
                      <span className="min-w-0 truncate text-ink">{p.name}{p.isBulk && <span className="ml-1.5 text-meta text-ink-muted">granel · {p.bulkUnit}</span>}</span>
                      <span className="shrink-0 text-meta tabular-nums text-ink-muted">Stock {p.currentStock} · {formatCost(p.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {supplierId && catalog && (
              <SupplierCatalogPicker
                catalog={catalog.filter(c => !lines.find(l => l.productId === c.productId))}
                onPick={c => addLine(c.product, c.price)} />
            )}
          </div>

          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-table text-ink-muted">Busca o escanea un producto para empezar.</p>
          ) : (
            <div className="divide-y divide-line">
              {lines.map((l, idx) => (
                <DirectLineRow key={l.productId} line={l} includeTax={includeTax}
                  qty={effQty(l)} unitCost={effUnitCost(l)}
                  onChange={(patch) => updateLine(idx, patch)} onRemove={() => removeLine(idx)}
                  qtyRef={el => { qtyRefs.current[l.productId] = el; }} costRef={el => { costRefs.current[l.productId] = el; }}
                  onQtyKeyDown={onQtyEnter(l.productId)} onCostKeyDown={onCostEnter} />
              ))}
            </div>
          )}
        </Panel>

        {lines.length > 0 && (
          <Panel title="Impuestos" bodyClassName="flex flex-col divide-y divide-line">
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <Toggle on={includeTax} onChange={setIncludeTax} label="Afecto a IGV" />
                <span className="flex-1 text-table font-medium text-ink">Afecto a IGV</span>
                {includeTax && <span className="text-table tabular-nums text-ink-muted">IGV dentro <span className="font-medium text-ink">{formatCurrency(igvInside)}</span></span>}
              </div>
              <p className="text-meta text-ink-muted">
                {includeTax
                  ? `Los costos ya traen el IGV y no se suma nada. Base ${formatCurrency(goodsTotal - igvInside)} + IGV ${formatCurrency(igvInside)}: el IGV se acumula para tu control.`
                  : 'Márcalo si la factura o boleta trae IGV. Escribe los costos con IGV incluido.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Toggle on={hasPerception} label="Percepción"
                  onChange={(v) => { setHasPerception(v); if (v && !perceptionInput) setPerceptionInput((Math.round(goodsTotal * 2) / 100).toFixed(2)); }} />
                <span className="flex-1 text-table font-medium text-ink">Percepción</span>
                {hasPerception && (
                  <div className="w-36">
                    <MoneyInput size="sm" min={0} value={perceptionInput} aria-label="Monto de la percepción"
                      onChange={e => setPerceptionInput(e.target.value)} />
                  </div>
                )}
              </div>
              <p className="text-meta text-ink-muted">
                {hasPerception
                  ? 'Se sugiere el 2% de la mercadería; corrígelo con lo que dice el comprobante. Se paga al proveedor pero no sube el costo de los productos.'
                  : 'Márcalo si el proveedor te cobró percepción.'}
              </p>
            </div>
          </Panel>
        )}

        {lines.length > 0 && (
          <Panel title="Pago" meta={formatCurrency(total)} bodyClassName="flex flex-col gap-3 p-4">
            <Segmented ariaLabel="¿Cómo se pagó?" value={payMode} onChange={setPayMode} className="w-full sm:w-fit"
              options={[['now', 'Pagado ahora'], ['credit', 'A crédito'], ['payer', 'Lo financió un pagador']]} />

            {payMode === 'now' && <PaymentLegsEditor total={total} legs={payment.legs} onChange={l => setPayment({ paid: true, legs: l })} />}
            {payMode === 'credit' && (
              <p className="text-meta text-ink-muted">Queda como deuda con el proveedor en "Cuentas por pagar".</p>
            )}

            {payMode === 'payer' && (
              <div className="flex flex-col gap-3">
                {!!payers?.length && !showNewPayer && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
                    <Field label="Pagador">
                      <select className={fieldCls} value={payerId} onChange={e => setPayerId(e.target.value)}>
                        <option value="">Elegir pagador</option>
                        {payers.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</option>)}
                      </select>
                    </Field>
                    {payerId && (
                      <Field label="Monto que puso">
                        <MoneyInput size="sm" min={0} max={total} value={payerAmountInput}
                          onChange={e => setPayerAmountInput(e.target.value)} />
                      </Field>
                    )}
                  </div>
                )}
                {showNewPayer && (
                  <div className="flex flex-col gap-2 rounded-ctl bg-surface-2 p-3 shadow-[0_0_0_1px_hsl(var(--line))]">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Field label="Nombre" required>
                        <input className={fieldCls} value={newPayerName} onChange={e => setNewPayerName(e.target.value)} />
                      </Field>
                      <Field label="Teléfono">
                        <input className={fieldCls} placeholder="Opcional" value={newPayerPhone} onChange={e => setNewPayerPhone(e.target.value)} />
                      </Field>
                    </div>
                    <div className="flex justify-end gap-2">
                      {!!payers?.length && <Btn size="sm" variant="ghost" onClick={() => setShowNewPayer(false)}>Cancelar</Btn>}
                      <Btn size="sm" disabled={!newPayerName.trim()} loading={createPayerMutation.isPending}
                        onClick={() => createPayerMutation.mutate()}>
                        Crear pagador
                      </Btn>
                    </div>
                  </div>
                )}
                {!showNewPayer && (
                  <button type="button" className="w-fit text-meta font-medium text-brand hover:underline" onClick={() => setShowNewPayer(true)}>
                    Nuevo pagador
                  </button>
                )}
                {payerId && (
                  <p className="text-meta text-ink-muted">
                    {formatCurrency(payerAmountNum)} queda pagado al proveedor sin tocar Caja General y se abre una deuda con
                    {' '}<span className="font-medium text-ink">{payers?.find(p => p.id === payerId)?.name}</span>, que se repone
                    desde "Pagadores".
                  </p>
                )}
                {payerId && payTarget > 0 && (
                  <PaymentStatusPicker title="El resto" paid={payment.paid} legs={payment.legs} total={payTarget} onChange={setPayment} />
                )}
              </div>
            )}
          </Panel>
        )}

        <Field label="Notas">
          <input className={fieldCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Modal>
  );
}

/* ─── New Purchase Order Modal ──────────────────────────────────────────── */
