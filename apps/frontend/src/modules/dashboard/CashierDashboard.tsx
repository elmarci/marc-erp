import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CalendarCheck, Clock, Coffee, DollarSign, LogIn, LogOut,
  RefreshCw, ShoppingCart, Store,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency, formatNumber, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import {
  MARK_LABELS, MarkType, formatMinutes, limaTime, scheduleLabel, toMinutes,
  useMarkAttendance, useMyAttendance,
} from '@/modules/attendance/attendance';

interface CashierDashboardData {
  kpis: {
    todaySales: { total: number; count: number };
    lowStockCount: number;
    pendingOrders: number;
  };
  mySales: {
    count: number;
    total: number;
    averageTicket: number;
    unitsSold: number;
    cardCommissions: number;
    shareOfBusiness: number;
    cancelledCount: number;
    firstSaleAt: string | null;
    lastSaleAt: string | null;
    byMethod: Array<{ method: string; total: number }>;
    recent: Array<{ id: string; saleNumber: string; totalAmount: number; createdAt: string; itemsCount: number }>;
  };
  openCash: Array<{ id: string; register: string; openedAt: string; openedBy: string }>;
}

const limaHeaderDateFmt = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long',
});

const MARK_ICONS: Record<MarkType, typeof LogIn> = { CHECK_IN: LogIn, LUNCH_OUT: Coffee, LUNCH_IN: Coffee, CHECK_OUT: LogOut };

/** Re-renderiza cada `ms` para que los contadores de tiempo avancen solos. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Minutos del día en hora de Lima (UTC-5 todo el año). */
function limaMinutesNow(now: number) {
  const d = new Date(now - 5 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function Stat({ label, value, hint, icon: Icon, tone }: {
  label: string; value: string; hint: string;
  icon: React.ComponentType<{ className?: string }>; tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight text-muted-foreground sm:text-sm">{label}</p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{value}</p>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{hint}</p>
        </div>
        <div className={cn('hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CashierDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-cashier'],
    queryFn: async () => (await api.get<{ data: CashierDashboardData }>('/reports/dashboard')).data.data,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="h-28 animate-pulse bg-muted" /></Card>
        ))}
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hola{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{limaHeaderDateFmt.format(new Date())}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          label="Ventas de hoy (negocio)"
          value={formatCurrency(kpis.todaySales.total)}
          hint={`${formatNumber(kpis.todaySales.count)} ventas · todo el personal`}
          icon={DollarSign}
          tone="bg-primary/10 text-primary"
        />
        <Stat
          label="Stock bajo"
          value={formatNumber(kpis.lowStockCount)}
          hint="productos por reponer"
          icon={AlertTriangle}
          tone={kpis.lowStockCount > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}
        />
        <Stat
          label="Órd. compra pendientes"
          value={formatNumber(kpis.pendingOrders)}
          hint="por aprobar o recibir"
          icon={ShoppingCart}
          tone="bg-info/10 text-info"
        />
      </div>

      <OpenCashBanner openCash={data.openCash} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MyShiftCard />
        <MySalesCard sales={data.mySales} />
      </div>
    </div>
  );
}

// ─── Caja abierta ───────────────────────────────────────────────────────────
function OpenCashBanner({ openCash }: { openCash: CashierDashboardData['openCash'] }) {
  if (openCash.length === 0) {
    return (
      <Link to="/pos" className="flex items-center gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
        <Store className="h-5 w-5 shrink-0 text-destructive" />
        <span className="flex-1"><b>No hay caja abierta.</b> Ábrela en el Punto de Venta para empezar a vender.</span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    );
  }
  const [main] = openCash;
  return (
    <div className={cn('flex items-start gap-3 rounded-lg p-3 text-sm', openCash.length > 1 ? 'bg-warning/10' : 'bg-muted/60')}>
      <Store className={cn('mt-0.5 h-5 w-5 shrink-0', openCash.length > 1 ? 'text-warning' : 'text-success')} />
      {openCash.length > 1 ? (
        <span>
          <b>Hay {openCash.length} cajas abiertas</b> ({openCash.map((c) => c.register).join(', ')}). Todas deben vender
          en una sola caja para que cuadre: avisa al administrador.
        </span>
      ) : (
        <span>
          <b>{main.register}</b> abierta por {main.openedBy} a las {limaTime(main.openedAt)}. Es la caja del negocio:
          todas las ventas del día van aquí.
        </span>
      )}
    </div>
  );
}

// ─── Mi jornada ─────────────────────────────────────────────────────────────
function MyShiftCard() {
  const { data } = useMyAttendance();
  const mark = useMarkAttendance();
  const now = useNow();

  if (!data) {
    return <Card><CardContent className="h-56 animate-pulse bg-muted" /></Card>;
  }

  const { today, todaySchedule, nextAction } = data;
  const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);
  const checkIn = t(today?.checkInAt);
  const checkOut = t(today?.checkOutAt);
  const lunchOut = t(today?.lunchOutAt);
  const lunchIn = t(today?.lunchInAt);
  const onLunch = !!lunchOut && !lunchIn && !checkOut;

  // Tiempo trabajado hasta ahora (o hasta la salida), sin contar el almuerzo.
  let workedMin = 0;
  if (checkIn) {
    const end = checkOut ?? now;
    let ms = end - checkIn;
    if (lunchOut) ms -= (lunchIn ?? end) - lunchOut;
    workedMin = Math.max(0, Math.round(ms / 60000));
  }

  // Lo que falta para la salida programada (solo mientras la jornada sigue).
  let remainingMin: number | null = null;
  if (todaySchedule && checkIn && !checkOut) {
    remainingMin = toMinutes(todaySchedule.end) - limaMinutesNow(now);
  }
  let lunchLeftMin: number | null = null;
  if (onLunch && todaySchedule?.lunchStart && todaySchedule?.lunchEnd && lunchOut) {
    const allowed = toMinutes(todaySchedule.lunchEnd) - toMinutes(todaySchedule.lunchStart);
    lunchLeftMin = allowed - Math.round((now - lunchOut) / 60000);
  }

  const status = !checkIn
    ? { text: 'Sin marcar ingreso', tone: 'secondary' as const }
    : checkOut
      ? { text: 'Jornada terminada', tone: 'secondary' as const }
      : onLunch
        ? { text: 'En almuerzo', tone: 'warning' as const }
        : { text: 'Trabajando', tone: 'success' as const };

  const marks: { label: string; value: string | null | undefined; extra?: string }[] = [
    { label: 'Ingreso', value: today?.checkInAt, extra: today?.isLate ? `${formatMinutes(today.lateMinutes)} tarde` : undefined },
    ...(todaySchedule?.lunchStart || today?.lunchOutAt
      ? [
          { label: 'Almuerzo', value: today?.lunchOutAt },
          { label: 'Regreso', value: today?.lunchInAt, extra: today?.lunchLateMinutes ? `+${formatMinutes(today.lunchLateMinutes)}` : undefined },
        ]
      : []),
    { label: 'Salida', value: today?.checkOutAt, extra: today?.earlyLeaveMinutes ? `${formatMinutes(today.earlyLeaveMinutes)} antes` : undefined },
  ];

  const doMark = (type: MarkType) => {
    if (type === 'CHECK_OUT' && !confirm('¿Marcar tu salida del día? Ya no podrás marcar otra vez hoy.')) return;
    mark.mutate(type);
  };
  const NextIcon = nextAction ? MARK_ICONS[nextAction] : CalendarCheck;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Mi jornada</CardTitle>
        <Badge variant={status.tone}>{status.text}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Horario de hoy: {scheduleLabel(todaySchedule)}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-xs text-muted-foreground">Tiempo trabajado</p>
            <p className="text-xl font-bold">{checkIn ? formatMinutes(workedMin) : '—'}</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            {lunchLeftMin !== null ? (
              <>
                <p className="text-xs text-muted-foreground">Te queda de almuerzo</p>
                <p className={cn('text-xl font-bold', lunchLeftMin < 0 && 'text-destructive')}>
                  {lunchLeftMin >= 0 ? formatMinutes(lunchLeftMin) : `${formatMinutes(-lunchLeftMin)} pasada`}
                </p>
              </>
            ) : remainingMin !== null ? (
              <>
                <p className="text-xs text-muted-foreground">Para tu salida ({todaySchedule?.end})</p>
                <p className="text-xl font-bold">{remainingMin > 0 ? formatMinutes(remainingMin) : 'Ya es hora'}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Salida programada</p>
                <p className="text-xl font-bold">{todaySchedule?.end ?? '—'}</p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {marks.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="font-semibold tabular-nums">{limaTime(m.value)}</p>
              {m.extra && <p className="text-xs text-warning">{m.extra}</p>}
            </div>
          ))}
        </div>

        {nextAction ? (
          <Button className="w-full" onClick={() => doMark(nextAction)} disabled={mark.isPending}>
            <NextIcon className="mr-2 h-4 w-4" />
            {MARK_LABELS[nextAction]}
          </Button>
        ) : (
          <Link to="/attendance" className="flex items-center justify-center gap-1 text-sm text-primary hover:underline">
            <Clock className="h-4 w-4" /> Ver mi historial de asistencia
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mis ventas de hoy ──────────────────────────────────────────────────────
function MySalesCard({ sales }: { sales: CashierDashboardData['mySales'] }) {
  const facts: { label: string; value: string }[] = [
    { label: 'Ticket promedio', value: formatCurrency(sales.averageTicket) },
    { label: 'Productos vendidos', value: `${formatNumber(sales.unitsSold)} unid.` },
    { label: 'Primera venta', value: limaTime(sales.firstSaleAt) },
    { label: 'Última venta', value: limaTime(sales.lastSaleAt) },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Mis ventas de hoy</CardTitle>
        {sales.shareOfBusiness > 0 && (
          <span className="text-xs text-muted-foreground">{sales.shareOfBusiness.toFixed(0)}% del día</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-bold">{formatCurrency(sales.total)}</p>
          <p className="text-sm text-muted-foreground">
            en {formatNumber(sales.count)} venta{sales.count !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-semibold tabular-nums">{f.value}</p>
            </div>
          ))}
        </div>

        {sales.byMethod.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sales.byMethod.map((m) => (
              <span key={m.method} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {PAYMENT_METHOD_LABELS[m.method] ?? m.method} <b>{formatCurrency(m.total)}</b>
              </span>
            ))}
          </div>
        )}

        {(sales.cancelledCount > 0 || sales.cardCommissions > 0) && (
          <p className="text-xs text-muted-foreground">
            {sales.cancelledCount > 0 && `${sales.cancelledCount} anulada${sales.cancelledCount !== 1 ? 's' : ''}`}
            {sales.cancelledCount > 0 && sales.cardCommissions > 0 && ' · '}
            {sales.cardCommissions > 0 && `Comisión tarjeta cobrada: ${formatCurrency(sales.cardCommissions)}`}
          </p>
        )}

        {sales.recent.length > 0 ? (
          <div className="space-y-1 border-t pt-3">
            {sales.recent.map((s) => (
              <Link
                key={s.id}
                to={`/sales/${s.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span>
                  {s.saleNumber}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.itemsCount} producto{s.itemsCount !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{limaTime(s.createdAt)}</span>
                  <b>{formatCurrency(s.totalAmount)}</b>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="border-t pt-3 text-center text-sm text-muted-foreground">Aún no tienes ventas hoy</p>
        )}
      </CardContent>
    </Card>
  );
}
