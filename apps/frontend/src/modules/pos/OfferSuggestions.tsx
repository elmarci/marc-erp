import { ChevronRight, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCartSuggestions } from './autoOffers';

/**
 * Ofertas que aplican a lo que se está vendiendo, en una sola fila
 * horizontal: no se mezclan con las líneas de la venta ni las empujan.
 * Si hay más de las que caben, se desliza hacia el costado.
 */
export function OfferSuggestions({ onSeeAll, className }: { onSeeAll: () => void; className?: string }) {
  const suggestions = useCartSuggestions();
  if (suggestions.length === 0) return null;
  return (
    <section className={cn('shrink-0', className)} aria-label="Ofertas para esta venta">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Tag className="h-3.5 w-3.5" />Ofertas para esta venta
          <span className="tabular-nums text-muted-foreground">{suggestions.length}</span>
        </p>
        <button onClick={onSeeAll} className="flex items-center text-xs font-medium text-primary hover:underline">
          Ver todas<ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 h-scroll lg:mx-0 lg:px-0">
        {suggestions.map((sg) => (
          <li key={sg.key}
            className="flex w-[18rem] shrink-0 items-center gap-2.5 rounded-xl bg-primary/[0.06] py-2 pl-3 pr-2 xl:w-[22rem]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-snug" title={sg.title}>{sg.title}</p>
              <p className="truncate text-xs text-muted-foreground" title={sg.detail}>{sg.detail}</p>
            </div>
            <button onClick={(e) => { e.currentTarget.blur(); sg.apply(); }}
              className="h-8 shrink-0 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground active:scale-95">
              Aplicar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
