import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, ChevronDown, ChevronUp, HandCoins, Search, UserCheck, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/* Préstamos a personas (negocio familiar): el dinero sale al prestarse y vuelve
   al devolverse, sin ser gasto ni ingreso. Todo préstamo nuevo pertenece a un
   cliente registrado — así los préstamos repetidos a la misma persona quedan
   juntos y se ve cuánto debe en total. */

type Account = 'CASH' | 'YAPE' | 'PLIN';
const ACCOUNT_LABELS: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin' };

interface BorrowerLoan {
  id: string; amount: number; paidAmount: number; outstanding: number; account: string;
  status: 'OPEN' | 'PAID'; notes: string | null; loanDate: string;
}
interface Borrower {
  key: string; customerId: string | null; name: string; phone: string | null;
  totalLent: number; totalPaid: number; outstanding: number; openCount: number; lastLoanDate: string;
  loans: BorrowerLoan[];
}
interface CustomerHit {
  id: string; firstName: string; lastName: string | null; businessName: string | null;
  phone: string | null; taxId: string | null; isActive?: boolean;
}

const customerName = (c: CustomerHit) => c.businessName?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ');

function invalidateMoney(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
  queryClient.invalidateQueries({ queryKey: ['treasury-movements'] });
  queryClient.invalidateQueries({ queryKey: ['loans'] });
}

/* ─── Selector de cliente registrado ─────────────────────────────────────── */
function CustomerPicker({ value, onSelect, onClear, owedByCustomer }: {
  value: CustomerHit | null;
  onSelect: (c: CustomerHit) => void;
  onClear: () => void;
  owedByCustomer?: Map<string, number>;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const { data, isFetching } = useQuery({
    queryKey: ['loan-customer-search', debounced],
    queryFn: async () => (await api.get<{ data: CustomerHit[] }>(`/customers?search=${encodeURIComponent(debounced)}&limit=8`)).data.data,
    enabled: debounced.trim().length >= 1,
  });

  if (value) {
    const owed = owedByCustomer?.get(value.id) ?? 0;
    return (
      <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary truncate">{customerName(value)}</p>
            <p className="text-xs text-muted-foreground">
              {[value.taxId, value.phone].filter(Boolean).join(' · ') || 'Cliente registrado'}
              {owed > 0 && <span className="ml-1 font-medium text-destructive">· ya le debe {formatCurrency(owed)}</span>}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClear} aria-label="Cambiar cliente"
          className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Buscar cliente por nombre, DNI o teléfono..." autoFocus
        value={search} onChange={e => setSearch(e.target.value)} />
      {search.trim().length >= 1 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto divide-y rounded-md border bg-card shadow-lg">
          {isFetching && <p className="p-3 text-center text-xs text-muted-foreground">Buscando...</p>}
          {!isFetching && (data ?? []).length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              No hay ningún cliente así.{' '}
              <Link to="/customers" className="font-medium text-primary hover:underline">Regístralo primero en Clientes</Link>.
            </div>
          )}
          {(data ?? []).map(c => {
            const owed = owedByCustomer?.get(c.id) ?? 0;
            return (
              <button key={c.id} type="button" onClick={() => { onSelect(c); setSearch(''); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="truncate">
                  {customerName(c)}
                  <span className="ml-1 text-xs text-muted-foreground">{[c.taxId, c.phone].filter(Boolean).join(' · ')}</span>
                </span>
                {owed > 0 && <span className="shrink-0 text-xs font-medium text-destructive">debe {formatCurrency(owed)}</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Solo se presta a clientes registrados, para que cada persona tenga un único historial.
      </p>
    </div>
  );
}

/* ─── Nuevo préstamo ─────────────────────────────────────────────────────── */
function LoanModal({ initialCustomer, owedByCustomer, onClose }: {
  initialCustomer?: CustomerHit | null;
  owedByCustomer: Map<string, number>;
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerHit | null>(initialCustomer ?? null);
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<Account>('CASH');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post('/loans', {
      customerId: customer!.id, amount: parseFloat(amount), account, notes: notes || undefined,
    }),
    onSuccess: () => {
      invalidateMoney(queryClient);
      toast.success('Préstamo registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Nuevo Préstamo</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">¿A qué cliente le prestas?</label>
            <CustomerPicker value={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} owedByCustomer={owedByCustomer} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-bold" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Sale de</label>
              <select value={account} onChange={(e) => setAccount(e.target.value as Account)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notas (opcional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!customer || !amount || parseFloat(amount) <= 0}>
            Confirmar Préstamo
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Devolución: a UN préstamo, o "a la cuenta" del cliente (los más antiguos primero) ─── */
function PaymentModal({ target, onClose }: {
  target: { kind: 'loan'; loanId: string; name: string; outstanding: number; account: string }
    | { kind: 'customer'; customerId: string; name: string; outstanding: number; openCount: number };
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(target.outstanding.toFixed(2));
  const [account, setAccount] = useState<string>(target.kind === 'loan' ? target.account : 'CASH');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const body = { amount: parseFloat(amount), account, notes: notes || undefined };
      return target.kind === 'loan'
        ? api.post(`/loans/${target.loanId}/payments`, body)
        : api.post(`/loans/customer/${target.customerId}/payments`, body);
    },
    onSuccess: () => { invalidateMoney(queryClient); toast.success('Devolución registrada.'); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Registrar devolución</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {target.name} debe <span className="font-semibold text-foreground">{formatCurrency(target.outstanding)}</span>
            {target.kind === 'customer' && target.openCount > 1 && ` en ${target.openCount} préstamos`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.01} max={target.outstanding} value={amount}
                onChange={(e) => setAmount(e.target.value)} className="text-lg font-bold" autoFocus />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Entra a</label>
              <select value={account} onChange={(e) => setAccount(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {target.kind === 'customer' && target.openCount > 1 && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              El pago se aplica primero a los préstamos más antiguos hasta agotarse.
            </p>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notas (opcional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > target.outstanding + 0.01}>
            Confirmar Devolución
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Vincular los préstamos antiguos (solo nombre) de una persona a un cliente registrado ─── */
function LinkLoanModal({ group, onClose }: { group: Borrower; onClose: () => void }) {
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const queryClient = useQueryClient();
  const link = (customerId: string) => api.patch('/loans/link-group', { borrowerName: group.name, customerId });
  const onLinked = () => {
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['loan-customer-search'] });
    toast.success(`${group.loans.length} préstamo(s) vinculados al cliente.`);
    onClose();
  };
  const mutation = useMutation({
    mutationFn: () => link(customer!.id),
    onSuccess: onLinked,
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  // Atajo para migrar los préstamos antiguos: la persona todavía no existe como
  // cliente, se crea con el mismo nombre (y teléfono si lo había) y se vincula.
  const createAndLink = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { id: string } }>('/customers', {
        firstName: group.name.trim(), phone: group.phone || undefined,
      });
      return link(res.data.data.id);
    },
    onSuccess: onLinked,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Vincular a un cliente</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            «{group.name}» tiene {group.loans.length} préstamo(s) registrados solo con el nombre. Elige a qué cliente
            pertenecen para que queden juntos en su historial.
          </p>
          <CustomerPicker value={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} />
          <Button className="w-full" disabled={!customer} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Vincular al cliente elegido
          </Button>
          <div className="relative text-center">
            <span className="relative z-10 bg-card px-2 text-xs text-muted-foreground">¿Todavía no es cliente?</span>
            <span className="absolute inset-x-0 top-1/2 border-t" />
          </div>
          <Button variant="outline" className="w-full" loading={createAndLink.isPending} onClick={() => createAndLink.mutate()}>
            Crear cliente «{group.name.trim()}» y vincular
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Pestaña Préstamos ──────────────────────────────────────────────────── */
export function LoansPanel() {
  const [view, setView] = useState<'OPEN' | 'ALL'>('OPEN');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newLoanFor, setNewLoanFor] = useState<CustomerHit | null | undefined>(undefined); // undefined = cerrado
  const [paying, setPaying] = useState<Parameters<typeof PaymentModal>[0]['target'] | null>(null);
  const [linking, setLinking] = useState<Borrower | null>(null);

  const { data: borrowers, isLoading } = useQuery({
    queryKey: ['loans', 'by-borrower', view, debouncedSearch],
    queryFn: async () => (await api.get<{ data: Borrower[] }>(
      `/loans/by-borrower?status=${view}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`,
    )).data.data,
  });
  const { data: summary } = useQuery({
    queryKey: ['loans', 'summary'],
    queryFn: async () => (await api.get<{ data: { total: number; count: number; borrowers: number } }>('/loans/summary')).data.data,
  });

  const owedByCustomer = new Map<string, number>();
  for (const b of borrowers ?? []) if (b.customerId && b.outstanding > 0) owedByCustomer.set(b.customerId, b.outstanding);

  const startLoanFor = (b: Borrower) => {
    if (!b.customerId) return;
    const [firstName, ...rest] = b.name.split(' ');
    setNewLoanFor({ id: b.customerId, firstName, lastName: rest.join(' ') || null, businessName: null, phone: b.phone, taxId: null });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Dinero prestado a clientes — no es gasto al prestarlo ni ingreso al devolverse, solo sale y vuelve a entrar.
          </p>
          {summary && summary.total > 0 && (
            <p className="mt-1 text-sm">
              <span className="font-semibold text-destructive">{formatCurrency(summary.total)}</span>{' '}
              <span className="text-muted-foreground">en la calle · {summary.borrowers} persona(s)</span>
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => setNewLoanFor(null)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Nuevo Préstamo
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Buscar persona..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(['OPEN', 'ALL'] as const).map(v => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              view === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            {v === 'OPEN' ? 'Con deuda' : 'Todos'}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando...</p>
          ) : !borrowers || borrowers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {view === 'OPEN' ? 'Nadie te debe nada por préstamos.' : 'Sin préstamos registrados.'}
            </p>
          ) : borrowers.map((b) => {
            const isOpen = expanded === b.key;
            const legacy = !b.customerId;
            return (
              <div key={b.key} className="border-b last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : b.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={isOpen}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <HandCoins className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{b.name}</span>
                        {legacy && <Badge variant="warning">Sin cliente registrado</Badge>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.phone && <>{b.phone} · </>}
                        Prestado {formatCurrency(b.totalLent)} · Devuelto {formatCurrency(b.totalPaid)} · {b.loans.length} préstamo(s)
                        · último {formatDateTime(b.lastLoanDate).split(',')[0]}
                      </span>
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  <div className="flex items-center gap-2">
                    {b.outstanding > 0.005 ? (
                      <span className="text-sm font-semibold text-destructive">Debe {formatCurrency(b.outstanding)}</span>
                    ) : (
                      <Badge variant="success">Al día</Badge>
                    )}
                    {legacy && (
                      <Button size="sm" onClick={() => setLinking(b)}>
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />Vincular a cliente
                      </Button>
                    )}
                    {!legacy && (
                      <Button variant="outline" size="sm" onClick={() => startLoanFor(b)}>Prestar más</Button>
                    )}
                    {!legacy && b.outstanding > 0.005 && (
                      <Button size="sm" onClick={() => setPaying({ kind: 'customer', customerId: b.customerId!, name: b.name, outstanding: b.outstanding, openCount: b.openCount })}>
                        Registrar devolución
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="bg-muted/30 px-4 pb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 font-semibold">Fecha</th>
                          <th className="py-2 text-right font-semibold">Prestado</th>
                          <th className="py-2 text-right font-semibold">Devuelto</th>
                          <th className="py-2 text-right font-semibold">Debe</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {b.loans.map(l => (
                          <tr key={l.id}>
                            <td className="py-2">
                              {formatDateTime(l.loanDate)}
                              <span className="ml-1 text-xs text-muted-foreground">({ACCOUNT_LABELS[l.account] ?? l.account})</span>
                              {l.notes && <span className="block text-xs text-muted-foreground">{l.notes}</span>}
                            </td>
                            <td className="py-2 text-right tabular-nums">{formatCurrency(l.amount)}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(l.paidAmount)}</td>
                            <td className="py-2 text-right tabular-nums font-medium">
                              {l.status === 'PAID' ? <Badge variant="success">Pagado</Badge> : formatCurrency(l.outstanding)}
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {legacy && l.status === 'OPEN' && (
                                <Button variant="outline" size="sm"
                                  onClick={() => setPaying({ kind: 'loan', loanId: l.id, name: b.name, outstanding: l.outstanding, account: l.account })}>
                                  Devolución
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {newLoanFor !== undefined && (
        <LoanModal initialCustomer={newLoanFor} owedByCustomer={owedByCustomer} onClose={() => setNewLoanFor(undefined)} />
      )}
      {paying && <PaymentModal target={paying} onClose={() => setPaying(null)} />}
      {linking && <LinkLoanModal group={linking} onClose={() => setLinking(null)} />}
    </div>
  );
}
