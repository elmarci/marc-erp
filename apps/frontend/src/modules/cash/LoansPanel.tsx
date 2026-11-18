import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, ChevronDown, ChevronRight, HandCoins, Search, UserCheck, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, EmptyState, Field, Modal, Panel, Segmented, StatCard, StatGrid, StatusBadge, fieldCls, tableCls, tdCls, thCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/* Préstamos a personas (negocio familiar): el dinero sale al prestarse y vuelve
   al devolverse, sin ser gasto ni ingreso. Todo préstamo nuevo pertenece a un
   cliente registrado — así los préstamos repetidos a la misma persona quedan
   juntos y se ve cuánto debe en total. */

type Account = 'CASH' | 'YAPE' | 'PLIN';
const ACCOUNT_LABELS: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin' };
const moneyCls = cn(fieldCls, 'text-right tabular-nums');

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

function AccountSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
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
      <div className="flex items-center justify-between gap-2 rounded-ctl bg-brand-soft px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--brand)/0.4)]">
        <div className="flex min-w-0 items-center gap-2">
          <UserCheck className="size-4 shrink-0 text-ink" />
          <div className="min-w-0">
            <p className="truncate text-table font-medium text-ink">{customerName(value)}</p>
            <p className="text-meta text-ink-muted">
              {[value.taxId, value.phone].filter(Boolean).join(' · ') || 'Cliente registrado'}
              {owed > 0 && <span className="ml-1 font-medium text-bad-ink">· ya le debe {formatCurrency(owed)}</span>}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClear} aria-label="Cambiar cliente"
          className="tap grid size-7 shrink-0 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink"><X className="size-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input className={cn(fieldCls, 'pl-8')} placeholder="Buscar cliente por nombre, DNI o teléfono…" autoFocus
        aria-label="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
      {search.trim().length >= 1 && (
        <div className="mt-1 max-h-56 w-full divide-y divide-line overflow-y-auto rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
          {isFetching && <p className="p-3 text-center text-meta text-ink-muted">Buscando…</p>}
          {!isFetching && (data ?? []).length === 0 && (
            <div className="p-3 text-center text-meta text-ink-muted">
              No hay ningún cliente así.{' '}
              <Link to="/customers" className="font-medium text-ink underline">Regístralo primero en Clientes</Link>.
            </div>
          )}
          {(data ?? []).map((c) => {
            const owed = owedByCustomer?.get(c.id) ?? 0;
            return (
              <button key={c.id} type="button" onClick={() => { onSelect(c); setSearch(''); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-table hover:bg-surface-2">
                <span className="truncate text-ink">
                  {customerName(c)}
                  <span className="ml-1 text-meta text-ink-muted">{[c.taxId, c.phone].filter(Boolean).join(' · ')}</span>
                </span>
                {owed > 0 && <span className="shrink-0 text-meta font-medium text-bad-ink">debe {formatCurrency(owed)}</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-meta text-ink-muted">Solo se presta a clientes registrados, para que cada persona tenga un único historial.</p>
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
    mutationFn: () => api.post('/loans', { customerId: customer!.id, amount: parseFloat(amount), account, notes: notes || undefined }),
    onSuccess: () => { invalidateMoney(queryClient); toast.success('Préstamo registrado.'); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Nuevo préstamo"
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending}
        disabled={!customer || !(parseFloat(amount) > 0)} onClick={() => mutation.mutate()}>Confirmar préstamo</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">¿A qué cliente le prestas?</span>
          <CustomerPicker value={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} owedByCustomer={owedByCustomer} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (S/)"><input type="number" inputMode="decimal" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} className={moneyCls} /></Field>
          <Field label="Sale de"><AccountSelect value={account} onChange={(v) => setAccount(v as Account)} /></Field>
        </div>
        <Field label="Notas (opcional)"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* ─── Devolución: a UN préstamo, o "a la cuenta" del cliente (los más antiguos primero) ─── */
type PayTarget =
  | { kind: 'loan'; loanId: string; name: string; outstanding: number; account: string }
  | { kind: 'customer'; customerId: string; name: string; outstanding: number; openCount: number };

function PaymentModal({ target, onClose }: { target: PayTarget; onClose: () => void }) {
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
  const value = parseFloat(amount);
  const over = value > target.outstanding + 0.01;

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Registrar devolución"
      description={<>{target.name} debe <span className="font-medium text-ink">{formatCurrency(target.outstanding)}</span>{target.kind === 'customer' && target.openCount > 1 && ` en ${target.openCount} préstamos`}</>}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending}
        disabled={!(value > 0) || over} onClick={() => mutation.mutate()}>Confirmar devolución</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (S/)" error={over ? 'Es más de lo que debe.' : undefined}>
            <input type="number" inputMode="decimal" min={0.01} step={0.01} max={target.outstanding} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={moneyCls} />
          </Field>
          <Field label="Entra a"><AccountSelect value={account} onChange={setAccount} /></Field>
        </div>
        {target.kind === 'customer' && target.openCount > 1 && (
          <p className="rounded-ctl bg-surface-2 px-3 py-2 text-meta text-ink-muted">El pago se aplica primero a los préstamos más antiguos hasta agotarse.</p>
        )}
        <Field label="Notas (opcional)"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
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
      const res = await api.post<{ data: { id: string } }>('/customers', { firstName: group.name.trim(), phone: group.phone || undefined });
      return link(res.data.data.id);
    },
    onSuccess: onLinked,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Vincular a un cliente"
      description={`«${group.name}» tiene ${group.loans.length} préstamo(s) registrados solo con el nombre. Elige a qué cliente pertenecen para que queden juntos en su historial.`}>
      <div className="flex flex-col gap-4">
        <CustomerPicker value={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} />
        <Btn variant="primary" disabled={!customer} loading={mutation.isPending} onClick={() => mutation.mutate()}>Vincular al cliente elegido</Btn>
        <div className="relative text-center">
          <span className="relative z-10 bg-surface px-2 text-meta text-ink-muted">¿Todavía no es cliente?</span>
          <span className="absolute inset-x-0 top-1/2 border-t border-line" />
        </div>
        <Btn loading={createAndLink.isPending} onClick={() => createAndLink.mutate()}>Crear cliente «{group.name.trim()}» y vincular</Btn>
      </div>
    </Modal>
  );
}

/* ─── Pestaña Préstamos ──────────────────────────────────────────────────── */
export function LoansPanel() {
  const [view, setView] = useState<'OPEN' | 'ALL'>('OPEN');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newLoanFor, setNewLoanFor] = useState<CustomerHit | null | undefined>(undefined); // undefined = cerrado
  const [paying, setPaying] = useState<PayTarget | null>(null);
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
    <div className="flex flex-col gap-5">
      <StatGrid cols={3}>
        <StatCard label="Prestado y por cobrar" value={<span className={cn((summary?.total ?? 0) > 0.005 && 'text-bad-ink')}>{summary ? formatCurrency(summary.total) : '…'}</span>}
          hint="No es gasto al prestar ni ingreso al cobrar" />
        <StatCard label="Personas que deben" value={summary ? String(summary.borrowers) : '…'} />
        <StatCard label="Préstamos abiertos" value={summary ? String(summary.count) : '…'} />
      </StatGrid>

      <Panel title="Préstamos a clientes"
        actions={<Btn size="sm" variant="primary" onClick={() => setNewLoanFor(null)}><Plus />Nuevo préstamo</Btn>}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <div className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input className={cn(fieldCls, 'h-8 pl-8')} placeholder="Buscar persona" aria-label="Buscar persona" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented value={view} onChange={setView} ariaLabel="Mostrar" options={[['OPEN', 'Con deuda'], ['ALL', 'Todos']]} />
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando…</div>
        ) : !borrowers || borrowers.length === 0 ? (
          <EmptyState icon={HandCoins} title={view === 'OPEN' ? 'Nadie te debe nada por préstamos.' : 'Sin préstamos registrados.'} />
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {borrowers.map((b) => {
              const isOpen = expanded === b.key;
              const legacy = !b.customerId;
              return (
                <div key={b.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-2">
                    <button type="button" onClick={() => setExpanded(isOpen ? null : b.key)} aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-ctl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                      {isOpen ? <ChevronDown className="size-4 shrink-0 text-ink-muted" /> : <ChevronRight className="size-4 shrink-0 text-ink-muted" />}
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-table font-medium text-ink">{b.name}</span>
                          {legacy && <StatusBadge tone="warn">Sin cliente registrado</StatusBadge>}
                        </span>
                        <span className="block text-meta text-ink-muted">
                          {b.phone && <>{b.phone} · </>}
                          Prestado {formatCurrency(b.totalLent)} · Devuelto {formatCurrency(b.totalPaid)} · {b.loans.length} préstamo(s)
                          {' '}· último {formatDateTime(b.lastLoanDate).split(',')[0]}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {b.outstanding > 0.005
                        ? <span className="text-table font-medium tabular-nums text-bad-ink">Debe {formatCurrency(b.outstanding)}</span>
                        : <StatusBadge tone="ok">Al día</StatusBadge>}
                      {legacy && <Btn size="sm" onClick={() => setLinking(b)}><Link2 />Vincular a cliente</Btn>}
                      {!legacy && <Btn size="sm" variant="ghost" onClick={() => startLoanFor(b)}>Prestar más</Btn>}
                      {!legacy && b.outstanding > 0.005 && (
                        <Btn size="sm" onClick={() => setPaying({ kind: 'customer', customerId: b.customerId!, name: b.name, outstanding: b.outstanding, openCount: b.openCount })}>
                          Registrar devolución
                        </Btn>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="overflow-x-auto bg-surface-2 px-3 pb-3 pl-9">
                      <table className={tableCls}>
                        <thead><tr>
                          <th className={thCls}>Fecha</th>
                          <th className={cn(thCls, 'text-right')}>Prestado</th>
                          <th className={cn(thCls, 'text-right')}>Devuelto</th>
                          <th className={cn(thCls, 'text-right')}>Debe</th>
                          <th className={thCls}><span className="sr-only">Acciones</span></th>
                        </tr></thead>
                        <tbody className="bg-surface">
                          {b.loans.map((l) => (
                            <tr key={l.id}>
                              <td className={cn(tdCls, 'py-1.5')}>
                                {formatDateTime(l.loanDate)}
                                <span className="ml-1 text-meta text-ink-muted">({ACCOUNT_LABELS[l.account] ?? l.account})</span>
                                {l.notes && <span className="block text-meta text-ink-muted">{l.notes}</span>}
                              </td>
                              <td className={cn(tdCls, 'text-right tabular-nums')}>{formatCurrency(l.amount)}</td>
                              <td className={cn(tdCls, 'text-right tabular-nums text-ink-muted')}>{formatCurrency(l.paidAmount)}</td>
                              <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>
                                {l.status === 'PAID' ? <StatusBadge tone="ok">Pagado</StatusBadge> : formatCurrency(l.outstanding)}
                              </td>
                              <td className={cn(tdCls, 'whitespace-nowrap text-right')}>
                                {legacy && l.status === 'OPEN' && (
                                  <Btn size="sm" onClick={() => setPaying({ kind: 'loan', loanId: l.id, name: b.name, outstanding: l.outstanding, account: l.account })}>Devolución</Btn>
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
          </div>
        )}
      </Panel>

      {newLoanFor !== undefined && (
        <LoanModal initialCustomer={newLoanFor} owedByCustomer={owedByCustomer} onClose={() => setNewLoanFor(undefined)} />
      )}
      {paying && <PaymentModal target={paying} onClose={() => setPaying(null)} />}
      {linking && <LinkLoanModal group={linking} onClose={() => setLinking(null)} />}
    </div>
  );
}
