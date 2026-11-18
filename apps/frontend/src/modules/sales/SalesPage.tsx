// Ventas: historial con filtros guardados en la dirección, resumen del
// periodo y la pestaña de garantías de envase.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Receipt } from 'lucide-react';
import {
  Btn, EmptyState, FilterBar, PageHeader, PageTabs, Pagination, Panel, Segmented, StatCard, StatGrid, StatusBadge,
  fieldCls, surfaceCls, tableCls, tdCls, thCls, type Tone,
} from '@/components/erp';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency, formatDateTime, STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { BottleDepositManager } from '@/modules/bottle-deposits/BottleDepositManager';

interface Sale {
  id: string; saleNumber: string; totalAmount: number; status: string; createdAt: string;
  documentType: string; isCredit: boolean;
  cashier: { firstName: string; lastName: string };
  customer: { firstName: string; lastName: string; businessName?: string | null } | null;
  payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

interface SalesSummary {
  total: number; count: number; average: number; discounts: number;
  creditTotal: number; creditCount: number;
  byPaymentMethod: Array<{ method: string; total: number; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

interface Cashier { id: string; firstName: string; lastName: string }

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  BOLETA: 'Boleta', FACTURA: 'Factura', NOTA_VENTA: 'Nota de venta', TICKET: 'Ticket',
};
const CREDIT_LABELS: Record<string, string> = { false: 'Solo al contado', true: 'Solo fiado' };

export const SALE_STATUS_TONE: Record<string, Tone> = { COMPLETED: 'ok', CANCELLED: 'bad', RETURNED: 'warn', PARTIALLY_RETURNED: 'warn' };
const STATUS_BAR: Record<string, string> = { COMPLETED: 'bg-ok', CANCELLED: 'bg-bad', RETURNED: 'bg-warn', PARTIALLY_RETURNED: 'bg-warn' };

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: 'Todo', days: -1 },
];

const limaDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
function limaDateStr(date: Date): string {
  return limaDateFmt.format(date);
}

type SortField = 'createdAt' | 'totalAmount' | 'saleNumber';

const selCls = cn(fieldCls, 'h-8');

export function SalesPage() {
  // Cajero/vendedor y almacén: solo sus ventas del día (el backend lo fuerza igual).
  const navigate = useNavigate();
  const limited = useAuthStore((st) => st.hasRole('CASHIER', 'WAREHOUSE'));
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') ?? '1');

  const [pageTab, setPageTab] = useState<'historial' | 'envases'>('historial');

  // Todos los filtros viven en la URL (igual que Productos) para que al
  // volver de ver el detalle de una venta (navigate(-1)) se restaure la
  // página, la fila y los filtros exactos de donde salió el usuario, en vez
  // de resetear todo al estado inicial.
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const preset = parseInt(searchParams.get('preset') ?? '3');
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const status = searchParams.get('status') ?? '';
  const paymentMethod = searchParams.get('paymentMethod') ?? '';
  const documentType = searchParams.get('documentType') ?? '';
  const cashierId = searchParams.get('cashierId') ?? '';
  const isCredit = (searchParams.get('isCredit') ?? '') as '' | 'true' | 'false';
  const minTotal = searchParams.get('minTotal') ?? '';
  const maxTotal = searchParams.get('maxTotal') ?? '';
  const sortBy = (searchParams.get('sortBy') ?? 'createdAt') as SortField;
  const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as 'asc' | 'desc';

  const setPage = (n: number) => setSearchParams((p) => { const q = new URLSearchParams(p); q.set('page', String(n)); return q; });

  // Cambia un filtro y vuelve a la página 1 — mismo patrón que ProductsPage.
  const setParam = (key: string, value: string, resetPage = true) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      if (resetPage) next.set('page', '1');
      return next;
    });
  };

  const handleSearch = (q: string) => {
    setSearch(q);
    setParam('search', q);
  };

  const activeRange = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : preset >= 0 && PRESETS[preset].days >= 0
    ? { from: limaDateStr(new Date(Date.now() - PRESETS[preset].days * 86400000)), to: limaDateStr(new Date()) }
    : null;

  const hasFilters = !!(debouncedSearch || status || paymentMethod || documentType || cashierId || isCredit || minTotal || maxTotal || (!limited && (dateFrom || dateTo || preset !== 3)));

  const clearFilters = () => {
    setSearch('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      ['search', 'preset', 'dateFrom', 'dateTo', 'status', 'paymentMethod', 'documentType', 'cashierId', 'isCredit', 'minTotal', 'maxTotal']
        .forEach((k) => next.delete(k));
      next.set('page', '1');
      return next;
    });
  };

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (activeRange) { p.set('dateFrom', activeRange.from); p.set('dateTo', `${activeRange.to}T23:59:59.999`); }
    if (status) p.set('status', status);
    if (paymentMethod) p.set('paymentMethod', paymentMethod);
    if (documentType) p.set('documentType', documentType);
    if (cashierId) p.set('cashierId', cashierId);
    if (isCredit) p.set('isCredit', isCredit);
    if (minTotal) p.set('minTotal', minTotal);
    if (maxTotal) p.set('maxTotal', maxTotal);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeRange?.from, activeRange?.to, status, paymentMethod, documentType, cashierId, isCredit, minTotal, maxTotal]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, sortBy, sortOrder, filterParams.toString()],
    queryFn: async () => {
      const params = new URLSearchParams(filterParams);
      params.set('page', String(page));
      params.set('limit', '25');
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      const res = await api.get<{ data: Sale[]; pagination: { total: number; totalPages: number } }>(`/sales?${params.toString()}`);
      return res.data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['sales-summary', filterParams.toString()],
    queryFn: async () => (await api.get<{ data: SalesSummary }>(`/sales/summary?${filterParams.toString()}`)).data.data,
    enabled: !limited,
  });

  const { data: cashiers } = useQuery({
    queryKey: ['sales-cashiers'],
    queryFn: async () => (await api.get<{ data: Cashier[] }>('/sales/meta/cashiers')).data.data,
    staleTime: 5 * 60_000,
  });

  // Un solo cambio de dirección: dos setParam seguidos se pisaban y al elegir
  // otra columna no cambiaba el orden.
  const toggleSort = (field: SortField) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (sortBy === field) next.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    else { next.set('sortBy', field); next.set('sortOrder', 'desc'); }
    return next;
  });

  const sortIcon = (field: SortField) => sortBy !== field
    ? <ArrowUpDown className="size-3 opacity-40" />
    : sortOrder === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />;

  const exportUrl = () => `/sales/export?${(() => {
    const p = new URLSearchParams(filterParams);
    p.set('sortBy', sortBy); p.set('sortOrder', sortOrder);
    return p.toString();
  })()}`;

  const totalStatusCount = summary?.byStatus.reduce((s, x) => s + x.count, 0) ?? 0;

  const sales = data?.data ?? [];
  const cashierName = (cashiers ?? []).find((c) => c.id === cashierId);
  const advancedCount = [status, paymentMethod, documentType, cashierId, isCredit, minTotal, maxTotal].filter(Boolean).length;
  const maxMethod = Math.max(1, ...(summary?.byPaymentMethod ?? []).map((m) => m.total));
  const sortTh = (field: SortField, label: string, right = false) => (
    <button type="button" onClick={() => toggleSort(field)} className={cn('inline-flex items-center gap-1 hover:text-ink', right && 'ml-auto')}>
      {label}{sortIcon(field)}
    </button>
  );
  const openSale = (id: string) => navigate(`/sales/${id}`);

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title={limited ? 'Ventas de hoy' : 'Ventas'} actions={<>
        {pageTab === 'historial' && !limited && (
          <Btn className="hidden sm:inline-flex" onClick={() => downloadExcel(exportUrl(), 'ventas.xlsx')}><FileSpreadsheet />Exportar Excel</Btn>
        )}
        <Btn variant="primary" onClick={() => navigate('/pos')}><Receipt />Nueva venta</Btn>
      </>}>
        {!limited && <p className="text-table text-ink-muted">Historial, filtros y resumen de ventas</p>}
      </PageHeader>

      {/* Envases: no depende de que la caja esté abierta, así que vive acá. */}
      <PageTabs value={pageTab} onChange={setPageTab} tabs={[['historial', 'Historial'], ['envases', 'Envases']]} />

      {pageTab === 'envases' && (
        <Panel title="Garantía de envase" bodyClassName="p-4">
          <p className="mb-3 text-table text-ink-muted">Cobrar o devolver garantías, y ver quién debe traer un envase o a quién devolverle plata.</p>
          <div className="max-w-xl"><BottleDepositManager /></div>
        </Panel>
      )}

      {pageTab === 'historial' && (<>
        {limited && (
          <p className="text-table text-ink-muted">Ventas de hoy de la tienda. Filtra por pago, cliente o cajero, y abre cada una para reimprimir el ticket o hacer una devolución.</p>
        )}
        {!limited && (<>
          <StatGrid cols={4}>
            <StatCard label="Total vendido" value={formatCurrency(summary?.total)} hint={`${summary?.count ?? 0} venta(s)`} />
            <StatCard label="Ticket promedio" value={formatCurrency(summary?.average)} hint="por venta completada" />
            <StatCard label="Descuentos aplicados" value={formatCurrency(summary?.discounts)} hint="en el periodo filtrado" />
            <StatCard label="Ventas fiadas" value={formatCurrency(summary?.creditTotal)} hint={`${summary?.creditCount ?? 0} venta(s) a crédito`} />
          </StatGrid>

          {summary && (summary.byPaymentMethod.length > 0 || totalStatusCount > 0) && (
            <div className="grid gap-5 lg:grid-cols-2">
              {summary.byPaymentMethod.length > 0 && (
                <Panel title="Métodos de pago" bodyClassName="flex flex-col gap-2.5 p-4">
                  {summary.byPaymentMethod.map((m) => (
                    <div key={m.method} className="text-table">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span>{PAYMENT_METHOD_LABELS[m.method] ?? m.method}<span className="ml-1.5 text-meta text-ink-muted">{m.count}</span></span>
                        <span className="font-semibold tabular-nums">{formatCurrency(m.total)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(m.total / maxMethod) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </Panel>
              )}
              {totalStatusCount > 0 && (
                <Panel title="Estado de las ventas" bodyClassName="flex flex-col gap-2.5 p-4">
                  {summary.byStatus.map((st) => {
                    const pct = totalStatusCount > 0 ? (st.count / totalStatusCount) * 100 : 0;
                    return (
                      <div key={st.status} className="text-table">
                        <div className="mb-1 flex items-center justify-between">
                          <span>{STATUS_LABELS[st.status] ?? st.status}</span>
                          <span className="tabular-nums text-ink-muted">{st.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                          <div className={cn('h-full rounded-full', STATUS_BAR[st.status] ?? 'bg-brand')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </Panel>
              )}
            </div>
          )}
        </>)}

        <div className={cn('overflow-hidden', surfaceCls)}>
          <FilterBar
            search={{ value: search, onChange: handleSearch, placeholder: 'Buscar por N° venta, cliente, documento o cajero' }}
            quick={!limited && <>
              <Segmented ariaLabel="Periodo" value={dateFrom || dateTo ? '' : String(preset)}
                onChange={(v) => setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('preset', v); next.delete('dateFrom'); next.delete('dateTo'); next.set('page', '1');
                  return next;
                })}
                options={PRESETS.map((p, i) => [String(i), p.label] as const)} />
              <input type="date" aria-label="Desde" title="Desde" value={dateFrom} onChange={(e) => setParam('dateFrom', e.target.value)} className={cn(selCls, 'w-auto')} />
              <input type="date" aria-label="Hasta" title="Hasta" value={dateTo} onChange={(e) => setParam('dateTo', e.target.value)} className={cn(selCls, 'w-auto')} />
            </>}
            advancedCount={advancedCount}
            advanced={<>
              <select aria-label="Estado" value={status} onChange={(e) => setParam('status', e.target.value)} className={selCls}>
                <option value="">Todos los estados</option>
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Anulada</option>
                <option value="RETURNED">Devuelta</option>
                <option value="PARTIALLY_RETURNED">Dev. parcial</option>
              </select>
              <select aria-label="Método de pago" value={paymentMethod} onChange={(e) => setParam('paymentMethod', e.target.value)} className={selCls}>
                <option value="">Todos los métodos de pago</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select aria-label="Tipo de documento" value={documentType} onChange={(e) => setParam('documentType', e.target.value)} className={selCls}>
                <option value="">Todo tipo de documento</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select aria-label="Cajero" value={cashierId} onChange={(e) => setParam('cashierId', e.target.value)} className={selCls}>
                <option value="">Todos los cajeros</option>
                {(cashiers ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
              <select aria-label="Contado o fiado" value={isCredit} onChange={(e) => setParam('isCredit', e.target.value)} className={selCls}>
                <option value="">Al contado y fiado</option>
                <option value="false">Solo al contado</option>
                <option value="true">Solo fiado</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" inputMode="decimal" aria-label="Monto mínimo" placeholder="Monto mín." value={minTotal} onChange={(e) => setParam('minTotal', e.target.value)} className={cn(selCls, 'text-right tabular-nums')} />
                <input type="number" inputMode="decimal" aria-label="Monto máximo" placeholder="Monto máx." value={maxTotal} onChange={(e) => setParam('maxTotal', e.target.value)} className={cn(selCls, 'text-right tabular-nums')} />
              </div>
            </>}
            chips={[
              ...(search ? [{ key: 'q', label: 'Búsqueda', value: search, onRemove: () => handleSearch('') }] : []),
              ...(status ? [{ key: 'st', label: 'Estado', value: STATUS_LABELS[status] ?? status, onRemove: () => setParam('status', '') }] : []),
              ...(paymentMethod ? [{ key: 'pm', label: 'Pago', value: PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod, onRemove: () => setParam('paymentMethod', '') }] : []),
              ...(documentType ? [{ key: 'doc', label: 'Documento', value: DOCUMENT_TYPE_LABELS[documentType] ?? documentType, onRemove: () => setParam('documentType', '') }] : []),
              ...(cashierId ? [{ key: 'caj', label: 'Cajero', value: cashierName ? `${cashierName.firstName} ${cashierName.lastName}` : '…', onRemove: () => setParam('cashierId', '') }] : []),
              ...(isCredit ? [{ key: 'cr', label: 'Venta', value: CREDIT_LABELS[isCredit], onRemove: () => setParam('isCredit', '') }] : []),
              ...(minTotal ? [{ key: 'min', label: 'Desde', value: `S/ ${minTotal}`, onRemove: () => setParam('minTotal', '') }] : []),
              ...(maxTotal ? [{ key: 'max', label: 'Hasta', value: `S/ ${maxTotal}`, onRemove: () => setParam('maxTotal', '') }] : []),
            ]}
            onClear={hasFilters ? clearFilters : undefined}
          />

          {isLoading ? (
            <div className="py-12 text-center text-table text-ink-muted">Cargando ventas…</div>
          ) : sales.length === 0 ? (
            <EmptyState icon={Receipt} title={hasFilters ? 'Ninguna venta coincide con los filtros aplicados' : 'No hay ventas registradas'} />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>{sortTh('saleNumber', 'Número')}</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Cajero</th>
                  <th className={cn(thCls, 'hidden lg:table-cell')}>Cliente</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Documento</th>
                  <th className={cn(thCls, 'hidden lg:table-cell')}>Pago</th>
                  <th className={cn(thCls, 'text-right')}>{sortTh('totalAmount', 'Total', true)}</th>
                  <th className={thCls}>Estado</th>
                  <th className={cn(thCls, 'hidden sm:table-cell')}>{sortTh('createdAt', 'Fecha')}</th>
                </tr></thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} tabIndex={0} aria-label={`Ver venta ${sale.saleNumber}`} onClick={() => openSale(sale.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSale(sale.id); } }}
                      className="cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="flex items-center gap-1.5 font-mono text-meta font-medium text-ink">
                          {sale.saleNumber}{sale.isCredit && <StatusBadge tone="warn" className="font-sans">Fiado</StatusBadge>}
                        </div>
                        <div className="text-meta text-ink-muted sm:hidden">{formatDateTime(sale.createdAt)}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden md:table-cell')}>{sale.cashier.firstName} {sale.cashier.lastName}</td>
                      <td className={cn(tdCls, 'hidden text-ink-muted lg:table-cell')}>
                        {sale.customer ? (sale.customer.businessName || `${sale.customer.firstName} ${sale.customer.lastName}`) : '—'}
                      </td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{DOCUMENT_TYPE_LABELS[sale.documentType] ?? sale.documentType}</td>
                      <td className={cn(tdCls, 'hidden text-ink-muted lg:table-cell')}>{sale.payments.map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method).join(' + ')}</td>
                      <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{formatCurrency(sale.totalAmount)}</td>
                      <td className={tdCls}><StatusBadge tone={SALE_STATUS_TONE[sale.status] ?? 'neutral'}>{STATUS_LABELS[sale.status] ?? sale.status}</StatusBadge></td>
                      <td className={cn(tdCls, 'hidden whitespace-nowrap text-meta text-ink-muted sm:table-cell')}>{formatDateTime(sale.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data?.pagination && data.pagination.total > 0 && (
            <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={25} onPage={setPage} />
          )}
        </div>
      </>)}
    </div>
  );
}
