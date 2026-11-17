// Barra de filtros: búsqueda con espera (300 ms), filtros rápidos visibles,
// filtros avanzados en un popover, chips removibles, "Limpiar" y conteo.
// useUrlFilters() guarda los filtros en la URL para que se puedan compartir
// y sobrevivan a recargar la página.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { ListFilter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, fieldCls } from './primitives';

export interface FilterChip { key: string; label: string; value: React.ReactNode; onRemove: () => void }

export function FilterBar({
  search, quick, advanced, advancedCount, chips = [], onClear, resultCount, trailing, className,
}: {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string; delay?: number };
  /** Filtros rápidos: normalmente un <Segmented>. */
  quick?: React.ReactNode;
  /** Contenido del popover "Más filtros". */
  advanced?: React.ReactNode;
  advancedCount?: number;
  chips?: FilterChip[];
  onClear?: () => void;
  resultCount?: number | null;
  /** A la derecha: columnas, exportar, etc. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        {search && <SearchInput {...search} />}
        {quick}
        {advanced && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <Btn size="sm" variant="ghost">
                <ListFilter />Más filtros
                {!!advancedCount && <span className="rounded-full bg-ink px-1.5 text-[11px] text-on-ink tabular-nums">{advancedCount}</span>}
              </Btn>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start" sideOffset={6}
                className="erp z-50 flex w-[300px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-srf bg-surface p-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]"
              >
                {advanced}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {trailing && <div className="flex items-center gap-1 sm:ml-auto">{trailing}</div>}
      </div>
      <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 px-3 py-2">
        {chips.map((c) => (
          <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-ctl bg-ink/[0.05] pl-2 pr-1 text-meta text-ink">
            <span className="text-ink-muted">{c.label}:</span>
            <span className="max-w-[200px] truncate font-medium">{c.value}</span>
            <button type="button" onClick={c.onRemove} className="grid size-4 place-items-center rounded-[3px] text-ink-muted hover:bg-ink/10 hover:text-ink" aria-label={`Quitar filtro ${c.label}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        {chips.length > 0 && onClear && (
          <button type="button" onClick={onClear} className="px-1 text-meta font-medium text-ink-muted hover:text-ink">Limpiar</button>
        )}
        {resultCount != null && (
          <span className="ml-auto text-meta tabular-nums text-ink-muted">
            {resultCount.toLocaleString('es-PE')} {resultCount === 1 ? 'resultado' : 'resultados'}
          </span>
        )}
      </div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder = 'Buscar', delay = 300 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; delay?: number;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Si el valor cambia desde afuera (Limpiar, URL), se refleja en el input.
  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="relative w-full sm:w-[260px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        value={local}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), delay);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(timer.current); onChange(local); } }}
        className={cn(fieldCls, 'h-8 pl-8', local && 'pr-7')}
      />
      {local && (
        <button type="button" onClick={() => { setLocal(''); onChange(''); }}
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-muted hover:bg-ink/10" aria-label="Borrar búsqueda">
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Filtros guardados en la URL. `defaults` define las claves y su valor por
 * defecto; un valor igual al defecto no se escribe en la URL. No toca otras
 * claves de la URL (por ejemplo ?tab=).
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  const keys = useMemo(() => Object.keys(defaults) as (keyof T & string)[], [defaults]);

  const values = useMemo(() => {
    const out = { ...defaults };
    for (const k of keys) {
      const v = params.get(k);
      if (v !== null) (out as Record<string, string>)[k] = v;
    }
    return out;
  }, [params, keys, defaults]);

  const set = useCallback((patch: Partial<T>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k); else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  }, [setParams, defaults]);

  const clear = useCallback((except: (keyof T)[] = []) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of keys) if (!except.includes(k)) next.delete(k);
      return next;
    }, { replace: true });
  }, [setParams, keys]);

  return [values, set, clear] as const;
}
