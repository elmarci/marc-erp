import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  if (debtor) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2">
        <span className="text-sm font-medium text-primary">
          {debtor.displayName}{debtor.customerId ? '' : ' (sin registrar)'}
        </span>
        <button onClick={onClear} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  if (mode === 'search') {
    return (
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente por nombre, DNI, teléfono..."
            value={search} onChange={e => { setSearch(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        </div>
        {open && search.length >= 1 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto divide-y rounded-md border bg-card shadow-lg">
            {(data ?? []).length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Sin resultados</p>}
            {(data ?? []).map(c => (
              <button key={c.id} type="button"
                onClick={() => { onSelect({ customerId: c.id, displayName: `${c.firstName} ${c.lastName ?? ''}`.trim() }); setSearch(''); setOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                {c.firstName} {c.lastName} {c.phone ? <span className="text-xs text-muted-foreground">· {c.phone}</span> : null}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setMode('label')} className="mt-1 text-xs text-primary hover:underline">
          Prefiero sólo poner un nombre
        </button>
      </div>
    );
  }

  return (
    <div>
      <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nombre, apodo o teléfono (opcional)"
        onKeyDown={e => { if (e.key === 'Enter' && label.trim()) onSelect({ debtorLabel: label.trim(), displayName: label.trim() }); }} />
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={() => setMode('search')} className="text-xs text-primary hover:underline">
          Buscar cliente registrado
        </button>
        {label.trim() && (
          <button type="button" onClick={() => onSelect({ debtorLabel: label.trim(), displayName: label.trim() })}
            className="text-xs font-medium text-primary hover:underline">
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" variant={action === 'charge' ? 'default' : 'outline'}
          onClick={() => setAction('charge')}>Cobrar</Button>
        <Button size="sm" className="flex-1" variant={action === 'return' ? 'success' : 'outline'}
          onClick={() => setAction('return')}>Devolver</Button>
        <Button size="sm" className="flex-1" variant={action === 'debtors' ? 'default' : 'outline'}
          onClick={() => setAction('debtors')}><Users className="mr-1 h-3.5 w-3.5" />Quién debe</Button>
      </div>

      {action === 'debtors' ? (
        <div className="divide-y border rounded-lg max-h-72 overflow-y-auto">
          {(debtors ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nadie debe envases por ahora.</p>
          )}
          {(debtors ?? []).map(d => (
            <div key={`${d.customerId ?? d.debtorLabel}:${d.productId}`} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.debtorName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {d.productName} · debe {d.outstandingQty}
                  {d.outstandingAmount > 0 ? ` · a favor ${formatCurrency(d.outstandingAmount)}` : ' · sin dinero de por medio'}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => startReturnFor(d)}>Devolver</Button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">¿A nombre de quién? (opcional)</label>
            <DebtorPicker
              debtor={debtor}
              onSelect={(d) => { setDebtor(d); setReturnAmountTouched(false); }}
              onClear={() => { setDebtor(null); setReturnAmountTouched(false); }}
            />
            {action === 'return' && !debtor && (
              <p className="mt-1 text-xs text-muted-foreground">Sin identificar, se descuenta del total pendiente del producto.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Producto (envase)</label>
            <select value={productId} onChange={e => { setProductId(e.target.value); setQuantity('1'); setReturnAmountTouched(false); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar...</option>
              {(data ?? []).filter(p => action === 'charge' || (debtor ? true : p.outstandingQty > 0)).map(p => (
                <option key={p.productId} value={p.productId}>
                  {p.name} — S/{p.depositAmount.toFixed(2)}/u
                </option>
              ))}
            </select>
            {action === 'charge' && (data ?? []).length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ningún producto tiene garantía configurada — agrégala editando el producto (campo "Garantía de envase").
              </p>
            )}
          </div>

          {action === 'charge' && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" variant={paid ? 'default' : 'outline'} onClick={() => setPaid(true)}>
                Dejó garantía
              </Button>
              <Button size="sm" className="flex-1" variant={!paid ? 'default' : 'outline'} onClick={() => setPaid(false)}>
                Presté sin garantía
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Cantidad</label>
              <Input type="number" min={1} max={action === 'return' ? outstandingQty : undefined} step={1}
                value={quantity} onChange={e => { setQuantity(e.target.value); setReturnAmountTouched(false); }} />
              {action === 'return' && productId && (
                <p className="mt-1 text-xs text-muted-foreground">Pendiente: {outstandingQty}</p>
              )}
            </div>
            {(action === 'charge' ? paid : finalReturnAmount > 0) && (
              <div>
                <label className="mb-1 block text-sm font-medium">Método</label>
                <select value={method} onChange={e => setMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
          </div>

          {action === 'charge' && product && (
            <p className="text-sm text-right font-bold">
              {paid ? `A cobrar: ${formatCurrency(chargeAmount)}` : 'No se cobra nada — queda como préstamo'}
            </p>
          )}

          {action === 'return' && product && (
            <div>
              <label className="mb-1 block text-sm font-medium">Monto a devolver (S/)</label>
              <Input type="number" min={0} max={outstandingAmount} step={0.10}
                value={returnAmountTouched ? returnAmount : suggestedReturnAmount.toFixed(2)}
                onChange={e => { setReturnAmount(e.target.value); setReturnAmountTouched(true); }} />
              <p className="mt-1 text-xs text-muted-foreground">
                A favor: {formatCurrency(outstandingAmount)} — poné 0 si esos envases se prestaron sin cobrar.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: ticket #123..." />
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t">
            {onClose && <Button variant="outline" onClick={onClose}>Cancelar</Button>}
            {!onClose && <Button variant="outline" onClick={resetForm}>Limpiar</Button>}
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
              Confirmar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
