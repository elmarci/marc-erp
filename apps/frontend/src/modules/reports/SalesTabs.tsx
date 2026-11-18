// Reportes: ventas, inventario y productos más vendidos.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, Package, Trophy, Wallet, DollarSign, PiggyBank } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader, PageTabs, StatusBadge, fieldCls } from '@/components/erp';
import { Card, CardContent, CardHeader, CardTitle } from './reportsUi';
import { api } from '@/services/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

import { SalesReport, InventoryReport, TopProduct, PRESETS, getDateRange, PAYMENT_LABELS, COLORS } from './reportsShared';

/* ─── Sales Report Tab ────────────────────────────────────────────────────── */
export function SalesTab() {
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
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 rounded-ctl bg-ink/[0.05] p-0.5">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => { setPreset(i); setCustomFrom(''); setCustomTo(''); }}
              className={cn('h-7 rounded-[5px] px-2.5 text-table transition-colors',
                preset === i && !customFrom ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-table">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className={cn(fieldCls, 'h-8 w-auto')} />
          <span className="text-ink-muted">—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className={cn(fieldCls, 'h-8 w-auto')} />
        </div>
        <div className="flex gap-0.5 rounded-ctl bg-ink/[0.05] p-0.5 ml-auto">
          {(['day', 'week', 'month'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={cn('h-7 rounded-[5px] px-2.5 text-table transition-colors',
                groupBy === g ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink')}>
              {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-ink-muted">Cargando datos...</div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total ventas', value: formatCurrency(data.summary.total), sub: `${data.summary.count} transacciones`, color: 'text-ok-ink' },
              { label: 'Ticket promedio', value: formatCurrency(data.summary.average), sub: 'por venta', color: 'text-ink' },
              { label: 'Descuentos', value: formatCurrency(data.summary.discounts), sub: 'total aplicado', color: 'text-warn-ink' },
              {
                label: 'Unidades vendidas',
                value: data.byCategory.reduce((sum, c) => sum + c.quantity, 0).toLocaleString('es-PE'),
                sub: 'en el período',
                color: 'text-ink-muted',
              },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-5">
                  <p className="text-table text-ink-muted">{kpi.label}</p>
                  <p className={cn('text-kpi font-semibold mt-1', kpi.color)}>{kpi.value}</p>
                  <p className="text-meta text-ink-muted mt-0.5">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sales chart */}
          {data.chart.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Ventas por período</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Ventas']} />
                    <Bar dataKey="total" fill="#23802f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* By payment method */}
            {data.byPaymentMethod.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Por método de pago</CardTitle></CardHeader>
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
                    <div className="flex-1 space-y-2 text-table ml-4">
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
                <CardHeader><CardTitle>Por categoría</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.byCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                      <XAxis type="number" tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Total']} />
                      <Bar dataKey="total" fill="#23802f" radius={[0, 4, 4, 0]} />
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
export function InventoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: async () => (await api.get<{ data: InventoryReport }>('/reports/inventory')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="py-16 text-center text-ink-muted">Cargando...</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-table text-ink-muted">Valor al costo</p>
            <p className="text-kpi font-semibold text-brand mt-1">{formatCurrency(data.totalValue.cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-table text-ink-muted">Valor al precio de venta</p>
            <p className="text-kpi font-semibold text-ok-ink mt-1">{formatCurrency(data.totalValue.sale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-table text-ink-muted">Margen potencial</p>
            <p className="text-kpi font-semibold text-warn-ink mt-1">
              {formatCurrency(data.totalValue.sale - data.totalValue.cost)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.byCategory.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Valor de inventario por categoría</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="cost_value" name="Al costo" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sale_value" name="Al precio venta" fill="#23802f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusBadge tone="bad">{data.lowStock.length}</StatusBadge>
              Productos con stock bajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto divide-y divide-line">
              {data.lowStock.length === 0 ? (
                <p className="py-6 text-center text-table text-ink-muted">Sin alertas de stock</p>
              ) : data.lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2 text-table">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-meta text-ink-muted">{p.category.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('font-bold', p.currentStock === 0 ? 'text-bad-ink' : 'text-warn-ink')}>
                      {p.currentStock} uds
                    </p>
                    <p className="text-meta text-ink-muted">Mín: {p.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusBadge tone="muted">{data.noMovement.length}</StatusBadge>
              Sin movimiento +30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-64 overflow-y-auto divide-y divide-line">
              {data.noMovement.length === 0 ? (
                <p className="py-6 text-center text-table text-ink-muted">Todo el inventario tiene movimiento</p>
              ) : data.noMovement.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2 text-table">
                  <p className="font-medium">{p.name}</p>
                  <div className="text-right">
                    <p className="font-medium">{p.current_stock} uds</p>
                    <p className="text-meta text-ink-muted">
                      {p.last_movement ? `Último: ${formatDate(p.last_movement)}` : 'Sin movimiento'}
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
export function TopProductsTab() {
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
        <div className="flex gap-0.5 rounded-ctl bg-ink/[0.05] p-0.5">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => { setPreset(i); setCustomFrom(''); setCustomTo(''); }}
              className={cn('h-7 rounded-[5px] px-2.5 text-table transition-colors',
                preset === i && !customFrom ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className={cn(fieldCls, 'h-8 w-auto')} />
          <span className="text-ink-muted">—</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className={cn(fieldCls, 'h-8 w-auto')} />
        </div>
      </div>

      {isLoading ? <div className="py-16 text-center text-ink-muted">Cargando...</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle>Top 20 por ingresos</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-table">
                  <thead>
                    <tr className="border-b border-line bg-surface-2">
                      <th className="px-4 py-2 text-left font-medium">#</th>
                      <th className="px-4 py-2 text-left font-medium">Producto</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(data ?? []).map((p, i) => (
                      <tr key={p.product_id} className="hover:bg-surface-2">
                        <td className="px-4 py-2 text-ink-muted font-medium">{i + 1}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-meta text-ink-muted">{p.category}</div>
                        </td>
                        <td className="px-4 py-2 text-right">{Number(p.quantity).toFixed(0)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-ok-ink">{formatCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                    {(data ?? []).length === 0 && (
                      <tr><td colSpan={4} className="py-12 text-center text-ink-muted">Sin datos en este período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {(data ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Top 10 por cantidad vendida</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={(data ?? []).slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120}
                      tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                    <Tooltip formatter={(v: number) => [`${Number(v).toFixed(0)} unidades`, 'Vendidas']} />
                    <Bar dataKey="quantity" fill="#23802f" radius={[0, 4, 4, 0]} />
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

