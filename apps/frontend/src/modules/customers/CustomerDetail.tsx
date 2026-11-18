// Ficha de un cliente: datos, crédito, compras, reporte de consumos y pagos
// de deuda. Desde aquí se cobra la deuda y se edita el cliente.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, DollarSign, ShoppingCart, Star } from 'lucide-react';
import { Btn, Pagination, Segmented, Sheet, StatusBadge, fieldCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { DebtPaymentModal } from './CustomerForms';
import {
  AUTH_PROVIDER_LABELS, DEBT_METHOD_LABELS, STATUS_LABELS, TYPE_LABELS, fullName, hasStoreAccount,
  type Customer, type CustomerSale,
} from './types';

/* ─── Reporte de consumos ───────────────────────────────────────────────────
   Mismo cálculo que el cliente ve en la tienda online, para cualquier
   cliente, tenga o no cuenta en la tienda. */
interface ConsumptionItem { productId: string; productName: string; quantity: number; spent: number; timesPurchased: number }

// yyyy-mm-dd en hora local para <input type="date"> (evita que "hoy" en UTC
// se muestre como "ayer" en Perú).
function toDateInput(d: Date): string {
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function ConsumptionReport({ customerId }: { customerId: string }) {
  const [from, setFrom] = useState(toDateInput(new Date(Date.now() - 90 * 86400000)));
  const [to, setTo] = useState(toDateInput(new Date()));
  const { data, isLoading } = useQuery({
    queryKey: ['customer-consumption-report', customerId, from, to],
    queryFn: async () => (await api.get<{ data: { items: ConsumptionItem[]; totalUnits: number; totalSpent: number } }>(
      `/customers/${customerId}/consumption-report`, { params: { from, to: `${to}T23:59:59` } },
    )).data.data,
  });
  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input type="date" aria-label="Desde" className={cn(fieldCls, 'h-8')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-meta text-ink-muted">a</span>
        <input type="date" aria-label="Hasta" className={cn(fieldCls, 'h-8')} value={to} min={from} max={toDateInput(new Date())} onChange={(e) => setTo(e.target.value)} />
      </div>
      {isLoading ? <p className="py-6 text-center text-table text-ink-muted">Calculando…</p>
        : items.length === 0 ? <p className="py-6 text-center text-table text-ink-muted">Sin compras registradas en ese rango.</p>
        : (<>
          <div className="flex justify-between text-meta text-ink-muted">
            <span>{items.length} producto{items.length !== 1 ? 's' : ''} distintos</span>
            <span className="tabular-nums">{data!.totalUnits} unidad{data!.totalUnits !== 1 ? 'es' : ''} · {formatCurrency(data!.totalSpent)}</span>
          </div>
          <div className="divide-y divide-line rounded-ctl border border-line">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-table">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.productName}</p>
                  <p className="text-meta text-ink-muted">{item.timesPurchased} compra{item.timesPurchased !== 1 ? 's' : ''}</p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="font-semibold">{item.quantity} u.</p>
                  <p className="text-meta text-ink-muted">{formatCurrency(item.spent)}</p>
                </div>
              </div>
            ))}
          </div>
        </>)}
    </div>
  );
}

type DetailTab = 'sales' | 'consumption' | 'debt';

export function CustomerDetail({ customer, onEdit, onClose }: { customer: Customer; onEdit: () => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [salesPage, setSalesPage] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('sales');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data: salesData } = useQuery({
    queryKey: ['customer-sales', customer.id, salesPage],
    queryFn: async () => (await api.get<{ data: CustomerSale[]; pagination: { total: number; totalPages: number }; totalSpent: number }>(
      `/customers/${customer.id}/sales?page=${salesPage}&limit=10`)).data,
  });

  const { data: debtPayments } = useQuery({
    queryKey: ['customer-debt-payments', customer.id],
    queryFn: async () => (await api.get<{ data: Array<{
      groupId: string; amount: number; method: string; notes: string | null; paidAt: string;
      allocations: Array<{ id: string; saleId: string | null; saleNumber: string | null; amount: number }>;
    }> }>(`/customers/${customer.id}/debt-payments`)).data.data,
    enabled: activeTab === 'debt',
  });

  const hasDebt = Number(customer.currentBalance) > 0;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3"><span className="text-ink-muted">{label}</span><span className="text-right">{value}</span></div>
  );

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()} size="md"
        title={fullName(customer)}
        description={customer.taxId ? `${customer.taxIdType}: ${customer.taxId}` : undefined}
        footer={<>
          <Btn onClick={onEdit}>Editar</Btn>
          {hasDebt && <Btn variant="primary" onClick={() => setShowPayment(true)}><DollarSign />Cobrar deuda</Btn>}
        </>}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={customer.isActive ? 'ok' : 'muted'}>{customer.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
            <StatusBadge tone="neutral">{TYPE_LABELS[customer.type] ?? customer.type}</StatusBadge>
            {hasStoreAccount(customer) && <StatusBadge tone="neutral"><ShoppingCart className="size-3" />Tienda online</StatusBadge>}
          </div>

          <section className="flex flex-col gap-2 text-table">
            {customer.phone && row('Teléfono', <span className="tabular-nums">{customer.phone}</span>)}
            {customer.email && row('Email', customer.email)}
            {customer.address && row('Dirección', customer.address)}
            {customer.businessName && row('Empresa', customer.businessName)}
            {row('Cliente desde', formatDate(customer.createdAt))}
            {customer.notes && <p className="text-meta italic text-ink-muted">“{customer.notes}”</p>}
          </section>

          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-ctl bg-line">
            {[
              ['Saldo deuda', <span className={cn(hasDebt ? 'text-bad-ink' : 'text-ink')}>{formatCurrency(customer.currentBalance)}</span>],
              ['Límite de crédito', formatCurrency(customer.creditLimit)],
              ['Total comprado', salesData ? formatCurrency(salesData.totalSpent) : '…'],
              ['Puntos', <span className="inline-flex items-center gap-1"><Star className="size-3.5 text-warn" />{customer.loyaltyPoints}</span>],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-surface px-3 py-2">
                <p className="text-meta text-ink-muted">{label}</p>
                <p className="text-section font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </section>

          {hasStoreAccount(customer) && (
            <div className="flex flex-col gap-0.5 text-meta text-ink-muted">
              {customer.storeAccounts!.map((sa) => (
                <p key={sa.id}>Se registró en la tienda online el {formatDate(sa.createdAt)} vía {AUTH_PROVIDER_LABELS[sa.authProvider] ?? sa.authProvider}{sa.email ? ` · ${sa.email}` : ''}</p>
              ))}
            </div>
          )}

          <Segmented value={activeTab} onChange={setActiveTab} ariaLabel="Sección"
            options={[['sales', `Compras (${salesData?.pagination.total ?? 0})`], ['consumption', 'Consumos'], ['debt', 'Pagos de deuda']]} />

          {activeTab === 'sales' && (
            !salesData || salesData.data.length === 0 ? <p className="py-6 text-center text-table text-ink-muted">Sin compras registradas</p> : (
              <div className="overflow-hidden rounded-ctl border border-line">
                <div className="divide-y divide-line">
                  {salesData.data.map((sale) => {
                    const outstanding = Number(sale.totalAmount) - Number(sale.paidAmount);
                    return (
                      <button key={sale.id} type="button" onClick={() => navigate(`/sales/${sale.id}`)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-table hover:bg-surface-2">
                        <span>
                          <span className="block font-mono text-meta font-medium text-ink">{sale.saleNumber}</span>
                          <span className="block text-meta text-ink-muted">{formatDateTime(sale.createdAt)} · {sale._count.items} ítem(s)</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold tabular-nums">{formatCurrency(sale.totalAmount)}</span>
                          <span className="flex gap-1">
                            {!sale.isCredit ? <StatusBadge tone="muted">Contado</StatusBadge>
                              : outstanding > 0.009 ? <StatusBadge tone="bad">Fiado, pendiente {formatCurrency(outstanding)}</StatusBadge>
                              : <StatusBadge tone="ok">Fiado, pagado</StatusBadge>}
                            {sale.status !== 'COMPLETED' && <StatusBadge tone="warn">{STATUS_LABELS[sale.status] ?? sale.status}</StatusBadge>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {salesData.pagination.totalPages > 1 && (
                  <Pagination page={salesPage} totalPages={salesData.pagination.totalPages} total={salesData.pagination.total} pageSize={10} onPage={setSalesPage} />
                )}
              </div>
            )
          )}

          {activeTab === 'consumption' && <ConsumptionReport customerId={customer.id} />}

          {activeTab === 'debt' && (
            !debtPayments || debtPayments.length === 0 ? <p className="py-6 text-center text-table text-ink-muted">Sin pagos de deuda registrados</p> : (
              <div className="divide-y divide-line rounded-ctl border border-line">
                {debtPayments.map((p) => {
                  const isExpanded = expandedGroup === p.groupId;
                  const isMultiple = p.allocations.length > 1;
                  return (
                    <div key={p.groupId}>
                      <button type="button" onClick={() => isMultiple && setExpandedGroup(isExpanded ? null : p.groupId)}
                        className={cn('flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-table', isMultiple && 'hover:bg-surface-2')}>
                        <span>
                          <span className="block font-medium">
                            {DEBT_METHOD_LABELS[p.method] ?? p.method}
                            {isMultiple ? <span className="font-normal text-ink-muted"> · aplicado a {p.allocations.length} ventas</span>
                              : p.allocations[0]?.saleNumber ? <span className="font-normal text-ink-muted"> · aplicado a {p.allocations[0].saleNumber}</span> : null}
                          </span>
                          <span className="block text-meta text-ink-muted">{formatDateTime(p.paidAt)}</span>
                          {p.notes && <span className="block text-meta italic text-ink-muted">{p.notes}</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                          {isMultiple && (isExpanded ? <ChevronUp className="size-4 text-ink-muted" /> : <ChevronDown className="size-4 text-ink-muted" />)}
                        </span>
                      </button>
                      {isMultiple && isExpanded && (
                        <div className="flex flex-col gap-1 bg-surface-2 px-3 py-2 pl-7">
                          {p.allocations.map((a) => (
                            <div key={a.id} className="flex justify-between text-meta text-ink-muted">
                              <span className="font-mono">{a.saleNumber ?? '—'}</span><span className="tabular-nums">{formatCurrency(a.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </Sheet>

      {showPayment && (
        <DebtPaymentModal customer={customer} onClose={() => setShowPayment(false)}
          onPaid={() => { setShowPayment(false); queryClient.invalidateQueries({ queryKey: ['customers'] }); }} />
      )}
    </>
  );
}
