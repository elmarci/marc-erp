// Estado de resultados del período, comparado con el período anterior.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fieldCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, todayLimaDateString } from '@/lib/utils';
import { money } from './AdministrationPage';

/* ─── Estado de resultados ───────────────────────────────────────────────── */

interface PeriodFigures {
  grossSales: number; returns: number; netSales: number; cogs: number; grossProfit: number; grossMarginPercent: number;
  expenses: number; inventoryLosses: number; deliveryIncome: number; riderPayments: number; deliveryNet: number;
  netProfit: number; netMarginPercent: number; tickets: number; itemsWithoutCost: number; cardCommissionCollected: number;
  expensesByCategory: { category: string; name: string | null; total: number; count: number }[];
  lossesByReason: { code: string; label: string; total: number; count: number }[];
  otherAdjustments: { code: string | null; label: string; direction: 'IN' | 'OUT'; total: number; count: number }[];
  autoAdjustments: { total: number; count: number };
}
interface IncomeStatement {
  range: { from: string; to: string }; previousRange: { from: string; to: string };
  current: PeriodFigures; previous: PeriodFigures;
  change: Record<string, number | null>;
  warnings: string[];
}

const EXPENSE_LABELS: Record<string, string> = {
  PERSONNEL: 'Personal', BAGS: 'Bolsas', TRANSPORT: 'Transporte', SYSTEM: 'Sistema', WATER: 'Agua',
  ELECTRICITY: 'Electricidad', RENT: 'Alquiler', TAXES: 'Impuestos (cuota SUNAT)', OTHER: 'Otros',
};

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function presetRange(preset: string): { from: string; to: string } {
  const today = todayLimaDateString();
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'week': return { from: shiftDate(today, -6), to: today };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
    }
    default: return { from: `${y}-${pad(m)}-01`, to: today };
  }
}
const shortDate = (iso: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' }).format(new Date(iso));

export function IncomeTab() {
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presetRange('month'));
  const { data, isLoading } = useQuery({
    queryKey: ['admin-income', range.from, range.to],
    queryFn: async () => (await api.get<{ data: IncomeStatement }>(`/administration/income-statement?from=${range.from}&to=${range.to}`)).data.data,
    enabled: !!range.from && !!range.to && range.from <= range.to,
  });

  const choosePreset = (p: string) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="income-period">Período</label>
          <select id="income-period" className={fieldCls} value={preset} onChange={(e) => choosePreset(e.target.value)}>
            <option value="month">Este mes, hasta hoy</option>
            <option value="lastMonth">Mes pasado</option>
            <option value="week">Últimos 7 días</option>
            <option value="today">Hoy</option>
            <option value="custom">Otras fechas</option>
          </select>
        </div>
        {preset === 'custom' && (
          <>
            <div>
              <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="income-from">Desde</label>
              <input id="income-from" className={fieldCls} type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="income-to">Hasta</label>
              <input id="income-to" className={fieldCls} type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </>
        )}
      </div>

      {isLoading || !data ? <p className="py-10 text-table text-ink-muted">Cargando…</p> : <IncomeBody data={data} />}
    </div>
  );
}

function IncomeBody({ data }: { data: IncomeStatement }) {
  const { current: c, previous: p, change } = data;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const prevLabel = `${shortDate(data.previousRange.from)} – ${shortDate(data.previousRange.to)}`;

  // good = "subir es bueno" (ventas, utilidad); en costos y gastos subir es malo.
  const Row = ({ label, cur, prev, pct, sign = '', strong, good = true, hint, toggleKey, indent }: {
    label: string; cur: number; prev?: number; pct?: number | null; sign?: '' | '−' | '+'; strong?: boolean; good?: boolean;
    hint?: string; toggleKey?: string; indent?: boolean;
  }) => (
    <tr className={cn(strong && 'border-t border-line font-semibold', indent && 'text-ink-muted')}>
      <td className={cn('py-2 pr-4', indent && 'pl-6')}>
        {toggleKey ? (
          <button className="text-left underline decoration-dotted underline-offset-4" onClick={() => toggle(toggleKey)} aria-expanded={!!open[toggleKey]}>
            {label}
          </button>
        ) : label}
        {hint && <span className="ml-2 font-normal text-ink-muted">{hint}</span>}
      </td>
      <td className={cn('whitespace-nowrap py-2 pr-4 text-right tabular-nums', strong && cur < 0 && 'text-bad-ink')}>
        {sign && cur !== 0 ? `${sign} ${formatCurrency(Math.abs(cur))}` : money(cur)}
      </td>
      <td className="hidden py-2 pr-4 text-right tabular-nums text-ink-muted sm:table-cell">{prev === undefined ? '' : sign ? formatCurrency(Math.abs(prev)) : money(prev)}</td>
      <td className={cn('whitespace-nowrap py-2 text-right tabular-nums', pct == null || pct === 0 ? 'text-ink-muted'
        : (pct > 0) === good ? 'text-ok-ink' : 'text-bad-ink')}>
        {pct == null ? '' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)} %`}
      </td>
    </tr>
  );

  const hasDelivery = c.deliveryIncome !== 0 || c.riderPayments !== 0 || p.deliveryIncome !== 0 || p.riderPayments !== 0;
  const outAdj = c.otherAdjustments.filter((a) => a.direction === 'OUT');
  const inAdj = c.otherAdjustments.filter((a) => a.direction === 'IN');

  return (
    <div className="space-y-8">
      {data.warnings.length > 0 && (
        <div className="rounded-srf border border-line bg-surface p-4 shadow-[inset_3px_0_0_hsl(var(--warn))]">
          <p className="text-table font-semibold text-ink">Antes de confiar en este resultado</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-table">
            {data.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full max-w-3xl text-table">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="py-2 pr-4 font-medium">{shortDate(data.range.from)} – {shortDate(data.range.to)}</th>
              <th className="py-2 pr-4 text-right font-medium">Este período</th>
              <th className="hidden py-2 pr-4 text-right font-medium sm:table-cell">Anterior<span className="block text-meta font-normal">{prevLabel}</span></th>
              <th className="py-2 text-right font-medium">Cambio</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Ventas" hint={`${c.tickets} tickets`} cur={c.grossSales} prev={p.grossSales} pct={change.grossSales} />
            <Row label="Devoluciones" sign="−" cur={c.returns} prev={p.returns} pct={change.returns} good={false} />
            <Row label="Ventas netas" strong cur={c.netSales} prev={p.netSales} pct={change.netSales} />
            <Row label="Costo de lo vendido" sign="−" cur={c.cogs} prev={p.cogs} pct={change.cogs} good={false} />
            <Row label="Utilidad bruta" hint={`${c.grossMarginPercent.toFixed(1)} % de margen`} strong cur={c.grossProfit} prev={p.grossProfit} pct={change.grossProfit} />

            <Row label="Gastos" sign="−" cur={c.expenses} prev={p.expenses} pct={change.expenses} good={false}
              toggleKey={c.expensesByCategory.length > 0 ? 'expenses' : undefined} />
            {open.expenses && c.expensesByCategory.map((e) => (
              <Row key={`${e.category}-${e.name}`} indent label={e.name ?? EXPENSE_LABELS[e.category] ?? e.category} cur={e.total} />
            ))}

            <Row label="Mermas de inventario" sign="−" cur={c.inventoryLosses} prev={p.inventoryLosses} pct={change.inventoryLosses} good={false}
              toggleKey={c.lossesByReason.length > 0 ? 'losses' : undefined} />
            {open.losses && c.lossesByReason.map((l) => (
              <Row key={l.code} indent label={l.label} hint={`${l.count} ${l.count === 1 ? 'ajuste' : 'ajustes'}`} cur={l.total} />
            ))}

            {hasDelivery && (
              <Row label="Envíos cobrados menos pago a repartidores" sign={c.deliveryNet < 0 ? '−' : '+'} cur={c.deliveryNet} prev={p.deliveryNet} pct={change.deliveryNet} />
            )}

            <tr className="border-t-2 border-line-strong text-section font-semibold">
              <td className="py-3 pr-4">Utilidad neta <span className="ml-2 text-table font-normal text-ink-muted">{c.netMarginPercent.toFixed(1)} % de las ventas</span></td>
              <td className={cn('whitespace-nowrap py-3 pr-4 text-right tabular-nums', c.netProfit < 0 && 'text-bad-ink')}>{money(c.netProfit)}</td>
              <td className="hidden py-3 pr-4 text-right font-normal tabular-nums text-ink-muted sm:table-cell">{money(p.netProfit)}</td>
              <td className={cn('whitespace-nowrap py-3 text-right text-table font-normal tabular-nums', change.netProfit == null ? '' : change.netProfit >= 0 ? 'text-ok-ink' : 'text-bad-ink')}>
                {change.netProfit == null ? '' : `${change.netProfit > 0 ? '+' : ''}${change.netProfit.toFixed(1)} %`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {(outAdj.length > 0 || inAdj.length > 0 || c.autoAdjustments.count > 0 || c.cardCommissionCollected > 0) && (
        <section className="max-w-3xl">
          <h2 className="text-section font-semibold">Fuera del resultado</h2>
          <p className="mt-1 text-table text-ink-muted">
            Correcciones del registro de inventario. No se cuentan como pérdida ni como ganancia, pero conviene revisarlas.
          </p>
          <ul className="mt-3 divide-y divide-line text-table">
            {outAdj.map((a) => (
              <li key={`o${a.code}`} className="flex justify-between gap-4 py-2">
                <span>Stock dado de baja · {a.label} <span className="text-ink-muted">({a.count})</span></span>
                <span className="tabular-nums">{formatCurrency(a.total)}</span>
              </li>
            ))}
            {inAdj.map((a) => (
              <li key={`i${a.code}`} className="flex justify-between gap-4 py-2">
                <span>Stock agregado · {a.label} <span className="text-ink-muted">({a.count})</span></span>
                <span className="tabular-nums">{formatCurrency(a.total)}</span>
              </li>
            ))}
            {c.autoAdjustments.count > 0 && (
              <li className="flex justify-between gap-4 py-2">
                <span>Ventas sin stock en el sistema (compras sin registrar) <span className="text-ink-muted">({c.autoAdjustments.count})</span></span>
                <span className="tabular-nums">{formatCurrency(c.autoAdjustments.total)}</span>
              </li>
            )}
            {c.cardCommissionCollected > 0 && (
              <li className="flex justify-between gap-4 py-2">
                <span>Comisión de tarjeta cobrada al cliente (se va en la comisión del POS)</span>
                <span className="tabular-nums">{formatCurrency(c.cardCommissionCollected)}</span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

