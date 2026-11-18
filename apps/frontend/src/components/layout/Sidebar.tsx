// Menú lateral oscuro, agrupado y con grupos plegables. Respeta los permisos
// por rol y muestra el contador de alertas de inventario.
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { homeItem, visibleGroups, type NavItem } from './nav';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Solo en celular/tablet: cierra el menú. */
  onClose?: () => void;
}

const CLOSED_KEY = 'nav:closed-groups';
function readClosed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '{}'); } catch { return {}; }
}

interface Badge { total: number; urgent: boolean }

function Item({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: Badge }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'tap group relative flex h-8 items-center gap-2.5 rounded-ctl px-2 text-table transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-on-dark/60',
        isActive ? 'bg-white/[0.14] font-medium text-white' : 'text-nav-ink hover:bg-white/[0.08] hover:text-white',
        collapsed && 'lg:justify-center lg:px-0',
      )}
    >
      {({ isActive }) => (<>
        {isActive && <span className="absolute -left-3 bottom-1.5 top-1.5 w-[3px] rounded-r bg-brand-on-dark" aria-hidden />}
        <Icon className={cn('size-4 shrink-0', isActive ? 'text-brand-on-dark' : 'text-nav-ink/80 group-hover:text-white')} />
        <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:hidden')}>{item.label}</span>
        {badge && badge.total > 0 && (
          <span
            title="Alertas de inventario: stock bajo, margen bajo, por vencer y stock sin fecha"
            className={cn(
              'min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium leading-[18px] tabular-nums text-white',
              badge.urgent ? 'bg-bad' : 'bg-white/[0.14]',
              collapsed && 'lg:hidden',
            )}
          >
            {badge.total}
          </span>
        )}
        {collapsed && badge && badge.total > 0 && (
          <span className={cn('absolute right-1.5 top-1.5 hidden size-1.5 rounded-full lg:block', badge.urgent ? 'bg-bad' : 'bg-white/60')} />
        )}
      </>)}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const { hasMinRole } = useAuthStore();
  const { pathname } = useLocation();
  const groups = visibleGroups(hasMinRole);
  const [closed, setClosed] = useState<Record<string, boolean>>(readClosed);

  // Contador de alertas de inventario (stock bajo, margen bajo, por vencer y
  // stock sin fecha) para que se vea desde cualquier pantalla.
  const canSeeInventory = hasMinRole('WAREHOUSE');
  const { data: alertsSummary } = useQuery({
    queryKey: ['inv-alerts-summary'],
    queryFn: async () => (await api.get<{ data: { total: number; expired: number } }>('/inventory/alerts/summary')).data.data,
    enabled: canSeeInventory,
    refetchInterval: 60000,
  });
  const badgeFor = (path: string): Badge | undefined =>
    path === '/inventory' && canSeeInventory && alertsSummary
      ? { total: alertsSummary.total, urgent: alertsSummary.expired > 0 }
      : undefined;

  const toggleGroup = (label: string) => setClosed((c) => {
    const next = { ...c, [label]: !c[label] };
    try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* sin espacio */ }
    return next;
  });

  return (
    <div className={cn('erp on-brand flex h-full flex-col bg-nav', collapsed ? 'w-[260px] lg:w-[60px]' : 'w-[260px] lg:w-[232px]')}>
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-4', collapsed && 'lg:justify-center lg:px-0')}>
        <img src="/marc-mark.png" alt="" className="size-9 shrink-0" aria-hidden />
        <span className={cn('flex flex-col leading-none', collapsed && 'lg:hidden')}>
          <span className="text-[9px] font-bold tracking-[0.18em] text-brand-on-dark">MINIMARKET</span>
          <span className="text-[22px] font-extrabold tracking-tight text-white">Marc</span>
        </span>
        <span className="flex-1" />
        {onClose && (
          <button type="button" className="tap ml-1 grid size-7 place-items-center rounded-ctl text-nav-ink hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Cerrar menú">
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="nav-scroll flex-1 overflow-y-auto px-3 pb-3 pt-1 scroll-touch" aria-label="Menú principal">
        <div className="mb-3"><Item item={homeItem} collapsed={collapsed} /></div>
        {groups.map((g) => {
          const hasActive = g.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/'));
          const isClosed = !!closed[g.label] && !hasActive;
          const groupCount = g.items.reduce((n, i) => n + (badgeFor(i.path)?.total ?? 0), 0);
          return (
            <div key={g.label} className="mb-2">
              {collapsed && <div className="mx-auto my-2 hidden h-px w-5 bg-white/15 lg:block" />}
              <button
                type="button"
                onClick={() => toggleGroup(g.label)}
                className={cn('flex h-7 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-nav-ink/70 hover:text-white', collapsed && 'lg:hidden')}
                aria-expanded={!isClosed}
              >
                {g.label}
                {isClosed && groupCount > 0 && <span className="ml-1 tabular-nums text-white">{groupCount}</span>}
                {isClosed ? <ChevronRight className="ml-auto size-3.5" /> : <ChevronDown className="ml-auto size-3.5" />}
              </button>
              {/* En menú achicado se ven siempre todos los íconos. */}
              <div className={cn('flex-col gap-px', isClosed ? (collapsed ? 'hidden lg:flex' : 'hidden') : 'flex')}>
                {g.items.map((i) => <Item key={i.path} item={i} collapsed={collapsed} badge={badgeFor(i.path)} />)}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={cn('hidden border-t border-white/10 px-3 py-2 lg:block', collapsed && 'px-0')}>
        <button
          type="button"
          onClick={onToggle}
          className={cn('flex h-8 items-center gap-2 rounded-ctl px-2 text-table text-nav-ink outline-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-brand-on-dark/60', collapsed ? 'mx-auto w-8 justify-center px-0' : 'w-full')}
          aria-label={collapsed ? 'Abrir menú' : 'Achicar menú'}
          title={collapsed ? 'Abrir menú' : undefined}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Achicar menú'}
        </button>
      </div>
    </div>
  );
}
