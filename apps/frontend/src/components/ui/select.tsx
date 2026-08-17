import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Achica el control (usado en filas de filtros densas). Por defecto es h-10, igual que Input. */
  compact?: boolean;
}

// Wrapper sobre <select> nativo, mismo lenguaje visual que Input (borde,
// radio, foco) — evita que cada pantalla reinvente la clase del select a
// mano y termine con una docena de variantes ligeramente distintas.
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, compact, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          compact ? 'h-9' : 'h-10',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
