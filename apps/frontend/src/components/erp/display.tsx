// Piezas de lectura: encabezado de página, bloque con cabecera, pestañas,
// indicador con comparación, estado con punto y estado vacío.
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Encabezado de página ──────────────────────────────────────────────────
export function PageHeader({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Bloque con cabecera: da "cuerpo" a cada espacio ─────────────────────────
export const surfaceCls = 'rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_1px_2px_rgba(0,0,0,.04)]';

export function Panel({
  title, meta, actions, children, className, bodyClassName,
}: {
  title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden', surfaceCls, className)}>
      <header className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2">
        <h2 className="text-body font-semibold text-ink">{title}</h2>
        {meta && <span className="text-meta text-ink-muted">{meta}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// ── Pestañas de módulo ──────────────────────────────────────────────────────
export function PageTabs<T extends string>({
  value, onChange, tabs,
}: { value: T; onChange: (v: T) => void; tabs: readonly (readonly [T, React.ReactNode, React.ReactNode?])[] }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto p-1', surfaceCls)}>
      {tabs.map(([k, label, extra]) => (
        <button
          key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn(
            'tap flex h-8 shrink-0 items-center gap-1.5 rounded-ctl px-3 text-table transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            value === k ? 'bg-ink font-medium text-white' : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
          )}
        >
          {label}
          {extra != null && extra !== false && (
            <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', value === k ? 'bg-white/20' : 'bg-ink/[0.07] text-ink')}>{extra}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Estado: fondo neutro, texto oscuro y punto de color ─────────────────────
export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'muted';
const dot: Record<Tone, string> = {
  ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', neutral: 'bg-ink/50', muted: 'bg-ink-muted/40',
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex h-[22px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-ink/[0.05] pl-2 pr-2.5 text-meta font-medium',
      tone === 'muted' ? 'text-ink-muted' : 'text-ink', className,
    )}>
      <span className={cn('size-1.5 shrink-0 rounded-full', dot[tone])} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

// ── Indicador con comparación ──────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 96, h = 28;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden shrink-0 text-ink-muted/50 xl:block" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" className="fill-ink" />
    </svg>
  );
}

export function StatCard({
  label, value, delta, compare, goodWhenUp = true, series, hint,
}: {
  label: React.ReactNode; value: React.ReactNode;
  /** Variación en % frente al periodo de comparación. */
  delta?: number | null; compare?: React.ReactNode; goodWhenUp?: boolean; series?: number[]; hint?: React.ReactNode;
}) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const up = (delta ?? 0) >= 0;
  const good = up === goodWhenUp;
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5">
      <div className="truncate text-meta text-ink-muted">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="whitespace-nowrap text-kpi font-semibold tabular-nums tracking-tight text-ink">{value}</div>
        {series && <Sparkline data={series} />}
      </div>
      {hasDelta ? (
        <div className="flex flex-wrap items-center gap-x-1 text-meta">
          <span className={cn('inline-flex items-center font-medium tabular-nums', good ? 'text-ok-ink' : 'text-bad-ink')}>
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta as number).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%
          </span>
          {compare && <span className="truncate text-ink-muted">{compare}</span>}
        </div>
      ) : hint ? <div className="truncate text-meta text-ink-muted">{hint}</div> : null}
    </div>
  );
}

/** Fila de indicadores unidos por una línea fina. */
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn(
      'grid grid-cols-2 gap-px overflow-hidden bg-line', surfaceCls,
      cols === 3 && 'lg:grid-cols-3', cols === 4 && 'lg:grid-cols-4',
    )}>
      {children}
    </div>
  );
}

// ── Vacío: una línea y una acción ──────────────────────────────────────────
export function EmptyState({ icon: Icon, title, action, className }: {
  icon?: React.ComponentType<{ className?: string }>; title: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}>
      {Icon && <Icon className="size-5 text-ink-muted" />}
      <div className="text-body text-ink">{title}</div>
      {action}
    </div>
  );
}
