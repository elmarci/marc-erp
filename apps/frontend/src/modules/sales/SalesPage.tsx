import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Receipt, Search, Eye, FileSpreadsheet, X, ArrowUpDown, ArrowUp, ArrowDown,
  TrendingUp, Wallet, Percent, HandCoins, GlassWater,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/services/api';
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

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-success', CANCELLED: 'bg-destructive', RETURNED: 'bg-warning', PARTIALLY_RETURNED: 'bg-amber-400',
};

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

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') ?? '1');

  const [pageTab, setPageTab] = useState<'historial' | 'envases'>('historial');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [preset, setPreset] = useState(3); // "Todo" por defecto
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [cashierId, setCashierId] = useState('');
  const [isCredit, setIsCredit] = useState<'' | 'true' | 'false'>('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const setPage = (n: number) => setSearchParams((p) => { const q = new URLSearchParams(p); q.set('page', String(n)); return q; });

  const activeRange = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : preset >= 0 && PRESETS[preset].days >= 0
    ? { from: limaDateStr(new Date(Date.now() - PRESETS[preset].days * 86400000)), to: limaDateStr(new Date()) }
    : null;

  const hasFilters = !!(debouncedSearch || status || paymentMethod || documentType || cashierId || isCredit || minTotal || maxTotal || dateFrom || dateTo || preset !== 3);

  const clearFilters = () => {
    setSearch(''); setPreset(3); setDateFrom(''); setDateTo(''); setStatus('');
    setPaymentMethod(''); setDocumentType(''); setCashierId(''); setIsCredit('');
    setMinTotal(''); setMaxTotal(''); setPage(1);
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
  });

  const { data: cashiers } = useQuery({
    queryKey: ['sales-cashiers'],
    queryFn: async () => (await api.get<{ data: Cashier[] }>('/sales/meta/cashiers')).data.data,
    staleTime: 5 * 60_000,
  });

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const sortIcon = (field: SortField) => sortBy !== field
    ? <ArrowUpDown className="h-3 w-3 opacity-30" />
    : sortOrder === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;

  const statusVariant = (s: string) =>
    s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'destructive' : 'warning';

  const exportUrl = () => `/sales/export?${(() => {
    const p = new URLSearchParams(filterParams);
    p.set('sortBy', sortBy); p.set('sortOrder', sortOrder);
    return p.toString();
  })()}`;

  const totalStatusCount = summary?.byStatus.reduce((s, x) => s + x.count, 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-sm text-muted-foreground">Historial, filtros avanzados y reportes de ventas</p>
        </div>
        <div className="flex gap-2">
          {pageTab === 'historial' && (
            <Button variant="outline" onClick={() => downloadExcel(exportUrl(), 'ventas.xlsx')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
            </Button>
          )}
          <Link to="/pos"><Button><Receipt className="mr-2 h-4 w-4" />Nueva Venta</Button></Link>
        </div>
      </div>

      {/* Historial de ventas vs. seguimiento de envases retornables — este
          último no depende de que la caja esté abierta, así que vive acá y
          no en Caja. */}
      <div className="flex gap-1 border-b">
        {([['historial', 'Historial', Receipt], ['envases', 'Envases', GlassWater]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              pageTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {pageTab === 'envases' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GlassWater className="h-4 w-4 text-primary" />Garantía de envase
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Cobrar o devolver garantías, y ver quién debe traer un envase o a quién devolverle plata.
            </p>
          </CardHeader>
          <CardContent className="max-w-xl">
            <BottleDepositManager />
          </CardContent>
        </Card>
      )}

      {pageTab === 'historial' && (
      <>
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total vendido</p>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.total)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary?.count ?? 0} venta(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Ticket promedio</p>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.average)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">por venta completada</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Descuentos aplicados</p>
              <Percent className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.discounts)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">en el período filtrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Ventas fiadas</p>
              <HandCoins className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.creditTotal)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary?.creditCount ?? 0} venta(s) a crédito</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {summary && (summary.byPaymentMethod.length > 0 || totalStatusCount > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.byPaymentMethod.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Métodos de pago</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={summary.byPaymentMethod} dataKey="total" nameKey="method"
                        cx="50%" cy="50%" innerRadius={42} outerRadius={70}>
                        {summary.byPaymentMethod.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2 text-sm ml-2">
                    {summary.byPaymentMethod.map((m, i) => (
                      <div key={m.method} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="truncate">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</span>
                        </div>
                        <span className="font-semibold shrink-0">{formatCurrency(m.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {totalStatusCount > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Estado de las ventas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {summary.byStatus.map((s) => {
                  const pct = totalStatusCount > 0 ? (s.count / totalStatusCount) * 100 : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>{STATUS_LABELS[s.status] ?? s.status}</span>
                        <span className="text-muted-foreground">{s.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', STATUS_COLORS[s.status] ?? 'bg-primary')} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por N° venta, cliente, documento o cajero..."
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="flex gap-1 rounded-lg border p-1">
              {PRESETS.map((p, i) => (
                <button key={p.label} type="button"
                  onClick={() => { setPreset(i); setDateFrom(''); setDateTo(''); setPage(1); }}
                  className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                    preset === i && !dateFrom && !dateTo ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {p.label}
                </button>
              ))}
            </div>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" title="Desde" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" title="Hasta" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Todos los estados</option>
              <option value="COMPLETED">Completada</option>
              <option value="CANCELLED">Anulada</option>
              <option value="RETURNED">Devuelta</option>
              <option value="PARTIALLY_RETURNED">Dev. parcial</option>
            </select>

            <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Todos los métodos de pago</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            <select value={documentType} onChange={(e) => { setDocumentType(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Todo tipo de documento</option>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            <select value={cashierId} onChange={(e) => { setCashierId(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Todos los cajeros</option>
              {(cashiers ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>

            <select value={isCredit} onChange={(e) => { setIsCredit(e.target.value as '' | 'true' | 'false'); setPage(1); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Al contado y fiado</option>
              <option value="false">Solo al contado</option>
              <option value="true">Solo fiado</option>
            </select>

            <Input type="number" inputMode="decimal" placeholder="Monto mín." value={minTotal}
              onChange={(e) => { setMinTotal(e.target.value); setPage(1); }} className="w-28" />
            <Input type="number" inputMode="decimal" placeholder="Monto máx." value={maxTotal}
              onChange={(e) => { setMaxTotal(e.target.value); setPage(1); }} className="w-28" />

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" />Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando ventas...</div>
          ) : (data?.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <Receipt className="h-12 w-12 opacity-20" />
              <p>{hasFilters ? 'Ninguna venta coincide con los filtros aplicados' : 'No hay ventas registradas'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      <button type="button" onClick={() => toggleSort('saleNumber')} className="flex items-center gap-1 hover:text-foreground">
                        Número {sortIcon('saleNumber')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium col-md">Cajero</th>
                    <th className="px-4 py-3 text-left font-medium col-lg">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium col-md">Documento</th>
                    <th className="px-4 py-3 text-left font-medium col-lg">Pago</th>
                    <th className="px-4 py-3 text-right font-medium">
                      <button type="button" onClick={() => toggleSort('totalAmount')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                        Total {sortIcon('totalAmount')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium col-md">
                      <button type="button" onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 hover:text-foreground">
                        Fecha {sortIcon('createdAt')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.data ?? []).map((sale) => (
                    <tr key={sale.id} className="hover:bg-muted/30">
                      <td data-label="Número" className="px-4 py-3 font-mono text-xs font-medium">
                        {sale.saleNumber}
                        {sale.isCredit && <Badge variant="warning" className="ml-2 text-[10px]">Fiado</Badge>}
                      </td>
                      <td data-label="Cajero" className="px-4 py-3 col-md">{sale.cashier.firstName} {sale.cashier.lastName}</td>
                      <td data-label="Cliente" className="px-4 py-3 text-muted-foreground col-lg">
                        {sale.customer ? (sale.customer.businessName || `${sale.customer.firstName} ${sale.customer.lastName}`) : '—'}
                      </td>
                      <td data-label="Documento" className="px-4 py-3 col-md text-muted-foreground text-xs">
                        {DOCUMENT_TYPE_LABELS[sale.documentType] ?? sale.documentType}
                      </td>
                      <td data-label="Pago" className="px-4 py-3 col-lg">
                        <div className="flex flex-wrap gap-1">
                          {sale.payments.map((p, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                              {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td data-label="Total" className="px-4 py-3 text-right font-semibold">{formatCurrency(sale.totalAmount)}</td>
                      <td data-label="Estado" className="px-4 py-3 text-center">
                        <Badge variant={statusVariant(sale.status) as 'success' | 'destructive' | 'warning'}>
                          {STATUS_LABELS[sale.status] ?? sale.status}
                        </Badge>
                      </td>
                      <td data-label="Fecha" className="px-4 py-3 text-muted-foreground text-xs col-md">{formatDateTime(sale.createdAt)}</td>
                      <td data-label="Acciones" className="px-4 py-3 text-center">
                        <Link to={`/sales/${sale.id}`}>
                          <Button variant="ghost" size="icon-sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.pagination && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data.pagination.total} venta(s) — Página {page} de {Math.max(1, data.pagination.totalPages)}
          </p>
          {data.pagination.totalPages > 1 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
