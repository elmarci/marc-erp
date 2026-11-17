import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDateTime, todayLimaDateString } from '@/lib/utils';

type LimitStatus = 'OK' | 'WARNING' | 'OVER';
type Tab = 'regime' | 'income' | 'audit';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
// Negativos con el signo delante del símbolo, no pegado al número.
const money = (n: number) => (n < 0 ? `− ${formatCurrency(-n)}` : formatCurrency(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AdministrationPage() {
  const [tab, setTab] = useState<Tab>('regime');
  const tabs: [Tab, string][] = [['regime', 'Tope del régimen'], ['income', 'Estado de resultados'], ['audit', 'Historial de cambios']];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Administración</h1>
        <p className="text-sm text-muted-foreground">Los números del negocio y el registro de quién cambió qué.</p>
      </div>

      <div className="flex gap-6 border-b overflow-x-auto" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn('-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition-colors',
              tab === key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'regime' && <RegimeTab />}
      {tab === 'income' && <IncomeTab />}
      {tab === 'audit' && <AuditTab />}
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
const statusColor = (s: LimitStatus) => (s === 'OVER' ? 'text-destructive' : s === 'WARNING' ? 'text-warning' : 'text-muted-foreground');
const barColor = (s: LimitStatus) => (s === 'OVER' ? 'bg-destructive' : s === 'WARNING' ? 'bg-warning' : 'bg-primary');

function Meter({ label, amount, limit, percent, status, detail }: {
  label: string; amount: number; limit: number; percent: number; status: LimitStatus; detail?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-medium', statusColor(status))}>{STATUS_TEXT[status]}</p>
      </div>
      <p className="mt-1 text-3xl font-bold tabular-nums">{formatCurrency(amount)}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
        aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full', barColor(status))} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">
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

  if (isLoading || !data) return <p className="py-10 text-sm text-muted-foreground">Cargando…</p>;
  const { current, limits, months, yearTotals, monthsOver } = data;
  const left = (amount: number) => {
    const rest = limits.monthly - amount;
    return rest >= 0 ? `quedan ${formatCurrency(rest)}` : `${formatCurrency(-rest)} de más`;
  };

  return (
    <div className="space-y-8">
      {monthsOver.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-semibold text-destructive">
            Pasaste el tope del {data.regime} en {monthsOver.length} {monthsOver.length === 1 ? 'mes' : 'meses'} de {data.year}: {monthsOver.map(monthName).join(', ')}.
          </p>
          <p className="mt-1 text-sm">
            El {data.regime} permite hasta {formatCurrency(limits.monthly)} al mes en ventas y también en compras. Consulta con un contador qué régimen te corresponde y desde cuándo.
          </p>
        </div>
      )}

      {current && (
        <section>
          <h2 className="text-base font-semibold">{cap(monthName(current.month))} {data.year}, hasta hoy</h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2">
            <Meter label="Ventas del mes" amount={current.sales} limit={limits.monthly} percent={current.salesPercent}
              status={current.salesStatus} detail={left(current.sales)} />
            <Meter label="Compras del mes" amount={current.purchases} limit={limits.monthly} percent={current.purchasesPercent}
              status={current.purchasesStatus} detail={left(current.purchases)} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold">Mes por mes</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Mes</th>
                <th className="py-2 pr-4 text-right font-medium">Ventas</th>
                <th className="py-2 pr-4 font-medium">Frente al tope</th>
                <th className="py-2 pr-4 text-right font-medium">Compras</th>
                <th className="py-2 font-medium">Frente al tope</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...months].reverse().filter((m) => m.sales > 0 || m.purchases > 0 || m.isCurrent).map((m) => (
                <tr key={m.month}>
                  <td className="py-2.5 pr-4">{cap(monthName(m.month))}{m.isCurrent && <span className="text-muted-foreground"> (en curso)</span>}</td>
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
              <tr className="border-t-2 font-semibold">
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

      <p className="max-w-2xl text-sm text-muted-foreground">
        Ventas: lo vendido en caja y en la tienda online, menos devoluciones. Compras: la mercadería recibida y no anulada, con su IGV.
        Avisa desde el {limits.alertPercent} % del tope. Los topes se cambian en <Link to="/settings" className="underline underline-offset-2">Configuración</Link>.
      </p>
    </div>
  );
}

/* ─── Estado de resultados ───────────────────────────────────────────────── */

interface PeriodFigures {
  grossSales: number; returns: number; netSales: number; cogs: number; grossProfit: number; grossMarginPercent: number;
  expenses: number; inventoryLosses: number; deliveryIncome: number; riderPayments: number; deliveryNet: number;
  netProfit: number; netMarginPercent: number; tickets: number; itemsWithoutCost: number; cardCommissionCollected: number;
  expensesByCategory: { category: string; total: number; count: number }[];
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

function IncomeTab() {
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
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="income-period">Período</label>
          <Select id="income-period" value={preset} onChange={(e) => choosePreset(e.target.value)}>
            <option value="month">Este mes, hasta hoy</option>
            <option value="lastMonth">Mes pasado</option>
            <option value="week">Últimos 7 días</option>
            <option value="today">Hoy</option>
            <option value="custom">Otras fechas</option>
          </Select>
        </div>
        {preset === 'custom' && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="income-from">Desde</label>
              <Input id="income-from" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="income-to">Hasta</label>
              <Input id="income-to" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </>
        )}
      </div>

      {isLoading || !data ? <p className="py-10 text-sm text-muted-foreground">Cargando…</p> : <IncomeBody data={data} />}
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
    <tr className={cn(strong && 'border-t font-semibold', indent && 'text-muted-foreground')}>
      <td className={cn('py-2 pr-4', indent && 'pl-6')}>
        {toggleKey ? (
          <button className="text-left underline decoration-dotted underline-offset-4" onClick={() => toggle(toggleKey)} aria-expanded={!!open[toggleKey]}>
            {label}
          </button>
        ) : label}
        {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
      </td>
      <td className={cn('whitespace-nowrap py-2 pr-4 text-right tabular-nums', strong && cur < 0 && 'text-destructive')}>
        {sign && cur !== 0 ? `${sign} ${formatCurrency(Math.abs(cur))}` : money(cur)}
      </td>
      <td className="hidden py-2 pr-4 text-right tabular-nums text-muted-foreground sm:table-cell">{prev === undefined ? '' : sign ? formatCurrency(Math.abs(prev)) : money(prev)}</td>
      <td className={cn('whitespace-nowrap py-2 text-right tabular-nums', pct == null || pct === 0 ? 'text-muted-foreground'
        : (pct > 0) === good ? 'text-primary' : 'text-destructive')}>
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
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="font-semibold">Antes de confiar en este resultado</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {data.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{shortDate(data.range.from)} – {shortDate(data.range.to)}</th>
              <th className="py-2 pr-4 text-right font-medium">Este período</th>
              <th className="hidden py-2 pr-4 text-right font-medium sm:table-cell">Anterior<span className="block text-xs font-normal">{prevLabel}</span></th>
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
              <Row key={e.category} indent label={EXPENSE_LABELS[e.category] ?? e.category} cur={e.total} />
            ))}

            <Row label="Mermas de inventario" sign="−" cur={c.inventoryLosses} prev={p.inventoryLosses} pct={change.inventoryLosses} good={false}
              toggleKey={c.lossesByReason.length > 0 ? 'losses' : undefined} />
            {open.losses && c.lossesByReason.map((l) => (
              <Row key={l.code} indent label={l.label} hint={`${l.count} ${l.count === 1 ? 'ajuste' : 'ajustes'}`} cur={l.total} />
            ))}

            {hasDelivery && (
              <Row label="Envíos cobrados menos pago a repartidores" sign={c.deliveryNet < 0 ? '−' : '+'} cur={c.deliveryNet} prev={p.deliveryNet} pct={change.deliveryNet} />
            )}

            <tr className="border-t-2 text-base font-bold">
              <td className="py-3 pr-4">Utilidad neta <span className="ml-2 text-sm font-normal text-muted-foreground">{c.netMarginPercent.toFixed(1)} % de las ventas</span></td>
              <td className={cn('whitespace-nowrap py-3 pr-4 text-right tabular-nums', c.netProfit < 0 && 'text-destructive')}>{money(c.netProfit)}</td>
              <td className="hidden py-3 pr-4 text-right font-normal tabular-nums text-muted-foreground sm:table-cell">{money(p.netProfit)}</td>
              <td className={cn('whitespace-nowrap py-3 text-right text-sm font-normal tabular-nums', change.netProfit == null ? '' : change.netProfit >= 0 ? 'text-primary' : 'text-destructive')}>
                {change.netProfit == null ? '' : `${change.netProfit > 0 ? '+' : ''}${change.netProfit.toFixed(1)} %`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {(outAdj.length > 0 || inAdj.length > 0 || c.autoAdjustments.count > 0 || c.cardCommissionCollected > 0) && (
        <section className="max-w-3xl">
          <h2 className="text-base font-semibold">Fuera del resultado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Correcciones del registro de inventario. No se cuentan como pérdida ni como ganancia, pero conviene revisarlas.
          </p>
          <ul className="mt-3 divide-y text-sm">
            {outAdj.map((a) => (
              <li key={`o${a.code}`} className="flex justify-between gap-4 py-2">
                <span>Stock dado de baja · {a.label} <span className="text-muted-foreground">({a.count})</span></span>
                <span className="tabular-nums">{formatCurrency(a.total)}</span>
              </li>
            ))}
            {inAdj.map((a) => (
              <li key={`i${a.code}`} className="flex justify-between gap-4 py-2">
                <span>Stock agregado · {a.label} <span className="text-muted-foreground">({a.count})</span></span>
                <span className="tabular-nums">{formatCurrency(a.total)}</span>
              </li>
            ))}
            {c.autoAdjustments.count > 0 && (
              <li className="flex justify-between gap-4 py-2">
                <span>Ventas sin stock en el sistema (compras sin registrar) <span className="text-muted-foreground">({c.autoAdjustments.count})</span></span>
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

/* ─── Historial de cambios ───────────────────────────────────────────────── */

interface AuditRow {
  id: string; action: string; resource: string; resourceId: string | null; createdAt: string;
  oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null;
  metadata: { label?: string | null } | null;
  user: { firstName: string; lastName: string; username: string } | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  Product: 'Producto', Category: 'Categoría', Brand: 'Marca', Supplier: 'Proveedor', Customer: 'Cliente', User: 'Usuario',
  Setting: 'Configuración', Promotion: 'Oferta', Expense: 'Gasto', RecurringExpenseTemplate: 'Gasto recurrente',
  CashRegister: 'Caja', DocumentSeries: 'Serie de comprobante', TaxRate: 'Impuesto', Payer: 'Pagador', Batch: 'Lote',
  Rider: 'Repartidor', auth: 'Sesión',
};
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó', VOID: 'Anuló', LOGIN: 'Inició sesión', LOGOUT: 'Cerró sesión',
};
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', salePrice: 'Precio de venta', wholesalePrice: 'Precio mayorista', packPrice: 'Precio por paquete',
  packSize: 'Unidades por paquete', minStock: 'Stock mínimo', status: 'Estado', barcode: 'Código de barras',
  categoryId: 'Categoría', supplierId: 'Proveedor', description: 'Descripción', amount: 'Monto', category: 'Categoría',
  expenseDate: 'Fecha del gasto', value: 'Valor', role: 'Rol', isActive: 'Activo', creditLimit: 'Límite de crédito',
  phone: 'Teléfono', email: 'Correo', expiryDate: 'Vencimiento', trackExpiry: 'Controla vencimiento',
  passwordHash: 'Contraseña', pin: 'PIN', voidReason: 'Motivo de anulación', bottleDeposit: 'Garantía de envase',
  isFavorite: 'Favorito', storeFeatured: 'Destacado en tienda', imageUrl: 'Foto', workSchedule: 'Horario',
  firstName: 'Nombre', lastName: 'Apellido', businessName: 'Razón social', taxId: 'RUC/DNI', method: 'Método',
};
const HIDDEN_FIELDS = new Set(['voidedAt', 'voidedById', 'deletedAt', 'id', 'userId']);
const MONEY_FIELDS = new Set(['salePrice', 'wholesalePrice', 'packPrice', 'amount', 'creditLimit', 'bottleDeposit']);

function showValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'vacío';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return formatCurrency(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  if (typeof v === 'object') return 'actualizado';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function AuditTab() {
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), limit: '30' });
    if (resource) q.set('resource', resource);
    if (action) q.set('action', action);
    if (search.trim().length >= 2) q.set('search', search.trim());
    return q.toString();
  }, [resource, action, search, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', params],
    queryFn: async () => (await api.get<{ data: AuditRow[]; resources: string[]; pagination: { total: number; totalPages: number } }>(`/administration/audit-log?${params}`)).data,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="audit-resource">Qué se cambió</label>
          <Select id="audit-resource" value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }}>
            <option value="">Todo</option>
            {(data?.resources ?? []).map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r] ?? r}</option>)}
            <option value="auth">Sesiones</option>
          </Select>
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="audit-action">Acción</label>
          <Select id="audit-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {['CREATE', 'UPDATE', 'DELETE', 'VOID'].map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="audit-search">Buscar por nombre</label>
          <Input id="audit-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ej: Leche Gloria" />
        </div>
      </div>

      {isLoading || !data ? <p className="py-10 text-sm text-muted-foreground">Cargando…</p> : data.data.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">
          Aún no hay cambios registrados con estos filtros. Desde ahora, cada cambio de precio, producto, cliente, gasto o configuración queda anotado aquí.
        </p>
      ) : (
        <ul className="divide-y">
          {data.data.map((row) => {
            const fields = row.action === 'UPDATE' || row.action === 'VOID'
              ? Object.keys(row.newValues ?? {}).filter((f) => !HIDDEN_FIELDS.has(f)) : [];
            return (
              <li key={row.id} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[150px_1fr]">
                <div className="text-muted-foreground">
                  <p className="tabular-nums">{formatDateTime(row.createdAt)}</p>
                  <p>{row.user ? `${row.user.firstName} ${row.user.lastName}` : 'Sistema'}</p>
                </div>
                <div>
                  <p>
                    <span className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</span>
                    {row.resource !== 'auth' && <> {(RESOURCE_LABELS[row.resource] ?? row.resource).toLowerCase()}</>}
                    {row.metadata?.label && <span className="font-medium"> {row.metadata.label}</span>}
                  </p>
                  {fields.map((f) => (
                    <p key={f} className="text-muted-foreground">
                      {FIELD_LABELS[f] ?? f}: {showValue(f, row.oldValues?.[f])} <span aria-hidden>→</span>{' '}
                      <span className="text-foreground">{showValue(f, row.newValues?.[f])}</span>
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.pagination.total} cambios · página {page} de {data.pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((n) => n + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}
