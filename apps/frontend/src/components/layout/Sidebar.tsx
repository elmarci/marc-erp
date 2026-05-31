import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Users,
  TrendingUp,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  UserCheck,
  Boxes,
  Tag,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: string;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
  { path: '/sales', label: 'Ventas', icon: Receipt },
  { path: '/products', label: 'Productos', icon: Package },
  { path: '/customers', label: 'Clientes', icon: UserCheck },
  { path: '/purchases', label: 'Compras', icon: ShoppingBag, minRole: 'WAREHOUSE' },
  { path: '/inventory', label: 'Inventario', icon: Boxes, minRole: 'WAREHOUSE' },
  { path: '/cash', label: 'Caja', icon: Wallet },
  { path: '/store-orders', label: 'Pedidos Online', icon: Store, minRole: 'CASHIER' },
  { path: '/offers', label: 'Ofertas', icon: Tag, minRole: 'SUPERVISOR' },
  { path: '/reports', label: 'Reportes', icon: TrendingUp, minRole: 'SUPERVISOR' },
  { path: '/users', label: 'Usuarios', icon: Users, minRole: 'ADMIN' },
  { path: '/settings', label: 'Configuración', icon: Settings, minRole: 'ADMIN' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { hasMinRole } = useAuthStore();

  const visibleItems = navItems.filter((item) =>
    item.minRole ? hasMinRole(item.minRole) : true,
  );

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 flex h-full flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b px-4', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            {/* Logo MARC */}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black shrink-0">
              <span className="text-sm font-black tracking-tight" style={{ color: '#4ade80' }}>M</span>
            </div>
            <div>
              <p className="text-base font-black tracking-widest leading-none text-foreground">MARC</p>
              <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Sistema ERP</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black shrink-0">
            <span className="text-sm font-black tracking-tight" style={{ color: '#4ade80' }}>M</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          className={cn(collapsed && 'hidden')}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Toggle cuando collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="flex h-8 w-full items-center justify-center border-b hover:bg-accent"
          aria-label="Expandir menú"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                      : 'text-muted-foreground',
                    collapsed && 'justify-center px-2',
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
