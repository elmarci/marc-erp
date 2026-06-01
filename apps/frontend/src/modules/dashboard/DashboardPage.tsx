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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';
import { formatCurrency, formatNumber } from '@/lib/utils';

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

function KpiCard({
  title, value, subtitle, icon: Icon, trend, trendValue, color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        {trendValue && (
          <div className="mt-3 flex items-center gap-1 text-xs">
            {trend === 'up' ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : trend === 'down' ? (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            ) : null}
            <span className={trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}>
              {trendValue}
            </span>
            <span className="text-muted-foreground">vs mes anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get<{ data: DashboardData }>('/reports/dashboard');
      return res.data.data;
    },
    refetchInterval: 60000, // Actualizar cada minuto
  });

  const chartData = data?.salesChart.map((d) => ({
    date: format(new Date(d.date), 'EEE', { locale: es }),
    total: d.total,
    ventas: Number(d.count),
  })) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="h-32 animate-pulse bg-muted" /></Card>
          ))}
        </div>
      </div>
    );
  }

  const { kpis, topProducts, recentSales } = data ?? {
    kpis: { todaySales: { total: 0, count: 0 }, monthSales: { total: 0, count: 0, growth: 0 }, lowStockCount: 0, pendingOrders: 0 },
    topProducts: [],
    recentSales: [],
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Título */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* KPIs — 2 col móvil, 2 col tablet, 4 col desktop */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Ventas de Hoy"
          value={formatCurrency(kpis.todaySales.total)}
          subtitle={`${formatNumber(kpis.todaySales.count)} transacciones`}
          icon={DollarSign}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          title="Ventas del Mes"
          value={formatCurrency(kpis.monthSales.total)}
          subtitle={`${formatNumber(kpis.monthSales.count)} transacciones`}
          icon={TrendingUp}
          trend={kpis.monthSales.growth >= 0 ? 'up' : 'down'}
          trendValue={`${kpis.monthSales.growth >= 0 ? '+' : ''}${kpis.monthSales.growth.toFixed(1)}%`}
          color="bg-success/10 text-success"
        />
        <KpiCard
          title="Stock Bajo"
          value={formatNumber(kpis.lowStockCount)}
          subtitle="productos por reponer"
          icon={AlertTriangle}
          color={kpis.lowStockCount > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}
        />
        <KpiCard
          title="Órd. Compra Pendientes"
          value={formatNumber(kpis.pendingOrders)}
          subtitle="por aprobar o recibir"
          icon={ShoppingCart}
          color="bg-info/10 text-info"
        />
      </div>

      {/* Gráfica + Top productos — apilados en móvil/tablet, lado a lado en desktop */}
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        {/* Gráfica de ventas */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Ventas Últimos 7 Días</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis
                    tickFormatter={(v) => `S/ ${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Total']}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorTotal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <p className="text-sm">Sin datos de ventas aún</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top productos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Top Productos</CardTitle>
            <Link to="/reports" className="text-xs text-primary hover:underline">
              Ver más
            </Link>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.slice(0, 6).map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(p.quantity)} unid.</p>
                    </div>
                    <span className="text-sm font-semibold text-success shrink-0">
                      {formatCurrency(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin ventas del mes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ventas recientes + alertas */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Ventas recientes */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Ventas Recientes</CardTitle>
            <Link to="/sales">
              <Button variant="ghost" size="sm">
                Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentSales.length > 0 ? (
              <div className="space-y-3">
                {recentSales.map((sale) => (
                  <Link
                    key={sale.id}
                    to={`/sales/${sale.id}`}
                    className="flex items-center justify-between rounded-lg p-2 hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{sale.saleNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.cashier.firstName} · {sale._count.items} producto{sale._count.items !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(sale.totalAmount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sale.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay ventas registradas hoy
              </p>
            )}
          </CardContent>
        </Card>

        {/* Accesos rápidos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Accesos Rápidos</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { to: '/pos', icon: ShoppingCart, label: 'Punto de Venta', color: 'bg-primary/10 text-primary' },
                { to: '/products/new', icon: Package, label: 'Nuevo Producto', color: 'bg-success/10 text-success' },
                { to: '/cash', icon: DollarSign, label: 'Caja', color: 'bg-warning/10 text-warning' },
                { to: '/reports', icon: TrendingUp, label: 'Reportes', color: 'bg-info/10 text-info' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col items-center gap-2 rounded-xl border p-4 hover:bg-muted transition-colors"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-center">{item.label}</span>
                </Link>
              ))}
            </div>
            {kpis.lowStockCount > 0 && (
              <Link to="/products?lowStock=true">
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{kpis.lowStockCount} productos con stock bajo</p>
                    <p className="text-xs text-muted-foreground">Haga clic para ver la lista</p>
                  </div>
                  <Badge variant="warning" className="ml-auto">{kpis.lowStockCount}</Badge>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
