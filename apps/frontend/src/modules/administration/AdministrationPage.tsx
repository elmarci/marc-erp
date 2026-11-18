// Administración: tope del régimen (NRUS), estado de resultados e historial
// de cambios.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader, PageTabs, surfaceCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency } from '@/lib/utils';
import { IncomeTab } from './IncomeTab';
import { AuditTab } from './AuditTab';

type LimitStatus = 'OK' | 'WARNING' | 'OVER';
type Tab = 'regime' | 'income' | 'audit';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
// Negativos con el signo delante del símbolo, no pegado al número.
export const money = (n: number) => (n < 0 ? `− ${formatCurrency(-n)}` : formatCurrency(n));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AdministrationPage() {
  const [tab, setTab] = useState<Tab>('regime');

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Administración">
        <p className="text-table text-ink-muted">Los números del negocio y el registro de quién cambió qué.</p>
      </PageHeader>
      <PageTabs value={tab} onChange={setTab} tabs={[['regime', 'Tope del régimen'], ['income', 'Estado de resultados'], ['audit', 'Historial de cambios']]} />
      <div className={cn('p-4 sm:p-5', surfaceCls)}>
        {tab === 'regime' && <RegimeTab />}
        {tab === 'income' && <IncomeTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

/* ─── Tope del régimen (NRUS) ────────────────────────────────────────────── */

interface RegimeMonth {
  month: string; isCurrent: boolean;
  sales: number; salesTickets: number; salesPercent: number; salesStatus: LimitStatus;
  purchases: number; purchaseOrders: number; purchasesPercent: number; purchasesStatus: LimitStatus;
}
interface RegimeControl {
  regime: string; year: number;
  limits: { monthly: number; annual: number; alertPercent: number };
  current: RegimeMonth | null;
  months: RegimeMonth[];
  yearTotals: { sales: number; salesPercent: number; salesStatus: LimitStatus; purchases: number; purchasesPercent: number; purchasesStatus: LimitStatus };
  monthsOver: string[];
}

const STATUS_TEXT: Record<LimitStatus, string> = { OK: 'Dentro del tope', WARNING: 'Cerca del tope', OVER: 'Pasó el tope' };
const statusColor = (s: LimitStatus) => (s === 'OVER' ? 'text-bad-ink' : s === 'WARNING' ? 'text-warn-ink' : 'text-ink-muted');
const barColor = (s: LimitStatus) => (s === 'OVER' ? 'bg-bad' : s === 'WARNING' ? 'bg-warn' : 'bg-brand');

function Meter({ label, amount, limit, percent, status, detail }: {
  label: string; amount: number; limit: number; percent: number; status: LimitStatus; detail?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-table text-ink-muted">{label}</p>
        <p className={cn('text-table font-medium', statusColor(status))}>{STATUS_TEXT[status]}</p>
      </div>
      <p className="mt-1 text-kpi font-semibold tabular-nums">{formatCurrency(amount)}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]" role="progressbar"
        aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full', barColor(status))} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-2 text-table text-ink-muted tabular-nums">
        {percent.toFixed(0)} % de {formatCurrency(limit)}{detail ? ` · ${detail}` : ''}
      </p>
    </div>
  );
}

function RegimeTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-regime'],
    queryFn: async () => (await api.get<{ data: RegimeControl }>('/administration/regime-control')).data.data,
  });

  if (isLoading || !data) return <p className="py-10 text-table text-ink-muted">Cargando…</p>;
  const { current, limits, months, yearTotals, monthsOver } = data;
  const left = (amount: number) => {
    const rest = limits.monthly - amount;
    return rest >= 0 ? `quedan ${formatCurrency(rest)}` : `${formatCurrency(-rest)} de más`;
  };

  return (
    <div className="space-y-8">
      {monthsOver.length > 0 && (
        <div className="rounded-srf border border-line bg-surface p-4 shadow-[inset_3px_0_0_hsl(var(--bad))]">
          <p className="text-table font-semibold text-bad-ink">
            Pasaste el tope del {data.regime} en {monthsOver.length} {monthsOver.length === 1 ? 'mes' : 'meses'} de {data.year}: {monthsOver.map(monthName).join(', ')}.
          </p>
          <p className="mt-1 text-table">
            El {data.regime} permite hasta {formatCurrency(limits.monthly)} al mes en ventas y también en compras. Consulta con un contador qué régimen te corresponde y desde cuándo.
          </p>
        </div>
      )}

      {current && (
        <section>
          <h2 className="text-section font-semibold">{cap(monthName(current.month))} {data.year}, hasta hoy</h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <Meter label="Ventas del mes" amount={current.sales} limit={limits.monthly} percent={current.salesPercent}
              status={current.salesStatus} detail={left(current.sales)} />
            <Meter label="Compras del mes" amount={current.purchases} limit={limits.monthly} percent={current.purchasesPercent}
              status={current.purchasesStatus} detail={left(current.purchases)} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-section font-semibold">Mes por mes</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-table">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="py-2 pr-4 font-medium">Mes</th>
                <th className="py-2 pr-4 text-right font-medium">Ventas</th>
                <th className="py-2 pr-4 font-medium">Frente al tope</th>
                <th className="py-2 pr-4 text-right font-medium">Compras</th>
                <th className="py-2 font-medium">Frente al tope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...months].reverse().filter((m) => m.sales > 0 || m.purchases > 0 || m.isCurrent).map((m) => (
                <tr key={m.month}>
                  <td className="py-2.5 pr-4">{cap(monthName(m.month))}{m.isCurrent && <span className="text-ink-muted"> (en curso)</span>}</td>
                  <td className="py-2.5 pr-4 text-right font-medium tabular-nums">{formatCurrency(m.sales)}</td>
                  <td className={cn('py-2.5 pr-4 tabular-nums', statusColor(m.salesStatus))}>
                    {m.salesPercent.toFixed(0)} %{m.salesStatus !== 'OK' && ` · ${STATUS_TEXT[m.salesStatus]}`}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-medium tabular-nums">{formatCurrency(m.purchases)}</td>
                  <td className={cn('py-2.5 tabular-nums', statusColor(m.purchasesStatus))}>
                    {m.purchasesPercent.toFixed(0)} %{m.purchasesStatus !== 'OK' && ` · ${STATUS_TEXT[m.purchasesStatus]}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="py-2.5 pr-4">Año {data.year}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{formatCurrency(yearTotals.sales)}</td>
                <td className={cn('py-2.5 pr-4 font-normal tabular-nums', statusColor(yearTotals.salesStatus))}>
                  {yearTotals.salesPercent.toFixed(0)} % de {formatCurrency(limits.annual)}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{formatCurrency(yearTotals.purchases)}</td>
                <td className={cn('py-2.5 font-normal tabular-nums', statusColor(yearTotals.purchasesStatus))}>
                  {yearTotals.purchasesPercent.toFixed(0)} % de {formatCurrency(limits.annual)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="max-w-2xl text-table text-ink-muted">
        Ventas: lo vendido en caja y en la tienda online, menos devoluciones. Compras: la mercadería recibida y no anulada, con su IGV.
        Avisa desde el {limits.alertPercent} % del tope. Los topes se cambian en <Link to="/settings" className="underline underline-offset-2">Configuración</Link>.
      </p>
    </div>
  );
}

