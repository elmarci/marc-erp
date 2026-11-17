// Menú lateral por grupos + barra superior delgada + buscador Ctrl/Cmd+K.
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BookOpen, Bike, Boxes, Building2, ChevronDown, ChevronRight, Clock, Contact, FolderTree, Home, Landmark,
  Megaphone, Menu, Package, PanelLeftClose, PanelLeftOpen, Receipt, Search, Settings, ShoppingBag,
  ShoppingCart, SlidersHorizontal, Store, Tag, TrendingUp, Tv, UserCheck, Users, Wallet, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from './ui';
import { proveedores } from './data';

type Icon = React.ComponentType<{ className?: string }>;
interface Item { label: string; icon: Icon; count?: number }
interface Group { label: string; items: Item[] }

// Mapeo propuesto de los 22 ítems actuales (ver mensaje del hilo).
export const groups: Group[] = [
  { label: 'Vender', items: [
    { label: 'Punto de venta', icon: ShoppingCart },
    { label: 'Ventas', icon: Receipt },
    { label: 'Clientes', icon: UserCheck },
    { label: 'Ofertas', icon: Tag },
  ] },
  { label: 'Compras e inventario', items: [
    { label: 'Compras', icon: ShoppingBag, count: 2 },
    { label: 'Inventario', icon: Boxes, count: 7 },
    { label: 'Productos', icon: Package },
    { label: 'Categorías', icon: FolderTree },
  ] },
  { label: 'Dinero', items: [
    { label: 'Caja', icon: Wallet },
    { label: 'Gastos', icon: Receipt, count: 2 },
    { label: 'Reportes', icon: TrendingUp },
    { label: 'Administración', icon: Landmark },
  ] },
  { label: 'Tienda online', items: [
    { label: 'Pedidos online', icon: Store, count: 3 },
    { label: 'Opciones de la tienda', icon: SlidersHorizontal },
    { label: 'Repartidores', icon: Bike },
    { label: 'Avisos a clientes', icon: Megaphone },
    { label: 'Libro de reclamaciones', icon: BookOpen },
    { label: 'Pantalla TV', icon: Tv },
  ] },
  { label: 'Personal', items: [
    { label: 'Personal y pagos', icon: Contact },
    { label: 'Asistencia', icon: Clock },
  ] },
  { label: 'Ajustes', items: [
    { label: 'Usuarios', icon: Users },
    { label: 'Negocio', icon: Settings },
  ] },
];

function NavLinkDemo({ item, active, collapsed, onNavigate }: { item: Item; active: boolean; collapsed: boolean; onNavigate?: (l: string) => void }) {
  const Icon = item.icon;
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onNavigate?.(item.label); }}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'tap group relative flex h-8 items-center gap-2.5 rounded-ctl px-2 text-table transition-colors',
        active ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:bg-ink/[0.04] hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand" aria-hidden />}
      <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-ink-muted/80 group-hover:text-ink')} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && item.count ? (
        <span className="min-w-5 rounded-full bg-ink/[0.07] px-1.5 text-center text-[11px] font-medium leading-[18px] tabular-nums text-ink">
          {item.count}
        </span>
      ) : null}
      {collapsed && item.count ? <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-ink/50" /> : null}
    </a>
  );
}

export function Sidebar({ collapsed, onToggle, active, mobileOpen, onCloseMobile, onNavigate }: {
  onNavigate?: (label: string) => void;
  collapsed: boolean; onToggle: () => void; active: string; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ 'Tienda online': true });
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-canvas transition-[width,transform] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'lg:w-[60px]' : 'lg:w-[232px]',
          'w-[260px]',
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
      >
        <div className={cn('flex h-12 items-center gap-2 px-4', collapsed && 'lg:justify-center lg:px-0')}>
          <div className="grid size-6 place-items-center rounded-[5px] bg-ink text-[11px] font-bold text-white">M</div>
          {!collapsed && <span className="text-body font-semibold tracking-tight text-ink">MARC</span>}
          {!collapsed && <span className="ml-auto text-meta text-ink-muted">Minimarket</span>}
          <button className="ml-1 rounded-ctl p-1 text-ink-muted hover:bg-ink/5 lg:hidden" onClick={onCloseMobile} aria-label="Cerrar menú">
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Menú principal">
          <div className="mb-3">
            <NavLinkDemo item={{ label: 'Inicio', icon: Home }} active={active === 'Inicio'} collapsed={collapsed} />
          </div>
          {groups.map((g) => {
            const isClosed = closed[g.label] && !g.items.some((i) => i.label === active);
            const groupCount = g.items.reduce((n, i) => n + (i.count ?? 0), 0);
            return (
              <div key={g.label} className="mb-2">
                {collapsed ? (
                  <div className="mx-auto my-2 h-px w-5 bg-line-strong" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setClosed((c) => ({ ...c, [g.label]: !c[g.label] }))}
                    className="flex h-7 w-full items-center gap-1 px-2 text-meta font-medium text-ink-muted hover:text-ink"
                    aria-expanded={!isClosed}
                  >
                    {g.label}
                    {isClosed && groupCount > 0 && <span className="ml-1 tabular-nums text-ink">{groupCount}</span>}
                    {isClosed ? <ChevronRight className="ml-auto size-3.5" /> : <ChevronDown className="ml-auto size-3.5" />}
                  </button>
                )}
                {!isClosed && (
                  <div className="flex flex-col gap-px">
                    {g.items.map((i) => (
                      <NavLinkDemo key={i.label} item={i} active={i.label === active} collapsed={collapsed} onNavigate={onNavigate} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={cn('hidden px-3 pb-3 lg:block', collapsed && 'px-0 text-center')}>
          <button
            type="button"
            onClick={onToggle}
            className={cn('flex h-8 items-center gap-2 rounded-ctl px-2 text-table text-ink-muted hover:bg-ink/[0.04] hover:text-ink', collapsed ? 'mx-auto w-8 justify-center px-0' : 'w-full')}
            aria-label={collapsed ? 'Abrir menú' : 'Achicar menú'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Achicar menú'}
          </button>
        </div>
      </aside>
    </>
  );
}

export function Topbar({ crumbs, onSearch, onMenu }: { crumbs: string[]; onSearch: () => void; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
      <button className="-ml-1 rounded-ctl p-1.5 text-ink-muted hover:bg-ink/5 lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu className="size-4" />
      </button>
      <nav aria-label="Ruta" className="hidden min-w-0 items-center gap-1.5 text-table sm:flex">
        {crumbs.map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-ink-muted/50">/</span>}
            <span className={i === crumbs.length - 1 ? 'font-medium text-ink' : 'text-ink-muted'}>{c}</span>
          </span>
        ))}
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="ml-auto flex h-8 w-full max-w-[280px] items-center gap-2 rounded-ctl bg-ink/[0.04] px-2.5 text-table text-ink-muted hover:bg-ink/[0.06] sm:w-[260px]"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="hidden h-8 items-center gap-2 rounded-ctl px-2 text-table text-ink md:flex">
        <span className="size-1.5 rounded-full bg-ok" aria-hidden />
        Caja 1 <span className="tabular-nums text-ink-muted">abierta 7:02</span>
      </div>
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/[0.08] text-[11px] font-semibold text-ink" title="Marcial · Administrador">
        MR
      </div>
    </header>
  );
}

// ── Buscador global ───────────────────────────────────────────────────────
const productosDemo = ['Yogurt Gloria fresa 1 L', 'Leche Gloria azul 400 g', 'Arroz Costeño 5 kg', 'Coca-Cola 1.5 L', 'Pan francés (kg)'];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const sections = useMemo(() => {
    const m = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
    return [
      { title: 'Módulos', icon: null as Icon | null, rows: groups.flatMap((g) => g.items.map((i) => ({ label: i.label, meta: g.label, icon: i.icon }))).filter((r) => m(r.label)).slice(0, 5) },
      { title: 'Productos', icon: Package, rows: productosDemo.filter(m).slice(0, 4).map((p) => ({ label: p, meta: 'Producto', icon: Package })) },
      { title: 'Proveedores', icon: Building2, rows: proveedores.filter(m).slice(0, 4).map((p) => ({ label: p, meta: 'Proveedor', icon: Building2 })) },
    ].filter((s) => s.rows.length);
  }, [q]);
  const flat = sections.flatMap((s) => s.rows);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setQ(''); setSel(0); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/20" />
        <Dialog.Content
          aria-describedby={undefined}
          className="dp fixed left-1/2 top-[12vh] z-50 w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-srf bg-surface shadow-[0_16px_48px_-12px_rgba(0,0,0,.25),0_0_0_1px_hsl(var(--line))]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          }}
        >
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 text-ink-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0); }}
              placeholder="Módulos, productos o proveedores"
              className="h-full flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted/70"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {flat.length === 0 && <div className="px-3 py-6 text-center text-table text-ink-muted">Nada con “{q}”</div>}
            {sections.map((s) => (
              <div key={s.title} className="pb-1">
                <div className="px-2.5 pb-1 pt-2 text-meta text-ink-muted">{s.title}</div>
                {s.rows.map((r) => {
                  const idx = flat.indexOf(r);
                  const RIcon = r.icon;
                  return (
                    <div
                      key={s.title + r.label}
                      onMouseEnter={() => setSel(idx)}
                      className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 text-table', idx === sel ? 'bg-ink/[0.05] text-ink' : 'text-ink')}
                    >
                      <RIcon className="size-4 text-ink-muted" />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="text-meta text-ink-muted">{r.meta}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
