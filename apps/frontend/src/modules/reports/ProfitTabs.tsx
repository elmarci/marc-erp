// Reportes: margen, utilidad neta y cuentas por cobrar.
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

import { MarginReport, NetProfitReport, EXPENSE_CATEGORY_LABELS, PRESETS, getDateRange } from './reportsShared';

/* ─── Margin / Utilidad Tab ──────────────────────────────────────────────── */
export function MarginTab() {
  const [preset, setPreset] = useState(1);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const dateRange = customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(PRESETS[preset].days);

  const { data, isLoading } = useQuery({
    queryKey: ['report-margin', dateRange, groupBy],
    queryFn: async () => (await api.get<{ data: MarginReport }>(
      `/reports/margin?from=${dateRange.from}&to=${dateRange.to}&groupBy=${groupBy}`
    )).data.data,
  });

  return (
    <div className="flex flex-col gap-5">
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
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Ingresos', value: formatCurrency(data.summary.revenue), sub: 'en el período', color: 'text-ink' },
              { label: 'Costo', value: formatCurrency(data.summary.cost), sub: 'costo promedio de lo vendido', color: 'text-ink-muted' },
              { label: 'Utilidad', value: formatCurrency(data.summary.margin), sub: `${data.summary.marginPercent.toFixed(1)}% de margen`, color: data.summary.margin >= 0 ? 'text-ok-ink' : 'text-bad-ink' },
              { label: 'Sin costo registrado', value: String(data.summary.itemsWithoutCost), sub: 'ítems de ventas anteriores a este cálculo', color: 'text-warn-ink' },
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

          {data.chart.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Utilidad por período</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `S/ ${v.toFixed(0)}`} tick={{ fontSize: 12 }} width={80} />
                    <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name === 'revenue' ? 'Ingresos' : name === 'cost' ? 'Costo' : 'Utilidad']} />
                    <Legend formatter={(v: string) => v === 'revenue' ? 'Ingresos' : v === 'cost' ? 'Costo' : 'Utilidad'} />
                    <Bar dataKey="revenue" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost" fill="#c08a2b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="margin" fill="#23802f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Utilidad por producto</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-table">
                  <thead>
                    <tr className="border-b border-line bg-surface-2">
                      <th className="px-4 py-2 text-left font-medium">Producto</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                      <th className="px-4 py-2 text-right font-medium">Costo</th>
                      <th className="px-4 py-2 text-right font-medium">Utilidad</th>
                      <th className="px-4 py-2 text-right font-medium">Margen %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.byProduct.map(p => (
                      <tr key={p.productId} className="hover:bg-surface-2">
                        <td className="px-4 py-2 font-medium">{p.name}</td>
                        <td className="px-4 py-2 text-right">{Number.isInteger(p.quantity) ? p.quantity : p.quantity.toFixed(3).replace(/0+$/, '')}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(p.revenue)}</td>
                        <td className="px-4 py-2 text-right text-ink-muted">{formatCurrency(p.cost)}</td>
                        <td className={cn('px-4 py-2 text-right font-semibold', p.margin >= 0 ? 'text-ok-ink' : 'text-bad-ink')}>{formatCurrency(p.margin)}</td>
                        <td className="px-4 py-2 text-right text-ink-muted">{p.marginPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {data.byProduct.length === 0 && (
                      <tr><td colSpan={6} className="py-12 text-center text-ink-muted">Sin datos en este período</td></tr>
                    )}
                  </tbody>
                  {data.byProduct.length > 0 && (
                    <tfoot className="border-t-2 bg-surface-2/40">
                      {(data.summary.saleDiscounts ?? 0) > 0.004 && (
                        <tr>
                          <td className="px-4 py-2 text-ink-muted" colSpan={2}>
                            Descuentos aplicados a la venta completa (cupón, puntos, rebaja manual)
                          </td>
                          <td className="px-4 py-2 text-right text-ink-muted">-{formatCurrency(data.summary.saleDiscounts ?? 0)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right text-bad-ink">-{formatCurrency(data.summary.saleDiscounts ?? 0)}</td>
                          <td className="px-4 py-2" />
                        </tr>
                      )}
                      <tr className="font-semibold">
                        <td className="px-4 py-2">TOTAL ({data.byProduct.length} productos)</td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2 text-right">{formatCurrency(data.summary.revenue)}</td>
                        <td className="px-4 py-2 text-right text-ink-muted">{formatCurrency(data.summary.cost)}</td>
                        <td className={cn('px-4 py-2 text-right', data.summary.margin >= 0 ? 'text-ok-ink' : 'text-bad-ink')}>{formatCurrency(data.summary.margin)}</td>
                        <td className="px-4 py-2 text-right text-ink-muted">{data.summary.marginPercent.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ─── Utilidad Neta Tab ───────────────────────────────────────────────────── */
export function NetProfitTab() {
  const [preset, setPreset] = useState(1);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const dateRange = customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(PRESETS[preset].days);

  const { data, isLoading } = useQuery({
    queryKey: ['report-net-profit', dateRange],
    queryFn: async () => (await api.get<{ data: NetProfitReport }>(
      `/reports/net-profit?from=${dateRange.from}&to=${dateRange.to}`
    )).data.data,
  });

  return (
    <div className="flex flex-col gap-5">
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
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-ink-muted">Cargando datos...</div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            {[
              { label: 'Ingresos', value: formatCurrency(data.summary.revenue), color: 'text-ink' },
              { label: 'Costo de venta', value: formatCurrency(data.summary.cost), color: 'text-ink-muted' },
              { label: 'Margen bruto', value: formatCurrency(data.summary.grossMargin), color: 'text-ink' },
              { label: 'Gastos operativos', value: formatCurrency(data.summary.expenses), color: 'text-bad-ink' },
              {
                label: 'Utilidad neta', value: formatCurrency(data.summary.netProfit),
                sub: `${data.summary.netProfitPercent.toFixed(1)}% de las ventas`,
                color: data.summary.netProfit >= 0 ? 'text-ok-ink' : 'text-bad-ink',
              },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-5">
                  <p className="text-table text-ink-muted">{kpi.label}</p>
                  <p className={cn('text-kpi font-semibold mt-1', kpi.color)}>{kpi.value}</p>
                  {kpi.sub && <p className="text-meta text-ink-muted mt-0.5">{kpi.sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Gastos por categoría</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-table">
                  <thead>
                    <tr className="border-b border-line bg-surface-2">
                      <th className="px-4 py-2 text-left font-medium">Categoría</th>
                      <th className="px-4 py-2 text-right font-medium">N° de gastos</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.expensesByCategory.map((e) => (
                      <tr key={e.category} className="hover:bg-surface-2">
                        <td className="px-4 py-2 font-medium">{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</td>
                        <td className="px-4 py-2 text-right">{e.count}</td>
                        <td className="px-4 py-2 text-right font-semibold text-bad-ink">{formatCurrency(e.total)}</td>
                      </tr>
                    ))}
                    {data.expensesByCategory.length === 0 && (
                      <tr><td colSpan={3} className="py-12 text-center text-ink-muted">Sin gastos registrados en este período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ─── Accounts Receivable Tab ─────────────────────────────────────────────── */
interface Receivable {
  customerId: string; customerName: string; phone: string | null; balance: number;
  unpaidSalesCount: number; oldestUnpaidSale: { id: string; saleNumber: string; createdAt: string } | null;
  daysOverdue: number;
}

export function AccountsReceivableTab() {
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
            <p className="text-table text-ink-muted">Total por cobrar</p>
            <p className="text-kpi font-semibold mt-1 text-bad-ink">{formatCurrency(totalOwed)}</p>
            <p className="text-meta text-ink-muted mt-0.5">en {(data ?? []).length} cliente(s)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Clientes con deuda pendiente</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-ink-muted">Cargando...</div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center text-ink-muted">Ningún cliente tiene deuda pendiente.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-table">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    <th className="px-4 py-2 text-left font-medium">Cliente</th>
                    <th className="px-4 py-2 text-right font-medium">Deuda</th>
                    <th className="px-4 py-2 text-center font-medium">Ventas fiadas</th>
                    <th className="px-4 py-2 text-left font-medium">Venta más antigua sin pagar</th>
                    <th className="px-4 py-2 text-right font-medium">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((r) => (
                    <tr key={r.customerId} className="hover:bg-surface-2">
                      <td className="px-4 py-2">
                        <p className="font-medium">{r.customerName}</p>
                        {r.phone && <p className="text-meta text-ink-muted">{r.phone}</p>}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-bad-ink">{formatCurrency(r.balance)}</td>
                      <td className="px-4 py-2 text-center">{r.unpaidSalesCount}</td>
                      <td className="px-4 py-2">
                        {r.oldestUnpaidSale ? (
                          <Link to={`/sales/${r.oldestUnpaidSale.id}`} className="text-brand hover:underline">
                            {r.oldestUnpaidSale.saleNumber}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className={cn('px-4 py-2 text-right font-medium', r.daysOverdue > 30 ? 'text-bad-ink' : 'text-ink-muted')}>
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

