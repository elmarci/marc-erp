// Piezas chicas que usan varias pantallas de Caja.
import { cn, formatCurrency } from '@/lib/utils';
import { isZero } from './types';

/** Monto con signo opcional; los negativos van en rojo oscuro. */
export function Money({ v, sign, className }: { v: number; sign?: boolean; className?: string }) {
  const n = Number(v);
  return (
    <span className={cn('tabular-nums', sign && n < 0 && !isZero(n) && 'text-bad-ink', className)}>
      {sign && n > 0 && !isZero(n) ? '+' : ''}{n < 0 && !isZero(n) ? '−' : ''}{formatCurrency(Math.abs(n))}
    </span>
  );
}

/** Lista "concepto ... monto" alineada. Las filas sin valor (null/false) no salen. */
export function KeyRows({ rows, className }: { rows: Array<[React.ReactNode, React.ReactNode] | null | false>; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-table', className)}>
      {rows.filter(Boolean).map((r, i) => {
        const [k, v] = r as [React.ReactNode, React.ReactNode];
        return (
          <div key={i} className="contents">
            <span className="text-ink-muted">{k}</span>
            <span className="text-right">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Diferencia de un arqueo: "Cuadra", sobrante (+) o faltante (−). */
export function Diff({ v, className }: { v: number; className?: string }) {
  if (isZero(v)) return <span className={cn('text-ink-muted', className)}>Cuadra</span>;
  return (
    <span className={cn('font-medium tabular-nums', v < 0 ? 'text-bad-ink' : 'text-ink', className)}>
      {v > 0 ? '+' : '−'}{formatCurrency(Math.abs(v))}
    </span>
  );
}
