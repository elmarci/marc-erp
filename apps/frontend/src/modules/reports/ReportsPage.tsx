import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, Package, Trophy, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface SalesReport {
  summary: { total: number; count: number; average: number; discounts: number; taxes: number };
  byCategory: Array<{ category: string; total: number; quantity: number }>;
  byPaymentMethod: Array<{ method: string; total: number; count: number }>;
  chart: Array<{ period: string; total: number; count: number }>;
}

interface InventoryReport {
  totalValue: { cost: number; sale: number };
  byCategory: Array<{ category: string; products: number; cost_value: number; sale_value: number }>;
  lowStock: Array<{ id: string; name: string; currentStock: number; minStock: number; category: { name: string } }>;
  noMovement: Array<{ id: string; name: string; current_stock: number; last_movement: string | null }>;
}

interface TopProduct {
  product_id: string; name: string; barcode: string | null;
  category: string; quantity: number; revenue: number; transactions: number;
}

/* ─── Date preset helpers ────────────────────────────────────────────────── */
const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

// Obtener fecha en zona horaria de Lima (UTC-5) en formato YYYY-MM-DD
const limaDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
function limaDateStr(date: Date): string {
  return limaDateFmt.format(date); // devuelve 'YYYY-MM-DD' en hora Lima
}

function getDateRange(days: number) {
  const now = new Date();
  const to = limaDateStr(now);
  if (days === 0) {
    // "Hoy" en Lima
    return { from: to, to };
  }
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return { from: limaDateStr(fromDate), to };
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito',
  TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', CREDIT: 'Crédito', OTHER: 'Otro',
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

/* ─── Sales Report Tab ────────────────────────────────────────────────────── */
function SalesTab() {
  const [preset, setPreset] = useState(1);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const dateRange = customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(PRESETS[preset].days);

  const { data, isLoading } = useQuery({
    queryKey: ['report-sales', dateRange, groupBy],
    queryFn: async () => (await api.get<{ data: SalesReport }>(
      `/reports/sales?from=${dateRange.from}&to=${dateRange.to}&groupBy=${groupBy}`
    )).data.data,
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => { setPreset(i); setCustomFrom(''); setCustomTo(''); }}
              className={cn('px-3 py-1.5 text-sm rounded-md transition-colors',
                preset === i && !customFrom ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span className="text-muted-foreground">—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="flex gap-1 rounded-lg border p-1 ml-auto">
          {(['day', 'week', 'month'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                groupBy === g ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Cargando datos...</div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total ventas', value: formatCurrency(data.summary.total), sub: `${data.summary.count} transacciones`, color: 'text-success' },
              { label: 'Ticket promedio', value: formatCurrency(data.summary.average), sub: 'por venta', color: 'text-primary' },
              { label: 'Descuentos', value: formatCurrency(data.summary.discounts), sub: 'total aplicado', color: 'text-amber-500' },
              {
                label: 'Unidades vendidas',
                value: data.byCategory.reduce((sum, c) => sum + c.quantity, 0).toLocaleString('es-PE'),
                sub: 'en el período',
                color: 'text-muted-foreground',
              },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className={cn('text-2xl font-bold mt-1', kpi.color)}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sales chart */}
          {data.chart.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Ventas por período</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Ventas']} />
                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* By payment method */}
            {data.byPaymentMethod.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Por método de pago</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={data.byPaymentMethod} dataKey="total" nameKey="method"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                          {data.byPaymentMethod.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2 text-sm ml-4">
                      {data.byPaymentMethod.map((m, i) => (
                        <div key={m.method} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span>{PAYMENT_LABELS[m.method] ?? m.method}</span>
                          </div>
                          <span className="font-semibold">{formatCurrency(m.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* By category */}
            {data.byCategory.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Por categoría</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.byCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Total']} />
                      <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ─── Inventory Report Tab ────────────────────────────────────────────────── */
function InventoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: async () => (await api.get<{ data: InventoryReport }>('/reports/inventory')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Cargando...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Valor al costo</p>
            <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(data.totalValue.cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Valor al precio de venta</p>
            <p className="text-2xl font-bold text-success mt-1">{formatCurrency(data.totalValue.sale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Margen potencial</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">
              {formatCurrency(data.totalValue.sale - data.totalValue.cost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Valor de inventario por categoría</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byCategory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="cost_value" name="Al costo" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sale_value" name="Al precio venta" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="destructive">{data.lowStock.length}</Badge>
              Productos con stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto divide-y">
              {data.lowStock.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin alertas de stock</p>
              ) : data.lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('font-bold', p.currentStock === 0 ? 'text-destructive' : 'text-amber-500')}>
                      {p.currentStock} uds
                    </p>
                    <p className="text-xs text-muted-foreground">Mín: {p.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="secondary">{data.noMovement.length}</Badge>
              Sin movimiento +30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto divide-y">
              {data.noMovement.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Todo el inventario tiene movimiento</p>
              ) : data.noMovement.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <p className="font-medium">{p.name}</p>
                  <div className="text-right">
                    <p className="font-medium">{p.current_stock} uds</p>
                    <p className="text-xs text-muted-foreground">
                      {p.last_movement ? `Último: ${new Date(p.last_movement).toLocaleDateString('es-PE')}` : 'Sin movimiento'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Top Products Tab ────────────────────────────────────────────────────── */
function TopProductsTab() {
  const [preset, setPreset] = useState(3); // default: 90 días para ver más datos
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const dateRange = customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(PRESETS[preset].days);

  const { data, isLoading } = useQuery({
    queryKey: ['report-top-products', dateRange],
    queryFn: async () => (await api.get<{ data: TopProduct[] }>(
      `/reports/top-products?from=${dateRange.from}&to=${dateRange.to}&limit=20`
    )).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => { setPreset(i); setCustomFrom(''); setCustomTo(''); }}
              className={cn('px-3 py-1.5 text-sm rounded-md transition-colors',
                preset === i && !customFrom ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span className="text-muted-foreground">—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      </div>

      {isLoading ? <div className="py-16 text-center text-muted-foreground">Cargando...</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-base">Top 20 por ingresos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2 text-left font-medium">#</th>
                      <th className="px-4 py-2 text-left font-medium">Producto</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data ?? []).map((p, i) => (
                      <tr key={p.product_id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 text-muted-foreground font-medium">{i + 1}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.category}</div>
                        </td>
                        <td className="px-4 py-2 text-right">{Number(p.quantity).toFixed(0)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-success">{formatCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                    {(data ?? []).length === 0 && (
                      <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">Sin datos en este período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {(data ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 por cantidad vendida</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={(data ?? []).slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(0)} unidades`, 'Vendidas']} />
                    <Bar dataKey="quantity" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Accounts Receivable Tab ─────────────────────────────────────────────── */
interface Receivable {
  customerId: string; customerName: string; phone: string | null; balance: number;
  unpaidSalesCount: number; oldestUnpaidSale: { id: string; saleNumber: string; createdAt: string } | null;
  daysOverdue: number;
}

function AccountsReceivableTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-accounts-receivable'],
    queryFn: async () => (await api.get<{ data: Receivable[] }>('/reports/accounts-receivable')).data.data,
  });

  const totalOwed = (data ?? []).reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total por cobrar</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{formatCurrency(totalOwed)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">en {(data ?? []).length} cliente(s)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Clientes con deuda pendiente</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">Cargando...</div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">Ningún cliente tiene deuda pendiente.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Cliente</th>
                    <th className="px-4 py-2 text-right font-medium">Deuda</th>
                    <th className="px-4 py-2 text-center font-medium">Ventas fiadas</th>
                    <th className="px-4 py-2 text-left font-medium">Venta más antigua sin pagar</th>
                    <th className="px-4 py-2 text-right font-medium">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map((r) => (
                    <tr key={r.customerId} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <p className="font-medium">{r.customerName}</p>
                        {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-destructive">{formatCurrency(r.balance)}</td>
                      <td className="px-4 py-2 text-center">{r.unpaidSalesCount}</td>
                      <td className="px-4 py-2">
                        {r.oldestUnpaidSale ? (
                          <Link to={`/sales/${r.oldestUnpaidSale.id}`} className="text-primary hover:underline">
                            {r.oldestUnpaidSale.saleNumber}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className={cn('px-4 py-2 text-right font-medium', r.daysOverdue > 30 ? 'text-destructive' : 'text-muted-foreground')}>
                        {r.daysOverdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function ReportsPage() {
  const [tab, setTab] = useState<'sales' | 'inventory' | 'products' | 'receivable'>('sales');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-sm text-muted-foreground">Análisis de ventas, inventario y productos</p>
      </div>

      <div className="flex gap-1 border-b">
        {([
          ['sales', TrendingUp, 'Ventas'],
          ['inventory', Package, 'Inventario'],
          ['products', Trophy, 'Top Productos'],
          ['receivable', Wallet, 'Cuentas por Cobrar'],
        ] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'sales' && <SalesTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'products' && <TopProductsTab />}
      {tab === 'receivable' && <AccountsReceivableTab />}
    </div>
  );
}
