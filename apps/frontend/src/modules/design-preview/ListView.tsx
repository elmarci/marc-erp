// Plantilla de lista: encabezado, indicadores, filtros y tabla.
import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, FileText, ListFilter, MoreHorizontal,
  Pencil, Plus, RotateCcw, Search, Wallet, X, XCircle, PackageOpen, AlertTriangle,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Btn, Check, StatCard, StatusBadge, fieldCls } from './ui';
import { compras, proveedores, serieCompras, seriePorPagar, type CompraDemo, type Estado } from './data';

export type TableState = 'datos' | 'cargando' | 'vacio' | 'error';

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const quick: { key: 'todas' | Estado; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'por_pagar', label: 'Por pagar' },
  { key: 'vencida', label: 'Vencidas' },
  { key: 'pagada', label: 'Pagadas' },
  { key: 'anulada', label: 'Anuladas' },
];

type ColKey = 'fecha' | 'proveedor' | 'comprobante' | 'items' | 'estado' | 'total' | 'saldo';
const columns: { key: ColKey; label: string; num?: boolean; hideSm?: boolean }[] = [
  { key: 'fecha', label: 'Fecha', hideSm: true },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'comprobante', label: 'Comprobante', hideSm: true },
  { key: 'items', label: 'Productos', num: true, hideSm: true },
  { key: 'estado', label: 'Estado' },
  { key: 'total', label: 'Total', num: true },
  { key: 'saldo', label: 'Saldo', num: true, hideSm: true },
];

function Truncate({ text }: { text: string }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <span className="block max-w-[260px] truncate">{text}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={4} className="dp z-50 max-w-xs rounded-ctl bg-ink px-2 py-1 text-meta text-white shadow-md">
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ListView({ tableState, onNew, onVoid }: {
  tableState: TableState; onNew: () => void; onVoid: (c: CompraDemo) => void;
}) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'todas' | Estado>('todas');
  const [prov, setProv] = useState<string | null>(null);
  const [comp, setComp] = useState<string | null>('Factura o boleta');
  const [mes, setMes] = useState<string | null>('Noviembre 2026');
  const [sort, setSort] = useState<{ key: ColKey; dir: 'asc' | 'desc' }>({ key: 'fecha', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set(['3']));
  const [hidden, setHidden] = useState<Set<ColKey>>(new Set());

  const rows = useMemo(() => {
    let r = compras.filter((c) =>
      (estado === 'todas' || c.estado === estado) &&
      (!prov || c.proveedor === prov) &&
      (!mes || c.fecha.startsWith(mes === 'Noviembre 2026' ? '2026-11' : '2026-10')) &&
      (!q || (c.proveedor + c.numero + c.comprobante).toLowerCase().includes(q.toLowerCase())),
    );
    r = [...r].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const cmp = typeof va === 'number' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [q, estado, prov, mes, sort]);

  const chips = [
    prov && { label: 'Proveedor', value: prov, clear: () => setProv(null) },
    mes && { label: 'Mes', value: mes, clear: () => setMes(null) },
    comp && { label: 'Comprobante', value: comp, clear: () => setComp(null) },
  ].filter(Boolean) as { label: string; value: string; clear: () => void }[];

  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSel = rows.some((r) => selected.has(r.id));
  const visibleCols = columns.filter((c) => !hidden.has(c.key));
  const toggleSort = (key: ColKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <Tooltip.Provider>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Compras"
          actions={<>
            <Btn variant="secondary"><Download />Exportar</Btn>
            <Btn variant="primary" onClick={onNew}><Plus />Registrar compra</Btn>
          </>}
        />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-srf bg-line shadow-[0_0_0_1px_hsl(var(--line))] lg:grid-cols-4">
          <StatCard label="Comprado en noviembre" value="S/ 10,936.35" delta={12.4} compare="vs. octubre a la fecha" goodWhenUp={false} series={serieCompras} />
          <StatCard label="Por pagar" value="S/ 4,945.70" delta={8.1} compare="vs. hace 7 días" goodWhenUp={false} series={seriePorPagar} />
          <StatCard label="Vencido" value="S/ 2,310.50" delta={-22} compare="vs. hace 7 días" goodWhenUp={false} />
          <StatCard label="Compras registradas" value="38" delta={5.6} compare="vs. octubre a la fecha" />
        </div>

        <section className="flex flex-col rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
            <div className="relative w-full sm:w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Proveedor, número o comprobante" className={cn(fieldCls, 'h-8 pl-8')} />
            </div>
            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-ctl bg-ink/[0.04] p-0.5" role="tablist" aria-label="Estado">
              {quick.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={estado === f.key}
                  onClick={() => setEstado(f.key)}
                  className={cn(
                    'h-7 shrink-0 rounded-[5px] px-2.5 text-table transition-colors',
                    estado === f.key ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Btn size="sm" variant="ghost"><ListFilter />Más filtros</Btn>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" sideOffset={6} className="dp z-50 flex w-[280px] flex-col gap-3 rounded-srf bg-surface p-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]">
                  <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Proveedor
                    <select className={fieldCls} value={prov ?? ''} onChange={(e) => setProv(e.target.value || null)}>
                      <option value="">Todos</option>
                      {proveedores.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Mes
                    <select className={fieldCls} value={mes ?? ''} onChange={(e) => setMes(e.target.value || null)}>
                      <option value="">Todos</option><option>Noviembre 2026</option><option>Octubre 2026</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Comprobante
                    <select className={fieldCls} value={comp ?? ''} onChange={(e) => setComp(e.target.value || null)}>
                      <option value="">Cualquiera</option><option>Factura o boleta</option><option>Sin comprobante</option>
                    </select>
                  </label>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Btn size="sm" variant="ghost" className="sm:ml-auto" aria-label="Columnas"><Columns3 /><span className="hidden sm:inline">Columnas</span></Btn>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="dp z-50 min-w-[180px] rounded-srf bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]">
                  {columns.map((c) => (
                    <DropdownMenu.CheckboxItem
                      key={c.key}
                      checked={!hidden.has(c.key)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => setHidden((h) => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })}
                      className="flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-table text-ink outline-none data-[highlighted]:bg-ink/[0.05]"
                    >
                      <Check checked={!hidden.has(c.key)} onChange={() => {}} label={c.label} />{c.label}
                    </DropdownMenu.CheckboxItem>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* Filtros activos */}
          <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 px-3 py-2">
            {chips.map((c) => (
              <span key={c.label} className="inline-flex h-6 items-center gap-1 rounded-ctl bg-ink/[0.05] pl-2 pr-1 text-meta text-ink">
                <span className="text-ink-muted">{c.label}:</span>
                <span className="max-w-[180px] truncate font-medium">{c.value}</span>
                <button onClick={c.clear} className="grid size-4 place-items-center rounded-[3px] text-ink-muted hover:bg-ink/10 hover:text-ink" aria-label={`Quitar ${c.label}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {chips.length > 0 && (
              <button onClick={() => { setProv(null); setMes(null); setComp(null); }} className="px-1 text-meta font-medium text-ink-muted hover:text-ink">Limpiar</button>
            )}
            <span className="ml-auto text-meta tabular-nums text-ink-muted">{tableState === 'datos' ? rows.length : 0} resultados</span>
          </div>

          {/* Acciones en grupo */}
          {someSel && tableState === 'datos' && (
            <div className="mx-3 mb-2 hidden h-9 items-center md:flex gap-2 rounded-ctl bg-ink px-3 text-table text-white">
              <span className="tabular-nums">{(() => { const n = rows.filter((r) => selected.has(r.id)).length; return `${n} ${n === 1 ? 'elegida' : 'elegidas'}`; })()}</span>
              <span className="mx-1 h-4 w-px bg-white/20" />
              <button className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/10"><Wallet className="size-4" />Registrar pago</button>
              <button className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/10"><Download className="size-4" />Exportar</button>
              <button onClick={() => setSelected(new Set())} className="ml-auto rounded p-1 hover:bg-white/10" aria-label="Quitar selección"><X className="size-4" /></button>
            </div>
          )}

          {/* Tabla */}
          {/* Celular: lista en vez de tabla */}
          {tableState === 'datos' && (
            <ul className="md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="tap flex items-center gap-3 border-t border-line px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-body font-medium', r.estado === 'anulada' ? 'text-ink-muted' : 'text-ink')}>{r.proveedor}</div>
                    <div className="text-meta tabular-nums text-ink-muted">{r.numero} · {formatDate(r.fecha + 'T12:00:00-05:00')}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-body font-medium tabular-nums text-ink">{formatCurrency(r.total)}</span>
                    <StatusBadge estado={r.estado} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className={cn('max-h-[520px] overflow-auto', tableState === 'datos' && 'hidden md:block')}>
            <table className="w-full border-separate border-spacing-0 text-table">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <th className="w-10 border-b border-line py-2 pl-3 pr-1 text-left">
                    <Check checked={allSel} indeterminate={!allSel && someSel} label="Elegir todas"
                      onChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} />
                  </th>
                  <th className="border-b border-line px-3 py-2 text-left text-meta font-medium text-ink-muted">Número</th>
                  {visibleCols.map((c) => (
                    <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn('border-b border-line px-3 py-2 text-meta font-medium text-ink-muted', c.num ? 'text-right' : 'text-left', c.hideSm && 'hidden md:table-cell')}>
                      <button onClick={() => toggleSort(c.key)} className={cn('inline-flex items-center gap-1 hover:text-ink', sort.key === c.key && 'text-ink')}>
                        {c.label}
                        {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    </th>
                  ))}
                  <th className="w-10 border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {tableState === 'cargando' && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={visibleCols.length + 3} className="border-b border-line px-3 py-[11px]">
                      <div className="flex items-center gap-6">
                        <div className="h-3 w-16 animate-pulse rounded bg-ink/[0.07]" />
                        <div className="h-3 w-20 animate-pulse rounded bg-ink/[0.07]" />
                        <div className="h-3 flex-1 animate-pulse rounded bg-ink/[0.07]" />
                        <div className="h-3 w-16 animate-pulse rounded bg-ink/[0.07]" />
                      </div>
                    </td>
                  </tr>
                ))}
                {tableState === 'vacio' && (
                  <tr><td colSpan={visibleCols.length + 3} className="px-3 py-14 text-center">
                    <PackageOpen className="mx-auto mb-2 size-5 text-ink-muted" />
                    <div className="mb-3 text-body text-ink">No hay compras con estos filtros</div>
                    <Btn size="sm" onClick={() => { setProv(null); setMes(null); setComp(null); setEstado('todas'); }}>Limpiar filtros</Btn>
                  </td></tr>
                )}
                {tableState === 'error' && (
                  <tr><td colSpan={visibleCols.length + 3} className="px-3 py-14 text-center">
                    <AlertTriangle className="mx-auto mb-2 size-5 text-bad" />
                    <div className="mb-3 text-body text-ink">No se pudieron cargar las compras</div>
                    <Btn size="sm"><RotateCcw />Reintentar</Btn>
                  </td></tr>
                )}
                {tableState === 'datos' && rows.map((r) => {
                  const sel = selected.has(r.id);
                  const voided = r.estado === 'anulada';
                  return (
                    <tr key={r.id} className={cn('group cursor-pointer', sel ? 'bg-brand-soft/60' : 'hover:bg-surface-2')}>
                      <td className="h-10 border-b border-line py-0 pl-3 pr-1">
                        <Check checked={sel} label={`Elegir ${r.numero}`} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                      </td>
                      <td className={cn('border-b border-line px-3 font-medium tabular-nums', voided ? 'text-ink-muted line-through' : 'text-ink')}>{r.numero}</td>
                      {visibleCols.map((c) => (
                        <td key={c.key} className={cn('border-b border-line px-3', c.num && 'text-right tabular-nums', c.hideSm && 'hidden md:table-cell', voided ? 'text-ink-muted' : 'text-ink')}>
                          {c.key === 'fecha' && <span className="tabular-nums">{formatDate(r.fecha + 'T12:00:00-05:00')}</span>}
                          {c.key === 'proveedor' && <Truncate text={r.proveedor} />}
                          {c.key === 'comprobante' && <span className="tabular-nums">{r.comprobante}</span>}
                          {c.key === 'items' && r.items}
                          {c.key === 'estado' && <StatusBadge estado={r.estado} />}
                          {c.key === 'total' && formatCurrency(r.total)}
                          {c.key === 'saldo' && (r.saldo ? <span className="font-medium">{formatCurrency(r.saldo)}</span> : <span className="text-ink-muted">—</span>)}
                        </td>
                      ))}
                      <td className="border-b border-line pr-2 text-right">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button onClick={(e) => e.stopPropagation()} className="grid size-7 place-items-center rounded-ctl text-ink-muted opacity-70 hover:bg-ink/[0.06] hover:text-ink group-hover:opacity-100 data-[state=open]:bg-ink/[0.06] data-[state=open]:opacity-100" aria-label={`Acciones de ${r.numero}`}>
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" sideOffset={4} className="dp z-50 min-w-[190px] rounded-srf bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.18),0_0_0_1px_hsl(var(--line))]">
                              {[{ i: FileText, l: 'Ver detalle' }, { i: Wallet, l: 'Registrar pago' }, { i: Pencil, l: 'Editar comprobante' }].map(({ i: I, l }) => (
                                <DropdownMenu.Item key={l} className="flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-table text-ink outline-none data-[highlighted]:bg-ink/[0.05]">
                                  <I className="size-4 text-ink-muted" />{l}
                                </DropdownMenu.Item>
                              ))}
                              <DropdownMenu.Separator className="my-1 h-px bg-line" />
                              <DropdownMenu.Item disabled={voided} onSelect={() => onVoid(r)} className="flex h-8 cursor-pointer items-center gap-2 rounded-ctl px-2 text-table text-bad-ink outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-bad/[0.07]">
                                <XCircle className="size-4" />Anular compra
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-meta text-ink-muted">
            <span className="tabular-nums">1–{tableState === 'datos' ? rows.length : 0} de 38</span>
            <div className="flex items-center gap-1">
              <Btn size="sm" variant="ghost" disabled aria-label="Anterior"><ChevronLeft /></Btn>
              <span className="px-1 tabular-nums text-ink">1 / 4</span>
              <Btn size="sm" variant="ghost" aria-label="Siguiente"><ChevronRight /></Btn>
            </div>
          </div>
        </section>
      </div>
    </Tooltip.Provider>
  );
}
