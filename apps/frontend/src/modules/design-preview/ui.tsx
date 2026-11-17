// Piezas base del concepto. En el paso 2 pasan a components/ui con estos
// mismos nombres y medidas; aquí viven juntas para poder aprobarlas.
import { forwardRef } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Estado } from './data';

// ── Botón ────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export const Btn = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Btn({ variant = 'secondary', size = 'md', className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'tap inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        size === 'md' ? 'h-9 px-3 text-body' : 'h-8 px-2.5 text-table',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-hover',
        variant === 'secondary' && 'bg-surface text-ink shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:bg-bad-ink',
        className,
      )}
      {...rest}
    />
  );
});

// ── Estado: fondo neutro, texto oscuro, punto de color ─────────────────────
const estadoInfo: Record<Estado, { label: string; dot: string }> = {
  pagada: { label: 'Pagada', dot: 'bg-ok' },
  por_pagar: { label: 'Por pagar', dot: 'bg-warn' },
  parcial: { label: 'Pago parcial', dot: 'bg-warn' },
  vencida: { label: 'Vencida', dot: 'bg-bad' },
  anulada: { label: 'Anulada', dot: 'bg-ink-muted/40' },
};

export function StatusBadge({ estado }: { estado: Estado }) {
  const info = estadoInfo[estado];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full bg-ink/[0.05] pl-2 pr-2.5 text-meta font-medium text-ink',
        estado === 'anulada' && 'text-ink-muted',
      )}
    >
      <span className={cn('size-1.5 rounded-full', info.dot)} aria-hidden />
      {info.label}
    </span>
  );
}

// ── Indicador con comparación ─────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  const w = 96, h = 28;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 2 - ((v - min) / (max - min || 1)) * (h - 4),
  ]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-ink-muted/50" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" className="fill-ink" />
    </svg>
  );
}

export function StatCard({
  label, value, delta, compare, goodWhenUp = true, series,
}: {
  label: string;
  value: string;
  delta?: number; // % frente al periodo anterior
  compare?: string;
  goodWhenUp?: boolean;
  series?: number[];
}) {
  const up = (delta ?? 0) >= 0;
  const good = up === goodWhenUp;
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5">
      <div className="text-meta text-ink-muted">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="whitespace-nowrap text-kpi font-semibold tabular-nums tracking-tight text-ink">{value}</div>
        {series && <span className="hidden xl:block"><Sparkline data={series} /></span>}
      </div>
      {delta !== undefined && (
        <div className="flex flex-wrap items-center gap-x-1 text-meta">
          <span className={cn('inline-flex items-center font-medium tabular-nums', good ? 'text-ok-ink' : 'text-bad-ink')}>
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%
          </span>
          <span className="truncate text-ink-muted">{compare}</span>
        </div>
      )}
    </div>
  );
}

// ── Campos ────────────────────────────────────────────────────────────────
export const fieldCls =
  'h-9 w-full rounded-ctl bg-surface px-2.5 text-table text-ink shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] ' +
  'placeholder:text-ink-muted/70 focus:outline-none focus:shadow-[inset_0_0_0_1px_hsl(var(--brand)),0_0_0_3px_hsl(var(--brand)/0.15)]';

export function Field({
  label, hint, error, children, className,
}: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-table font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="text-meta text-bad-ink">{error}</span>
      ) : hint ? (
        <span className="text-meta text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Check({
  checked, indeterminate, onChange, label,
}: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        'grid size-4 place-items-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        checked || indeterminate ? 'bg-brand text-white' : 'bg-surface shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]',
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded bg-white" />
      ) : checked ? (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg>
      ) : null}
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] bg-ink/[0.06] px-1.5 py-px font-sans text-[11px] font-medium text-ink-muted">
      {children}
    </kbd>
  );
}
