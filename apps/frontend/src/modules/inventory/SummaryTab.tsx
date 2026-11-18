// Resumen de inventario: indicadores, valor por categoría y últimos movimientos.
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { EmptyState, Panel, StatCard, StatGrid, StatusBadge, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { MOV_LABELS, isEntry, type DashboardData } from './types';

export function SummaryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-dashboard'],
    queryFn: async () => (await api.get<{ data: DashboardData }>('/inventory/dashboard')).data.data,
    refetchInterval: 60000,
  });
  if (isLoading) return <div className="py-16 text-center text-table text-ink-muted">Cargando…</div>;
  if (!data) return null;
  const { kpis, byCategory, recentMovements } = data;

  return (
    <div className="flex flex-col gap-5">
      <StatGrid cols={3}>
        <StatCard label="Productos activos" value={kpis.totalProducts.toLocaleString('es-PE')} />
        <StatCard label="Sin stock" value={<span className={cn(kpis.outOfStock > 0 && 'text-bad-ink')}>{kpis.outOfStock}</span>} />
        <StatCard label="Stock bajo" value={kpis.lowStock} />
        <StatCard label="Valor al costo" value={formatCurrency(kpis.costValue)} />
        <StatCard label="Valor al precio" value={formatCurrency(kpis.saleValue)} />
        <StatCard label="Margen potencial" value={formatCurrency(kpis.margin)} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Valor por categoría" meta="al costo" bodyClassName="p-3">
          <ResponsiveContainer width="100%" height={Math.max(220, byCategory.length * 34)}>
            <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => `S/${v.toFixed(0)}`} tick={{ fontSize: 11, fill: 'hsl(var(--ink-muted))' }} stroke="hsl(var(--line))" />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: 'hsl(var(--ink-muted))' }} width={110} stroke="hsl(var(--line))" />
              <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: 'hsl(var(--ink) / 0.04)' }} />
              <Bar dataKey="costValue" name="Valor costo" fill="hsl(var(--brand))" radius={[0, 3, 3, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Últimos movimientos">
          {recentMovements.length === 0 ? <EmptyState title="Sin movimientos todavía" /> : (
            <div className="max-h-[320px] overflow-y-auto">
              <table className={tableCls}>
                <tbody>
                  {recentMovements.map((m) => {
                    const entry = isEntry(m.type);
                    return (
                      <tr key={m.id} className="hover:bg-surface-2">
                        <td className={cn(tdCls, 'py-1.5')}>
                          <div className="max-w-[240px] truncate font-medium">{m.product.name}</div>
                          <div className="text-meta text-ink-muted">{formatDateTime(m.createdAt)}</div>
                        </td>
                        <td className={tdCls}><StatusBadge tone={entry ? 'ok' : 'neutral'}>{MOV_LABELS[m.type] ?? m.type}</StatusBadge></td>
                        <td className={cn(tdCls, 'whitespace-nowrap text-right tabular-nums')}>
                          <span className={cn('font-medium', !entry && 'text-bad-ink')}>{entry ? '+' : '−'}{m.quantity}</span>
                          <span className="text-ink-muted"> → {m.quantityAfter}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Resumen por categoría">
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={thCls}>Categoría</th>
              <th className={cn(thCls, 'text-right')}>Productos</th>
              <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Unidades</th>
              <th className={cn(thCls, 'text-right')}>Valor costo</th>
              <th className={cn(thCls, 'hidden text-right md:table-cell')}>Valor venta</th>
              <th className={cn(thCls, 'text-right')}>Margen</th>
            </tr></thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.category} className="hover:bg-surface-2">
                  <td className={cn(tdCls, 'font-medium')}>{c.category}</td>
                  <td className={cn(tdCls, 'text-right tabular-nums')}>{c.products}</td>
                  <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{c.totalStock}</td>
                  <td className={cn(tdCls, 'text-right tabular-nums')}>{formatCurrency(c.costValue)}</td>
                  <td className={cn(tdCls, 'hidden text-right tabular-nums md:table-cell')}>{formatCurrency(c.saleValue)}</td>
                  <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(c.saleValue - c.costValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
