import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Marca el borde en rojo (monto no cuadra / inválido) o verde (cuadra). */
  state?: 'ok' | 'error';
  /** h-11 por defecto; 'sm' para usarlo dentro de filas angostas (ej. una pierna de pago). */
  size?: 'default' | 'sm';
  currencySymbol?: string;
}

// Campo de dinero "rústico" a propósito: prefijo S/ fijo y visible, número
// grande en negrita con tabular-nums para que las cifras alineen entre
// campos — pensado para que un monto mal leído sea difícil, no solo posible
// de evitar. Usar en todo campo donde se ingresa un monto de dinero real
// (no cantidades de producto, no porcentajes).
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, state, size = 'default', currencySymbol = 'S/', ...props }, ref) => {
    const sm = size === 'sm';
    return (
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-md border bg-background ring-offset-background',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          state === 'error' ? 'border-destructive' : state === 'ok' ? 'border-success' : 'border-input',
          sm ? 'h-9' : 'h-11',
        )}
      >
        <span
          className={cn(
            'flex select-none items-center border-r bg-muted/50 font-semibold text-muted-foreground',
            sm ? 'px-2 text-xs' : 'px-3 text-sm',
          )}
        >
          {currencySymbol}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step={0.01}
          ref={ref}
          className={cn(
            'w-full min-w-0 flex-1 bg-transparent text-right font-bold tabular-nums outline-none',
            'placeholder:font-normal placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            sm ? 'px-2 text-sm' : 'px-3 text-lg',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

export { MoneyInput };
