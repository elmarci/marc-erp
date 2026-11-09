import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus, Minus, Repeat, Search, X, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, getErrorMessage } from '@/services/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';

// Saldo prepago (monedero) de clientes: cargar, descontar, recarga mensual
// automática, historial y recargas por Yape hechas desde la tienda online.

interface Recurring { amount: number; dayOfMonth: number; isActive: boolean; lastPeriod: string | null }
interface WalletRow {
  id: string; firstName: string; lastName: string | null; businessName: string | null
  phone: string | null; taxId: string | null; walletBalance: number; walletRecurring: Recurring | null
}
interface Movement {
  id: string; type: string; origin: string | null; amount: number; balanceAfter: number
  method: string | null; description: string; createdAt: string; userName: string | null
}
interface WalletDetail extends Omit<WalletRow, 'taxId'> { hasPin: boolean; movements: Movement[] }
interface Topup {
  id: string; amount: number; method: string; operationNumber: string; status: string; createdAt: string
  rejectReason: string | null
  customer: { id: string; firstName: string; lastName: string | null; businessName: string | null; phone: string | null }
}
interface CustomerHit { id: string; firstName: string; lastName: string | null; businessName: string | null; phone: string | null; taxId: string | null }

const nameOf = (c: { firstName: string; lastName: string | null; businessName: string | null }) =>
  `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.businessName || 'Cliente';

const TYPE_LABEL: Record<string, string> = { CARGA: 'Carga', CONSUMO: 'Compra', DEVOLUCION: 'Devolución', AJUSTE: 'Descuento' };
const ORIGIN_LABEL: Record<string, string> = { PAGO: 'pagada', BENEFICIO: 'beneficio', MENSUAL: 'mensual', ONLINE: 'Yape online' };
const METHOD_LABEL: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TRANSFER: 'Transferencia', DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito' };

export function WalletsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Saldos de clientes</h1>
        <p className="text-sm text-muted-foreground">Saldo prepago que el cliente usa en la tienda online o en caja.</p>
      </div>
      <PendingTopups />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className={cn(selectedId && 'hidden lg:block')}>
          <WalletList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className={cn(!selectedId && 'hidden lg:block')}>
          {selectedId
            ? <WalletDetailPanel customerId={selectedId} onBack={() => setSelectedId(null)} />
            : (
              <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
                <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
                Elige un cliente para cargar saldo o ver sus movimientos.
              </CardContent></Card>
            )}
        </div>
      </div>
    </div>
  );
}

// ─── Recargas por Yape pendientes de verificar ─────────────────────────────
function PendingTopups() {
  const qc = useQueryClient();
  const { data: topups = [] } = useQuery({
    queryKey: ['wallet-topups', 'PENDING'],
    queryFn: async () => (await api.get<{ data: Topup[] }>('/wallet/topups', { params: { status: 'PENDING' } })).data.data,
    refetchInterval: 60000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wallet-topups'] });
    qc.invalidateQueries({ queryKey: ['wallets'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/wallet/topups/${id}/approve`),
    onSuccess: () => { toast.success('Recarga aprobada y acreditada'); refresh(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/wallet/topups/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Recarga rechazada'); refresh(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (topups.length === 0) return null;
  return (
    <Card className="border-warning/40">
      <CardContent className="p-4 sm:p-5">
        <p className="font-semibold">Recargas por verificar ({topups.length})</p>
        <p className="mb-3 text-xs text-muted-foreground">Revisa en tu Yape que el pago con ese N° de operación haya llegado antes de aprobar.</p>
        <div className="divide-y">
          {topups.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{nameOf(t.customer)} <span className="text-sm text-muted-foreground">{t.customer.phone}</span></p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(t.amount)} por {METHOD_LABEL[t.method] ?? t.method} · op. <span className="font-mono text-foreground">{t.operationNumber}</span> · {formatDateTime(t.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={reject.isPending}
                  onClick={() => {
                    const reason = prompt('¿Por qué se rechaza? (lo verá el cliente)', 'No encontramos el pago');
                    if (reason && reason.trim().length >= 3) reject.mutate({ id: t.id, reason: reason.trim() });
                  }}>
                  <X className="mr-1 h-4 w-4" />Rechazar
                </Button>
                <Button size="sm" loading={approve.isPending && approve.variables === t.id}
                  onClick={() => { if (confirm(`¿Confirmas que recibiste ${formatCurrency(t.amount)} con la operación ${t.operationNumber}?`)) approve.mutate(t.id); }}>
                  <Check className="mr-1 h-4 w-4" />Aprobar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lista: clientes con saldo + buscador para cualquier cliente ───────────
function WalletList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const { data: wallets = [], isLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => (await api.get<{ data: WalletRow[] }>('/wallet/customers')).data.data,
  });
  const { data: hits = [] } = useQuery({
    queryKey: ['wallet-customer-search', debounced],
    queryFn: async () => (await api.get<{ data: CustomerHit[] }>('/customers', { params: { search: debounced, limit: 8 } })).data.data,
    enabled: debounced.trim().length >= 2,
  });
  const total = wallets.reduce((s, w) => s + w.walletBalance, 0);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente por nombre, DNI o teléfono" className="pl-9" />
          </div>
          {debounced.trim().length >= 2 && (
            <div className="mt-2 divide-y rounded-md border">
              {hits.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>}
              {hits.map((c) => (
                <button key={c.id} onClick={() => { onSelect(c.id); setSearch(''); }}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-accent">
                  <span className="truncate font-medium">{nameOf(c)}</span>
                  <span className="shrink-0 text-muted-foreground">{c.taxId ?? c.phone ?? ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          <span>{wallets.length} {wallets.length === 1 ? 'cliente' : 'clientes'} con saldo</span>
          <span>Total en saldos: <b className="text-foreground">{formatCurrency(total)}</b></span>
        </div>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
        {!isLoading && wallets.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Aún nadie tiene saldo. Busca un cliente arriba para cargarle.</p>
        )}
        <div className="divide-y">
          {wallets.map((w) => (
            <button key={w.id} onClick={() => onSelect(w.id)}
              className={cn('flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent', selectedId === w.id && 'bg-accent')}>
              <div className="min-w-0">
                <p className="truncate font-medium">{nameOf(w)}</p>
                <p className="text-xs text-muted-foreground">
                  {w.phone ?? w.taxId ?? ''}
                  {w.walletRecurring?.isActive && <> · +{formatCurrency(w.walletRecurring.amount)} el día {w.walletRecurring.dayOfMonth}</>}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(w.walletBalance)}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detalle de un cliente ─────────────────────────────────────────────────
function WalletDetailPanel({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const [mode, setMode] = useState<'charge' | 'debit' | 'monthly' | null>(null);
  const { data: w } = useQuery({
    queryKey: ['wallet', customerId],
    queryFn: async () => (await api.get<{ data: WalletDetail }>(`/wallet/customers/${customerId}`)).data.data,
  });
  useEffect(() => { setMode(null); }, [customerId]);
  if (!w) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando...</CardContent></Card>;

  const rec = w.walletRecurring;
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground lg:hidden">
          <ArrowLeft className="h-4 w-4" />Volver
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{nameOf(w)}</p>
            <p className="text-sm text-muted-foreground">{w.phone ?? ''}{w.hasPin ? ' · tiene PIN' : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className="text-3xl font-bold tabular-nums">{formatCurrency(w.walletBalance)}</p>
          </div>
        </div>
        {rec && (
          <p className="mt-2 text-sm">
            <Badge variant={rec.isActive ? 'info' : 'secondary'}>{rec.isActive ? 'Recarga mensual activa' : 'Recarga mensual pausada'}</Badge>
            <span className="ml-2 text-muted-foreground">{formatCurrency(rec.amount)} el día {rec.dayOfMonth} de cada mes</span>
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant={mode === 'charge' ? 'default' : 'outline'} onClick={() => setMode(mode === 'charge' ? null : 'charge')}>
            <Plus className="mr-1 h-4 w-4" />Cargar
          </Button>
          <Button variant={mode === 'debit' ? 'default' : 'outline'} onClick={() => setMode(mode === 'debit' ? null : 'debit')} disabled={w.walletBalance <= 0}>
            <Minus className="mr-1 h-4 w-4" />Descontar
          </Button>
          <Button variant={mode === 'monthly' ? 'default' : 'outline'} onClick={() => setMode(mode === 'monthly' ? null : 'monthly')}>
            <Repeat className="mr-1 h-4 w-4" />Mensual
          </Button>
        </div>

        {mode === 'charge' && <ChargeForm customerId={customerId} onDone={() => setMode(null)} />}
        {mode === 'debit' && <DebitForm customerId={customerId} max={w.walletBalance} onDone={() => setMode(null)} />}
        {mode === 'monthly' && <MonthlyForm customerId={customerId} current={rec} onDone={() => setMode(null)} />}

        <p className="mb-1 mt-6 text-sm font-semibold">Movimientos</p>
        {w.movements.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <div className="divide-y">
            {w.movements.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{TYPE_LABEL[m.type] ?? m.type}{m.origin ? ` ${ORIGIN_LABEL[m.origin] ?? ''}` : ''}</span>
                    <span className="text-muted-foreground"> · {m.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}{m.userName ? ` · ${m.userName}` : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('text-sm font-semibold tabular-nums', m.amount > 0 ? 'text-success' : '')}>
                    {m.amount > 0 ? '+' : '−'}{formatCurrency(Math.abs(m.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(m.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useWalletRefresh(customerId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['wallet', customerId] });
    qc.invalidateQueries({ queryKey: ['wallets'] });
  };
}

function ChargeForm({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const refresh = useWalletRefresh(customerId);
  const [amount, setAmount] = useState('');
  const [origin, setOrigin] = useState<'BENEFICIO' | 'PAGO'>('PAGO');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const { data: openSession } = useQuery({
    queryKey: ['cash-open-session'],
    queryFn: async () => (await api.get<{ data: Array<{ id: string }> }>('/cash/sessions', { params: { status: 'OPEN', limit: 1 } })).data.data[0] ?? null,
  });
  const m = useMutation({
    mutationFn: () => api.post(`/wallet/customers/${customerId}/charge`, {
      amount: Number(amount), origin,
      method: origin === 'PAGO' ? method : undefined,
      cashSessionId: origin === 'PAGO' && method === 'CASH' ? openSession?.id : undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => { toast.success('Saldo cargado'); refresh(); onDone(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <div className="mt-4 space-y-3 rounded-lg bg-muted/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Monto (S/)</label>
          <Input type="number" inputMode="decimal" min={0.1} step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={origin} onChange={(e) => setOrigin(e.target.value as 'PAGO' | 'BENEFICIO')}>
            <option value="PAGO">El cliente pagó la recarga</option>
            <option value="BENEFICIO">Beneficio (no entra dinero)</option>
          </Select>
        </div>
        {origin === 'PAGO' && (
          <div>
            <label className="text-xs text-muted-foreground">Pagó con</label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD'].map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}
            </Select>
          </div>
        )}
        <div className={cn(origin !== 'PAGO' && 'sm:col-span-2')}>
          <label className="text-xs text-muted-foreground">Nota (opcional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={origin === 'BENEFICIO' ? 'Ej. Saldo de noviembre' : ''} maxLength={200} />
        </div>
      </div>
      {origin === 'PAGO' && (
        <p className="text-xs text-muted-foreground">
          {method === 'CASH'
            ? (openSession ? 'El efectivo entra a la caja abierta y cuadra en su cierre.' : 'No hay caja abierta: el efectivo va directo a Caja General.')
            : 'El dinero entra a Caja General en la cuenta de ese método.'}
        </p>
      )}
      <Button className="w-full" disabled={!(Number(amount) > 0)} loading={m.isPending} onClick={() => m.mutate()}>
        Cargar {Number(amount) > 0 ? formatCurrency(Number(amount)) : ''}
      </Button>
    </div>
  );
}

function DebitForm({ customerId, max, onDone }: { customerId: string; max: number; onDone: () => void }) {
  const refresh = useWalletRefresh(customerId);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/wallet/customers/${customerId}/debit`, { amount: Number(amount), reason: reason.trim() }),
    onSuccess: () => { toast.success('Saldo descontado'); refresh(); onDone(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <div className="mt-4 space-y-3 rounded-lg bg-muted/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Monto (máx. {formatCurrency(max)})</label>
          <Input type="number" inputMode="decimal" min={0.1} max={max} step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Motivo (obligatorio)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Corrección de carga duplicada" maxLength={200} />
        </div>
      </div>
      <Button variant="destructive" className="w-full" disabled={!(Number(amount) > 0) || Number(amount) > max || reason.trim().length < 3}
        loading={m.isPending} onClick={() => m.mutate()}>
        Descontar {Number(amount) > 0 ? formatCurrency(Number(amount)) : ''}
      </Button>
    </div>
  );
}

function MonthlyForm({ customerId, current, onDone }: { customerId: string; current: Recurring | null; onDone: () => void }) {
  const refresh = useWalletRefresh(customerId);
  const [amount, setAmount] = useState(current ? String(current.amount) : '100');
  const [day, setDay] = useState(String(current?.dayOfMonth ?? 1));
  const [active, setActive] = useState(current?.isActive ?? true);
  const save = useMutation({
    mutationFn: () => api.put(`/wallet/customers/${customerId}/recurring`, { amount: Number(amount), dayOfMonth: Number(day), isActive: active }),
    onSuccess: () => { toast.success('Recarga mensual guardada'); refresh(); onDone(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/wallet/customers/${customerId}/recurring`),
    onSuccess: () => { toast.success('Recarga mensual eliminada'); refresh(); onDone(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <div className="mt-4 space-y-3 rounded-lg bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">
        Cada mes, ese día, se suma el monto al saldo como beneficio (lo que no gaste se acumula).
        {!current && ' Si el día de este mes ya pasó, la primera recarga será el próximo mes: lo de este mes cárgalo a mano.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Monto (S/)</label>
          <Input type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Día del mes</label>
          <Select value={day} onChange={(e) => setDay(e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />Activa
        </label>
      </div>
      <div className="flex gap-2">
        {current && (
          <Button variant="outline" loading={remove.isPending} onClick={() => { if (confirm('¿Quitar la recarga mensual? El saldo actual no cambia.')) remove.mutate(); }}>
            Quitar
          </Button>
        )}
        <Button className="flex-1" disabled={!(Number(amount) > 0)} loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button>
      </div>
    </div>
  );
}
