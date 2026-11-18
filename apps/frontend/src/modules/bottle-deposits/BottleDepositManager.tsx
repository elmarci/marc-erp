// Garantía de envase: cobrar, devolver y ver quién debe envases.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, Segmented, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, PAYMENT_METHOD_LABELS, cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface DepositProductRow {
  productId: string; name: string; barcode: string | null;
  depositAmount: number; outstandingQty: number; outstandingAmount: number;
}

interface DebtorRow {
  customerId: string | null; debtorLabel: string | null; debtorName: string; isRegisteredCustomer: boolean;
  customerPhone: string | null;
  productId: string; productName: string; outstandingQty: number; outstandingAmount: number;
}
interface CustomerHit { id: string; firstName: string; lastName: string | null; phone: string | null }
interface Debtor { customerId?: string; debtorLabel?: string; displayName: string }

/* ─── Identificador de a quién se le cobra/presta — nombre libre por
     defecto, con opción de buscar un cliente ya registrado ────────────── */
function DebtorPicker({ debtor, onSelect, onClear }: {
  debtor: Debtor | null;
  onSelect: (debtor: Debtor) => void; onClear: () => void;
}) {
  const [mode, setMode] = useState<'label' | 'search'>('label');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data } = useQuery({
    queryKey: ['bottle-deposit-customers', debouncedSearch],
    queryFn: async () => (await api.get<{ data: CustomerHit[] }>(`/customers?search=${debouncedSearch}&limit=8`)).data.data,
    enabled: debouncedSearch.length >= 1 && open,
  });

  const linkCls = 'text-meta font-medium text-brand hover:underline';
  if (debtor) {
    return (
      <div className="flex items-center justify-between rounded-ctl bg-brand-soft px-3 py-1.5">
        <span className="text-table font-medium text-ink">
          {debtor.displayName}{debtor.customerId ? '' : ' (sin registrar)'}
        </span>
        <Btn size="sm" variant="ghost" aria-label="Quitar persona" onClick={onClear}><X /></Btn>
      </div>
    );
  }

  if (mode === 'search') {
    return (
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input className={cn(fieldCls, 'pl-8')} aria-label="Buscar cliente" placeholder="Buscar cliente por nombre, DNI, teléfono..."
            value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        </div>
        {open && search.length >= 1 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full divide-y divide-line overflow-y-auto rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
            {(data ?? []).length === 0 && <p className="p-3 text-center text-meta text-ink-muted">Sin resultados</p>}
            {(data ?? []).map(c => (
              <button key={c.id} type="button"
                onClick={() => { onSelect({ customerId: c.id, displayName: `${c.firstName} ${c.lastName ?? ''}`.trim() }); setSearch(''); setOpen(false); }}
                className="w-full px-3 py-2 text-left text-table hover:bg-surface-2">
                {c.firstName} {c.lastName} {c.phone ? <span className="text-meta text-ink-muted">· {c.phone}</span> : null}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setMode('label')} className={cn(linkCls, 'mt-1')}>
          Prefiero sólo poner un nombre
        </button>
      </div>
    );
  }

  return (
    <div>
      <input className={fieldCls} aria-label="Nombre de la persona" value={label} onChange={e => setLabel(e.target.value)} placeholder="Nombre, apodo o teléfono (opcional)"
        onKeyDown={e => { if (e.key === 'Enter' && label.trim()) onSelect({ debtorLabel: label.trim(), displayName: label.trim() }); }} />
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={() => setMode('search')} className={linkCls}>Buscar cliente registrado</button>
        {label.trim() && (
          <button type="button" onClick={() => onSelect({ debtorLabel: label.trim(), displayName: label.trim() })} className={linkCls}>
            Usar "{label.trim()}"
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Cuerpo completo de "Garantía de envase" — cobrar, devolver y ver quién
 * debe. No trae su propio marco (modal o página): quien lo use decide cómo
 * envolverlo. Con `cashSessionId` los movimientos en efectivo quedan
 * atados a esa sesión de caja (necesario para que el arqueo cuadre); sin
 * él, se registran directo en la tesorería general.
 */
export function BottleDepositManager({ cashSessionId, onClose }: { cashSessionId?: string; onClose?: () => void }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'charge' | 'return' | 'debtors'>('charge');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(true);
  const [returnAmount, setReturnAmount] = useState('');
  const [returnAmountTouched, setReturnAmountTouched] = useState(false);
  const [debtor, setDebtor] = useState<Debtor | null>(null);

  const { data } = useQuery({
    queryKey: ['bottle-deposits-outstanding'],
    queryFn: async () => (await api.get<{ data: DepositProductRow[] }>('/bottle-deposits')).data.data,
  });

  const { data: debtors } = useQuery({
    queryKey: ['bottle-deposits-debtors'],
    queryFn: async () => (await api.get<{ data: DebtorRow[] }>('/bottle-deposits/debtors')).data.data,
    enabled: action === 'debtors',
  });

  const product = (data ?? []).find(p => p.productId === productId);

  // Con deudor identificado, lo pendiente de ESE par deudor+producto puede
  // ser distinto al total del producto (mezcla de envases pagados y
  // prestados) — se calcula del mismo listado que "Quién debe".
  const debtorRow = (debtors ?? []).find(d =>
    d.productId === productId && (debtor?.customerId ? d.customerId === debtor.customerId : d.debtorLabel === debtor?.debtorLabel));
  const outstandingQty = action === 'return'
    ? (debtor ? (debtorRow?.outstandingQty ?? 0) : (product?.outstandingQty ?? 0))
    : undefined;
  const outstandingAmount = debtor ? (debtorRow?.outstandingAmount ?? 0) : (product?.outstandingAmount ?? 0);

  const chargeAmount = paid && product ? Number(quantity || 0) * product.depositAmount : 0;
  const suggestedReturnAmount = product ? Math.min(Number(quantity || 0) * product.depositAmount, outstandingAmount) : 0;
  const finalReturnAmount = returnAmountTouched ? Number(returnAmount || 0) : suggestedReturnAmount;

  const resetForm = () => {
    setProductId(''); setQuantity('1'); setNotes(''); setPaid(true);
    setReturnAmount(''); setReturnAmountTouched(false); setDebtor(null);
  };

  const mutation = useMutation({
    mutationFn: () => api.post(`/bottle-deposits/${action === 'charge' ? 'charge' : 'return'}`, {
      productId, quantity: Number(quantity), method, cashSessionId, notes: notes || undefined,
      customerId: debtor?.customerId, debtorLabel: debtor?.debtorLabel,
      ...(action === 'charge' ? { paid } : { amount: finalReturnAmount }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottle-deposits-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['bottle-deposits-debtors'] });
      queryClient.invalidateQueries({ queryKey: ['bottle-deposits-totals'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary', cashSessionId] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements', cashSessionId] });
      toast.success(action === 'charge' ? 'Envase registrado.' : 'Devolución registrada.');
      if (onClose) onClose();
      else resetForm();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const startReturnFor = (row: DebtorRow) => {
    setAction('return');
    setDebtor(row.isRegisteredCustomer
      ? { customerId: row.customerId!, displayName: row.debtorName }
      : { debtorLabel: row.debtorLabel!, displayName: row.debtorName });
    setProductId(row.productId);
    setQuantity(String(row.outstandingQty));
    setReturnAmountTouched(false);
  };

  const canSubmit = !!productId && Number(quantity) > 0 && (action === 'charge' || Number(quantity) <= (outstandingQty ?? 0));

  return (
    <div className="flex flex-col gap-3">
      <Segmented ariaLabel="Acción de envases" size="md" value={action} onChange={setAction}
        options={[['charge', 'Cobrar'], ['return', 'Devolver'], ['debtors', <span key="d" className="inline-flex items-center gap-1"><Users className="size-3.5" />Quién debe</span>]]} />

      {action === 'debtors' ? (
        <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
          {(debtors ?? []).length === 0 && (
            <p className="py-6 text-center text-table text-ink-muted">Nadie debe envases por ahora.</p>
          )}
          {(debtors ?? []).map(d => (
            <div key={`${d.customerId ?? d.debtorLabel}:${d.productId}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-table font-medium text-ink">{d.debtorName}</p>
                <p className="truncate text-meta text-ink-muted">
                  {d.productName} · debe {d.outstandingQty}
                  {d.outstandingAmount > 0 ? ` · a favor ${formatCurrency(d.outstandingAmount)}` : ' · sin dinero de por medio'}
                </p>
              </div>
              <Btn size="sm" onClick={() => startReturnFor(d)}>Devolver</Btn>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-table font-medium text-ink">¿A nombre de quién? (opcional)</span>
            <DebtorPicker
              debtor={debtor}
              onSelect={(d) => { setDebtor(d); setReturnAmountTouched(false); }}
              onClear={() => { setDebtor(null); setReturnAmountTouched(false); }}
            />
            {action === 'return' && !debtor && (
              <p className="text-meta text-ink-muted">Sin identificar, se descuenta del total pendiente del producto.</p>
            )}
          </div>

          <Field label="Producto (envase)" hint={action === 'charge' && (data ?? []).length === 0
            ? 'Ningún producto tiene garantía configurada. Agrégala editando el producto (campo "Garantía de envase").' : undefined}>
            <select className={fieldCls} value={productId} onChange={e => { setProductId(e.target.value); setQuantity('1'); setReturnAmountTouched(false); }}>
              <option value="">Seleccionar...</option>
              {(data ?? []).filter(p => action === 'charge' || (debtor ? true : p.outstandingQty > 0)).map(p => (
                <option key={p.productId} value={p.productId}>
                  {p.name} · S/{p.depositAmount.toFixed(2)}/u
                </option>
              ))}
            </select>
          </Field>

          {action === 'charge' && (
            <Segmented ariaLabel="¿Dejó garantía?" size="md" value={paid ? 'paid' : 'loan'} onChange={(v) => setPaid(v === 'paid')}
              options={[['paid', 'Dejó garantía'], ['loan', 'Presté sin garantía']]} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" hint={action === 'return' && productId ? `Pendiente: ${outstandingQty}` : undefined}>
              <input type="number" className={cn(fieldCls, 'text-right tabular-nums')} min={1} max={action === 'return' ? outstandingQty : undefined} step={1}
                value={quantity} onChange={e => { setQuantity(e.target.value); setReturnAmountTouched(false); }} />
            </Field>
            {(action === 'charge' ? paid : finalReturnAmount > 0) && (
              <Field label="Método">
                <select className={fieldCls} value={method} onChange={e => setMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            )}
          </div>

          {action === 'charge' && product && (
            <p className="text-right text-table font-semibold tabular-nums text-ink">
              {paid ? `A cobrar: ${formatCurrency(chargeAmount)}` : 'No se cobra nada, queda como préstamo'}
            </p>
          )}

          {action === 'return' && product && (
            <Field label="Monto a devolver (S/)" hint={`A favor: ${formatCurrency(outstandingAmount)}. Poné 0 si esos envases se prestaron sin cobrar.`}>
              <input type="number" className={cn(fieldCls, 'text-right tabular-nums')} min={0} max={outstandingAmount} step={0.10}
                value={returnAmountTouched ? returnAmount : suggestedReturnAmount.toFixed(2)}
                onChange={e => { setReturnAmount(e.target.value); setReturnAmountTouched(true); }} />
            </Field>
          )}

          <Field label="Notas (opcional)">
            <input className={fieldCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: ticket #123..." />
          </Field>

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            {onClose ? <Btn onClick={onClose}>Cancelar</Btn> : <Btn onClick={resetForm}>Limpiar</Btn>}
            <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
              Confirmar
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
