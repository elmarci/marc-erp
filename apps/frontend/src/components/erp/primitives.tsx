// Piezas mínimas del rediseño (Fase 5): botón, campo, casilla, interruptor,
// selector segmentado y tecla. Medidas: controles de 32–36 px en PC; en
// pantallas táctiles la clase .tap los sube a 44 px (ver index.css).
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'md';

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
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
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
});

export const fieldCls =
  'h-9 w-full rounded-ctl bg-surface px-2.5 text-table text-ink shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] ' +
  'placeholder:text-ink-muted/70 focus:outline-none focus:shadow-[inset_0_0_0_1px_hsl(var(--brand)),0_0_0_3px_hsl(var(--brand)/0.15)] ' +
  'disabled:bg-surface-2 disabled:text-ink-muted';

export const invalidCls = 'shadow-[inset_0_0_0_1px_hsl(var(--bad))]';

/** Etiqueta + control + ayuda o error. La ayuda solo cuando evita un error real. */
export function Field({
  label, hint, error, children, className, required,
}: {
  label: string; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; required?: boolean;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-table font-medium text-ink">
        {label}{required && <span className="ml-0.5 text-bad-ink" aria-hidden>*</span>}
      </span>
      {children}
      {error ? <span className="text-meta text-bad-ink">{error}</span>
        : hint ? <span className="text-meta text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function Check({
  checked, indeterminate, onChange, label, disabled,
}: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40',
        checked || indeterminate ? 'bg-brand text-white' : 'bg-surface shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]',
      )}
    >
      {indeterminate ? <span className="h-0.5 w-2 rounded bg-white" />
        : checked ? <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2.5 6.2 2.3 2.3 4.7-5" /></svg>
        : null}
    </button>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50', on ? 'bg-brand' : 'bg-ink/20')}
    >
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

/** Selector de 2 a 5 opciones excluyentes (filtros rápidos, forma de pago). */
export function Segmented<T extends string>({
  value, onChange, options, size = 'sm', className, ariaLabel,
}: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, React.ReactNode])[];
  size?: 'sm' | 'md'; className?: string; ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className={cn('flex max-w-full gap-0.5 overflow-x-auto rounded-ctl bg-ink/[0.05] p-0.5', className)}>
      {options.map(([k, label]) => (
        <button
          key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cn(
            'flex-auto shrink-0 whitespace-nowrap rounded-[5px] px-2.5 text-table transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            size === 'md' ? 'h-8' : 'h-7',
            value === k ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] bg-ink/[0.06] px-1.5 py-px font-sans text-[11px] font-medium text-ink-muted">{children}</kbd>
  );
}
