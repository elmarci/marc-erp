import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CalendarCheck, Clock, Coffee, DollarSign, LogIn, LogOut,
  RefreshCw, ShoppingCart, Store,
} from 'lucide-react';
import { Btn, PageHeader, StatusBadge, surfaceCls, useConfirm } from '@/components/erp';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/reports/reportsUi';
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

function Stat({ label, value, hint, icon: Icon, warn }: {
  label: string; value: string; hint: string; icon: React.ComponentType<{ className?: string }>; warn?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 p-3 sm:p-4', surfaceCls)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-meta font-medium leading-tight text-ink-muted sm:text-table">{label}</p>
        <Icon className={cn('hidden size-4 shrink-0 sm:block', warn ? 'text-warn-ink' : 'text-ink-muted')} />
      </div>
      <p className="text-section font-semibold tabular-nums text-ink sm:text-kpi">{value}</p>
      <p className="hidden text-meta text-ink-muted sm:block">{hint}</p>
    </div>
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
      <div className="erp grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => <div key={i} className={cn('h-28 animate-pulse', surfaceCls)} />)}
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title={`Hola${user?.firstName ? `, ${user.firstName}` : ''}`} actions={<Btn size="sm" onClick={() => refetch()}><RefreshCw />Actualizar</Btn>}>
        <p className="text-table text-ink-muted first-letter:uppercase">{limaHeaderDateFmt.format(new Date())}</p>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat
          label="Ventas de hoy (negocio)"
          value={formatCurrency(kpis.todaySales.total)}
          hint={`${formatNumber(kpis.todaySales.count)} ventas · todo el personal`}
          icon={DollarSign}
        />
        <Stat
          label="Stock bajo"
          value={formatNumber(kpis.lowStockCount)}
          hint="productos por reponer"
          icon={AlertTriangle}
          warn={kpis.lowStockCount > 0}
        />
        <Stat
          label="Órd. compra pendientes"
          value={formatNumber(kpis.pendingOrders)}
          hint="por aprobar o recibir"
          icon={ShoppingCart}
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
      <Link to="/pos" className="flex items-center gap-3 rounded-srf border border-line bg-surface p-3 text-table text-ink shadow-[inset_3px_0_0_hsl(var(--bad))] hover:bg-surface-2">
        <Store className="size-5 shrink-0 text-bad-ink" />
        <span className="flex-1"><span className="font-semibold">No hay caja abierta.</span> Ábrela en el Punto de Venta para empezar a vender.</span>
        <ArrowRight className="size-4 shrink-0" />
      </Link>
    );
  }
  const [main] = openCash;
  return (
    <div className={cn('flex items-start gap-3 rounded-srf border border-line bg-surface p-3 text-table text-ink', openCash.length > 1 ? 'shadow-[inset_3px_0_0_hsl(var(--warn))]' : '')}>
      <Store className={cn('mt-0.5 size-5 shrink-0', openCash.length > 1 ? 'text-warn-ink' : 'text-ok-ink')} />
      {openCash.length > 1 ? (
        <span>
          <span className="font-semibold">Hay {openCash.length} cajas abiertas</span> ({openCash.map((c) => c.register).join(', ')}). Todas deben vender
          en una sola caja para que cuadre: avisa al administrador.
        </span>
      ) : (
        <span>
          <span className="font-semibold">{main.register}</span> abierta por {main.openedBy} a las {limaTime(main.openedAt)}. Es la caja del negocio:
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
  const confirm = useConfirm();
  const now = useNow();

  if (!data) {
    return <div className={cn('h-56 animate-pulse', surfaceCls)} />;
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
    ? { text: 'Sin marcar ingreso', tone: 'muted' as const }
    : checkOut
      ? { text: 'Jornada terminada', tone: 'muted' as const }
      : onLunch
        ? { text: 'En almuerzo', tone: 'warn' as const }
        : { text: 'Trabajando', tone: 'ok' as const };

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

  const doMark = async (type: MarkType) => {
    if (type === 'CHECK_OUT') {
      const r = await confirm({ title: '¿Marcar tu salida del día?', description: 'Ya no podrás marcar otra vez hoy.', confirmLabel: 'Marcar salida', tone: 'primary' });
      if (!r.ok) return;
    }
    mark.mutate(type);
  };
  const NextIcon = nextAction ? MARK_ICONS[nextAction] : CalendarCheck;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle>Mi jornada</CardTitle>
        <StatusBadge tone={status.tone}>{status.text}</StatusBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-meta text-ink-muted">
          Horario de hoy: {scheduleLabel(todaySchedule)}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-ctl bg-surface-2 p-3">
            <p className="text-meta text-ink-muted">Tiempo trabajado</p>
            <p className="text-section font-semibold tabular-nums">{checkIn ? formatMinutes(workedMin) : '—'}</p>
          </div>
          <div className="rounded-ctl bg-surface-2 p-3">
            {lunchLeftMin !== null ? (
              <>
                <p className="text-meta text-ink-muted">Te queda de almuerzo</p>
                <p className={cn('text-section font-semibold tabular-nums', lunchLeftMin < 0 && 'text-bad-ink')}>
                  {lunchLeftMin >= 0 ? formatMinutes(lunchLeftMin) : `${formatMinutes(-lunchLeftMin)} pasada`}
                </p>
              </>
            ) : remainingMin !== null ? (
              <>
                <p className="text-meta text-ink-muted">Para tu salida ({todaySchedule?.end})</p>
                <p className="text-section font-semibold tabular-nums">{remainingMin > 0 ? formatMinutes(remainingMin) : 'Ya es hora'}</p>
              </>
            ) : (
              <>
                <p className="text-meta text-ink-muted">Salida programada</p>
                <p className="text-section font-semibold tabular-nums">{todaySchedule?.end ?? '—'}</p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {marks.map((m) => (
            <div key={m.label}>
              <p className="text-meta text-ink-muted">{m.label}</p>
              <p className="font-semibold tabular-nums">{limaTime(m.value)}</p>
              {m.extra && <p className="text-meta text-warn-ink">{m.extra}</p>}
            </div>
          ))}
        </div>

        {nextAction ? (
          <Btn variant="primary" className="w-full" onClick={() => doMark(nextAction)} disabled={mark.isPending}>
            <NextIcon />{MARK_LABELS[nextAction]}
          </Btn>
        ) : (
          <Link to="/attendance" className="flex items-center justify-center gap-1 text-table text-brand hover:underline">
            <Clock className="size-4" /> Ver mi historial de asistencia
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
        <CardTitle>Mis ventas de hoy</CardTitle>
        {sales.shareOfBusiness > 0 && (
          <span className="text-meta text-ink-muted">{sales.shareOfBusiness.toFixed(0)}% del día</span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <p className="text-kpi font-semibold tabular-nums">{formatCurrency(sales.total)}</p>
          <p className="text-table text-ink-muted">
            en {formatNumber(sales.count)} venta{sales.count !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <p className="text-meta text-ink-muted">{f.label}</p>
              <p className="font-semibold tabular-nums">{f.value}</p>
            </div>
          ))}
        </div>

        {sales.byMethod.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sales.byMethod.map((m) => (
              <span key={m.method} className="rounded-full bg-surface-2 px-2.5 py-1 text-meta">
                {PAYMENT_METHOD_LABELS[m.method] ?? m.method} <span className="font-semibold">{formatCurrency(m.total)}</span>
              </span>
            ))}
          </div>
        )}

        {(sales.cancelledCount > 0 || sales.cardCommissions > 0) && (
          <p className="text-meta text-ink-muted">
            {sales.cancelledCount > 0 && `${sales.cancelledCount} anulada${sales.cancelledCount !== 1 ? 's' : ''}`}
            {sales.cancelledCount > 0 && sales.cardCommissions > 0 && ' · '}
            {sales.cardCommissions > 0 && `Comisión tarjeta cobrada: ${formatCurrency(sales.cardCommissions)}`}
          </p>
        )}

        {sales.recent.length > 0 ? (
          <div className="flex flex-col gap-0.5 border-t border-line pt-3">
            {sales.recent.map((s) => (
              <Link
                key={s.id}
                to={`/sales/${s.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-table hover:bg-surface-2"
              >
                <span>
                  {s.saleNumber}
                  <span className="ml-2 text-meta text-ink-muted">
                    {s.itemsCount} producto{s.itemsCount !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-meta text-ink-muted">{limaTime(s.createdAt)}</span>
                  <span className="font-semibold">{formatCurrency(s.totalAmount)}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="border-t border-line pt-3 text-center text-table text-ink-muted">Aún no tienes ventas hoy</p>
        )}
      </CardContent>
    </Card>
  );
}
