import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, ShoppingCart, Package, AlertTriangle, DollarSign,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Btn, PageHeader, Panel, StatusBadge, surfaceCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { CashierDashboard } from './CashierDashboard';

// Fijado a hora de Lima — sin esto, el encabezado y la hora de "ventas
// recientes" se muestran en la zona horaria del navegador del cajero.
const limaHeaderDateFmt = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const limaTimeFmt = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
});

interface DashboardData {
  kpis: {
    todaySales: { total: number; count: number };
    monthSales: { total: number; count: number; growth: number };
    lowStockCount: number;
    pendingOrders: number;
  };
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  salesChart: Array<{ date: string; total: number; count: number | bigint }>;
  recentSales: Array<{
    id: string;
    saleNumber: string;
    totalAmount: number;
    createdAt: string;
    cashier: { firstName: string; lastName: string };
    _count: { items: number };
  }>;
}

function KpiCard({ title, value, subtitle, icon: Icon, trend, trendValue, warn }: {
  title: string; value: string; subtitle: string; icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral'; trendValue?: string; warn?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1 p-4', surfaceCls)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-table text-ink-muted">{title}</p>
        <Icon className={cn('size-4', warn ? 'text-warn-ink' : 'text-ink-muted')} />
      </div>
      <p className="text-kpi font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-meta text-ink-muted">{subtitle}</p>
      {trendValue && (
        <div className="mt-1 flex items-center gap-1 text-meta">
          {trend === 'up' ? <TrendingUp className="size-3.5 text-ok-ink" /> : trend === 'down' ? <TrendingDown className="size-3.5 text-bad-ink" /> : null}
          <span className={trend === 'up' ? 'text-ok-ink' : trend === 'down' ? 'text-bad-ink' : 'text-ink-muted'}>{trendValue}</span>
          <span className="text-ink-muted">vs mes anterior</span>
        </div>
      )}
    </div>
  );
}

// Cajero/vendedor: dashboard solo del día + su jornada y sus ventas. El resto
// de roles ve el dashboard completo.
export function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'CASHIER' ? <CashierDashboard /> : <FullDashboard />;
}

function FullDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get<{ data: DashboardData }>('/reports/dashboard');
      return res.data.data;
    },
    refetchInterval: 60000, // Actualizar cada minuto
  });

  const chartData = data?.salesChart.map((d) => {
    // d.date es "YYYY-MM-DD" del backend (ya correcto en hora Lima). Si se
    // parsea con `new Date(string)` JS lo toma como medianoche UTC, y en un
    // navegador en Lima (UTC-5) eso cae en las 7pm del día ANTERIOR — el
    // gráfico terminaba mostrando el día equivocado en cada barra.
    const [y, m, day] = d.date.split('-').map(Number);
    return {
      date: format(new Date(y, m - 1, day), 'EEE', { locale: es }),
      total: d.total,
      ventas: Number(d.count),
    };
  }) ?? [];

  if (isLoading) {
    return (
      <div className="erp grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className={cn('h-28 animate-pulse', surfaceCls)} />)}
      </div>
    );
  }

  const { kpis, topProducts, recentSales } = data ?? {
    kpis: { todaySales: { total: 0, count: 0 }, monthSales: { total: 0, count: 0, growth: 0 }, lowStockCount: 0, pendingOrders: 0 },
    topProducts: [],
    recentSales: [],
  };
  const linkCls = 'text-meta font-medium text-brand hover:underline';

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Dashboard" actions={<Btn size="sm" onClick={() => refetch()}><RefreshCw />Actualizar</Btn>}>
        <p className="text-table text-ink-muted">{(() => { const d = limaHeaderDateFmt.format(new Date()); return d.charAt(0).toUpperCase() + d.slice(1); })()}</p>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard title="Ventas de Hoy" value={formatCurrency(kpis.todaySales.total)} subtitle={`${formatNumber(kpis.todaySales.count)} transacciones`} icon={DollarSign} />
        <KpiCard title="Ventas del Mes" value={formatCurrency(kpis.monthSales.total)} subtitle={`${formatNumber(kpis.monthSales.count)} transacciones`} icon={TrendingUp}
          trend={kpis.monthSales.growth >= 0 ? 'up' : 'down'}
          trendValue={`${kpis.monthSales.growth >= 0 ? '+' : ''}${kpis.monthSales.growth.toFixed(1)}%`} />
        <KpiCard title="Stock Bajo" value={formatNumber(kpis.lowStockCount)} subtitle="productos por reponer" icon={AlertTriangle} warn={kpis.lowStockCount > 0} />
        <KpiCard title="Órd. Compra Pendientes" value={formatNumber(kpis.pendingOrders)} subtitle="por aprobar o recibir" icon={ShoppingCart} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Ventas Últimos 7 Días" className="xl:col-span-2" bodyClassName="p-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `S/ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `S/ ${v}`)} width={56} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Total']} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--brand))" strokeWidth={2} fill="hsl(var(--brand))" fillOpacity={0.08} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-table text-ink-muted">Sin datos de ventas aún</div>
          )}
        </Panel>

        <Panel title="Top Productos" actions={<Link to="/reports" className={linkCls}>Ver más</Link>} bodyClassName="p-4">
          {topProducts.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topProducts.slice(0, 6).map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-meta font-semibold text-ink-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-table font-medium text-ink">{p.name}</p>
                    <p className="text-meta text-ink-muted">{formatNumber(p.quantity)} unid.</p>
                  </div>
                  <span className="shrink-0 text-table font-semibold tabular-nums text-ink">{formatCurrency(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-table text-ink-muted">Sin ventas del mes</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Ventas Recientes" actions={<Link to="/sales" className={cn(linkCls, 'inline-flex items-center gap-1')}>Ver todas <ArrowRight className="size-3.5" /></Link>} bodyClassName="p-2">
          {recentSales.length > 0 ? (
            <div className="flex flex-col">
              {recentSales.map((sale) => (
                <Link key={sale.id} to={`/sales/${sale.id}`} className="flex items-center justify-between rounded-ctl p-2 transition-colors hover:bg-surface-2">
                  <div>
                    <p className="font-mono text-table font-medium text-ink">{sale.saleNumber}</p>
                    <p className="text-meta text-ink-muted">{sale.cashier.firstName} · {sale._count.items} producto{sale._count.items !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-table font-semibold tabular-nums text-ink">{formatCurrency(sale.totalAmount)}</p>
                    <p className="text-meta tabular-nums text-ink-muted">{limaTimeFmt.format(new Date(sale.createdAt))}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-table text-ink-muted">No hay ventas registradas hoy</p>
          )}
        </Panel>

        <Panel title="Accesos Rápidos" bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/pos', icon: ShoppingCart, label: 'Punto de Venta' },
              { to: '/products/new', icon: Package, label: 'Nuevo Producto' },
              { to: '/cash', icon: DollarSign, label: 'Caja' },
              { to: '/reports', icon: TrendingUp, label: 'Reportes' },
            ].map((item) => (
              <Link key={item.to} to={item.to}
                className="flex items-center gap-2.5 rounded-ctl p-3 text-table font-medium text-ink shadow-[inset_0_0_0_1px_hsl(var(--line))] transition-colors hover:bg-surface-2">
                <item.icon className="size-4 text-ink-muted" />{item.label}
              </Link>
            ))}
          </div>
          {kpis.lowStockCount > 0 && (
            <Link to="/products?lowStock=true"
              className="mt-3 flex items-center gap-3 rounded-ctl p-3 shadow-[inset_0_0_0_1px_hsl(var(--line)),inset_3px_0_0_hsl(var(--warn))] hover:bg-surface-2">
              <AlertTriangle className="size-4 shrink-0 text-warn-ink" />
              <div>
                <p className="text-table font-medium text-ink">{kpis.lowStockCount} productos con stock bajo</p>
                <p className="text-meta text-ink-muted">Haga clic para ver la lista</p>
              </div>
              <StatusBadge tone="warn" className="ml-auto">{kpis.lowStockCount}</StatusBadge>
            </Link>
          )}
        </Panel>
      </div>
    </div>
  );
}
