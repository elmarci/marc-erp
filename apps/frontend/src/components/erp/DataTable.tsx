// Tabla del ERP: cabecera fija, orden, selección con acciones en grupo,
// columnas configurables, números a la derecha, texto cortado con tooltip,
// estados cargando / vacío / error, menú de tres puntos por fila y vista de
// lista en celular.
import { useEffect, useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AlertTriangle, ArrowDown, ArrowUp, Columns3, Inbox, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, Check } from './primitives';
import { EmptyState } from './display';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Si existe, la columna se puede ordenar. */
  sortValue?: (row: T) => string | number | null | undefined;
  numeric?: boolean;
  /** Se oculta en pantallas angostas. */
  hideBelow?: 'md' | 'lg';
  /** false = siempre visible (no aparece en "Columnas"). */
  hideable?: boolean;
  /** Corta el texto con "…" y muestra el completo al pasar el mouse. */
  truncate?: (row: T) => string;
  className?: string;
}

export interface RowAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Línea separadora antes de esta acción. */
  separated?: boolean;
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { title: React.ReactNode; action?: React.ReactNode };
  /** Orden controlado (para orden en el servidor). Sin esto ordena en el navegador. */
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  defaultSort?: SortState;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  rowActions?: (row: T) => RowAction[];
  /** Nombre de la fila para lectores de pantalla: "OC-000701". */
  rowLabel?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Columnas ocultas (de useColumnVisibility). El botón va con <ColumnsMenu>. */
  hiddenColumns?: Set<string>;
  /** Vista de lista en celular. Sin esto, la tabla se desplaza de lado. */
  mobileRow?: (row: T) => React.ReactNode;
  maxHeight?: number | string;
  footer?: React.ReactNode;
}

/** Qué columnas ocultó la persona; se recuerda en este navegador. */
export function useColumnVisibility(storageKey: string) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`cols:${storageKey}`) ?? '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify([...hidden])); } catch { /* sin almacenamiento */ }
  }, [hidden, storageKey]);
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return [hidden, toggle] as const;
}

export function Truncate({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild><span className={cn('block max-w-[280px] truncate', className)}>{text}</span></Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={4} className="erp z-50 max-w-xs rounded-ctl bg-ink px-2 py-1 text-meta text-on-ink shadow-md">{text}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const noneHidden = new Set<string>();
const menuCls = 'erp z-50 min-w-[190px] rounded-srf bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]';
const itemCls = 'flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-table text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-ink/[0.05]';

export function ColumnsMenu<T>({ columns, hidden, onToggle }: { columns: Column<T>[]; hidden: Set<string>; onToggle: (key: string) => void }) {
  const hideable = columns.filter((c) => c.hideable !== false);
  if (!hideable.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Btn size="sm" variant="ghost" aria-label="Columnas"><Columns3 /><span className="hidden sm:inline">Columnas</span></Btn>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuCls}>
          {hideable.map((c) => (
            <DropdownMenu.CheckboxItem key={c.key} checked={!hidden.has(c.key)} onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggle(c.key)} className={itemCls}>
              <Check checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} label={String(c.header)} />{c.header}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function RowMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  if (!actions.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} aria-label={label}
          className="tap grid size-7 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink data-[state=open]:bg-ink/[0.06]">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={menuCls} onClick={(e) => e.stopPropagation()}>
          {actions.map((a) => (
            <div key={a.label}>
              {a.separated && <DropdownMenu.Separator className="my-1 h-px bg-line" />}
              <DropdownMenu.Item disabled={a.disabled} onSelect={a.onSelect}
                className={cn(itemCls, a.danger && 'text-bad-ink data-[highlighted]:bg-bad/[0.07]')}>
                {a.icon && <a.icon className={cn('size-4', !a.danger && 'text-ink-muted')} />}{a.label}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DataTable<T>(p: DataTableProps<T>) {
  const { rows, columns, getRowId, selectable, rowActions } = p;
  const [innerSort, setInnerSort] = useState<SortState>(p.defaultSort ?? null);
  const sort = p.onSortChange ? (p.sort ?? null) : innerSort;
  const setSort = p.onSortChange ?? setInnerSort;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hidden = p.hiddenColumns ?? noneHidden;

  // Si cambian las filas (otro filtro u otra página), se quitan las que ya no están.
  useEffect(() => {
    if (!rows) return;
    const ids = new Set(rows.map(getRowId));
    setSelected((s) => { const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; });
  }, [rows, getRowId]);

  const visible = columns.filter((c) => !hidden.has(c.key));
  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sort || p.onSortChange) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      const cmp = va == null ? -1 : vb == null ? 1 : typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns, p.onSortChange]);

  const selRows = sorted.filter((r) => selected.has(getRowId(r)));
  const allSel = sorted.length > 0 && selRows.length === sorted.length;
  const clear = () => setSelected(new Set());
  const toggleSort = (key: string) =>
    setSort(sort?.key === key ? (sort.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' });
  const colSpan = visible.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const state = p.error ? 'error' : p.loading && !rows ? 'loading' : sorted.length === 0 ? 'empty' : 'data';
  const hideCls = (c: Column<T>) => c.hideBelow === 'md' ? 'hidden md:table-cell' : c.hideBelow === 'lg' ? 'hidden lg:table-cell' : '';


  return (
    <Tooltip.Provider>
      {selectable && selRows.length > 0 && p.bulkActions && (
        <div className="mx-3 mb-2 flex min-h-9 flex-wrap items-center gap-2 rounded-ctl bg-ink px-3 py-1 text-table text-on-ink [&_button]:text-on-ink">
          <span className="tabular-nums">{selRows.length} {selRows.length === 1 ? 'elegida' : 'elegidas'}</span>
          <span className="mx-1 h-4 w-px bg-on-ink/20" />
          {p.bulkActions(selRows, clear)}
          <button type="button" onClick={clear} className="ml-auto rounded p-1 hover:bg-on-ink/10" aria-label="Quitar selección"><X className="size-4" /></button>
        </div>
      )}

      {p.mobileRow && state === 'data' && (
        <ul className="md:hidden">
          {sorted.map((r) => (
            <li key={getRowId(r)} onClick={p.onRowClick ? () => p.onRowClick!(r) : undefined}
              className={cn('tap flex items-center gap-3 border-t border-line px-3 py-2.5', p.onRowClick && 'cursor-pointer active:bg-surface-2')}>
              <div className="min-w-0 flex-1">{p.mobileRow!(r)}</div>
              {rowActions && <RowMenu actions={rowActions(r)} label={p.rowLabel ? `Acciones de ${p.rowLabel(r)}` : 'Acciones'} />}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('overflow-auto', p.mobileRow && state === 'data' && 'hidden md:block')} style={{ maxHeight: p.maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-table">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {selectable && (
                <th className="w-10 border-b border-line py-2 pl-3 pr-1 text-left">
                  <Check checked={allSel} indeterminate={!allSel && selRows.length > 0} label="Elegir todas"
                    onChange={() => setSelected(allSel ? new Set() : new Set(sorted.map(getRowId)))} />
                </th>
              )}
              {visible.map((c) => (
                <th key={c.key}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('whitespace-nowrap border-b border-line px-3 py-2 text-meta font-medium text-ink-muted', c.numeric ? 'text-right' : 'text-left', hideCls(c))}>
                  {c.sortValue || p.onSortChange ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn('inline-flex items-center gap-1 hover:text-ink', sort?.key === c.key && 'text-ink')}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {rowActions && <th className="w-10 border-b border-line" />}
            </tr>
          </thead>
          <tbody>
            {state === 'loading' && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}><td colSpan={colSpan} className="border-b border-line px-3 py-[11px]">
                <div className="flex items-center gap-6">
                  <div className="h-3 w-16 animate-pulse rounded bg-ink/[0.07]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-ink/[0.07]" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-ink/[0.07]" />
                  <div className="h-3 w-16 animate-pulse rounded bg-ink/[0.07]" />
                </div>
              </td></tr>
            ))}
            {state === 'empty' && (
              <tr><td colSpan={colSpan}><EmptyState icon={Inbox} title={p.empty?.title ?? 'No hay nada que mostrar'} action={p.empty?.action} /></td></tr>
            )}
            {state === 'error' && (
              <tr><td colSpan={colSpan}>
                <EmptyState icon={AlertTriangle} title="No se pudo cargar la información"
                  action={p.onRetry && <Btn size="sm" onClick={p.onRetry}><RotateCcw />Reintentar</Btn>} />
              </td></tr>
            )}
            {state === 'data' && sorted.map((r) => {
              const id = getRowId(r);
              const sel = selected.has(id);
              return (
                <tr key={id} onClick={p.onRowClick ? () => p.onRowClick!(r) : undefined}
                  className={cn('group', sel ? 'bg-brand-soft/60' : 'hover:bg-surface-2', p.onRowClick && 'cursor-pointer', p.rowClassName?.(r))}>
                  {selectable && (
                    <td className="h-10 border-b border-line py-0 pl-3 pr-1">
                      <Check checked={sel} label="Elegir fila" onChange={() => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                    </td>
                  )}
                  {visible.map((c) => (
                    <td key={c.key} className={cn('h-10 border-b border-line px-3 text-ink', c.numeric && 'text-right tabular-nums', hideCls(c), c.className)}>
                      {c.truncate ? <Truncate text={c.truncate(r)} /> : c.cell(r)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="border-b border-line pr-2 text-right"><RowMenu actions={rowActions(r)} label={p.rowLabel ? `Acciones de ${p.rowLabel(r)}` : 'Acciones de la fila'} /></td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {p.footer}
    </Tooltip.Provider>
  );
}

/** Pie con conteo y páginas. */
export function Pagination({ page, totalPages, total, pageSize, onPage }: {
  page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-meta text-ink-muted">
      <span className="tabular-nums">{from.toLocaleString('es-PE')}–{to.toLocaleString('es-PE')} de {total.toLocaleString('es-PE')}</span>
      <div className="flex items-center gap-1">
        <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Btn>
        <span className="px-1 tabular-nums text-ink">{page} / {Math.max(totalPages, 1)}</span>
        <Btn size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente</Btn>
      </div>
    </div>
  );
}
