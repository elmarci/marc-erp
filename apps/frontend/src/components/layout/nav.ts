// Menú principal agrupado. Cada ruta conserva su permiso mínimo (minRole).
import {
  BookOpen, Bike, Boxes, Clock, Contact, FolderTree, Home, Landmark, ListChecks, Megaphone, Package, Receipt,
  Settings, ShoppingBag, ShoppingCart, Store, Tag, TrendingUp, Tv, UserCheck, Users, Wallet,
} from 'lucide-react';

export type NavIcon = React.ComponentType<{ className?: string }>;
export interface NavItem { path: string; label: string; icon: NavIcon; minRole?: string }
export interface NavGroup { label: string; items: NavItem[] }

export const homeItem: NavItem = { path: '/dashboard', label: 'Inicio', icon: Home };

export const navGroups: NavGroup[] = [
  { label: 'Vender', items: [
    { path: '/pos', label: 'Punto de venta', icon: ShoppingCart },
    { path: '/sales', label: 'Ventas', icon: Receipt },
    { path: '/customers', label: 'Clientes', icon: UserCheck },
    { path: '/offers', label: 'Ofertas', icon: Tag, minRole: 'SUPERVISOR' },
  ] },
  { label: 'Compras e inventario', items: [
    { path: '/purchases', label: 'Compras', icon: ShoppingBag, minRole: 'WAREHOUSE' },
    { path: '/inventory', label: 'Inventario', icon: Boxes, minRole: 'WAREHOUSE' },
    { path: '/products', label: 'Productos', icon: Package },
    { path: '/categories', label: 'Categorías', icon: FolderTree, minRole: 'ADMIN' },
  ] },
  { label: 'Dinero', items: [
    { path: '/cash', label: 'Caja', icon: Wallet },
    { path: '/reports', label: 'Reportes', icon: TrendingUp, minRole: 'SUPERVISOR' },
    { path: '/administration', label: 'Administración', icon: Landmark, minRole: 'ADMIN' },
  ] },
  { label: 'Tienda online', items: [
    { path: '/store-orders', label: 'Pedidos online', icon: Store, minRole: 'CASHIER' },
    { path: '/store-options', label: 'Opciones de la tienda', icon: ListChecks, minRole: 'SUPERVISOR' },
    { path: '/riders', label: 'Repartidores', icon: Bike, minRole: 'SUPERVISOR' },
    { path: '/notifications', label: 'Notificaciones', icon: Megaphone, minRole: 'SUPERVISOR' },
    { path: '/complaints', label: 'Libro de reclamaciones', icon: BookOpen, minRole: 'SUPERVISOR' },
    { path: '/tv', label: 'Pantalla TV', icon: Tv, minRole: 'SUPERVISOR' },
  ] },
  { label: 'Personal', items: [
    { path: '/staff', label: 'Personal', icon: Contact, minRole: 'ADMIN' },
    { path: '/attendance', label: 'Asistencia', icon: Clock },
  ] },
  { label: 'Ajustes', items: [
    { path: '/users', label: 'Usuarios', icon: Users, minRole: 'ADMIN' },
    { path: '/settings', label: 'Configuración', icon: Settings, minRole: 'ADMIN' },
  ] },
];

/** Grupos con solo las rutas que el rol puede ver; los grupos vacíos no salen. */
export function visibleGroups(hasMinRole: (r: string) => boolean): NavGroup[] {
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.minRole || hasMinRole(i.minRole)) }))
    .filter((g) => g.items.length > 0);
}

/** Grupo y página de la ruta actual, para la ruta de navegación de arriba. */
export function findNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  if (pathname.startsWith(homeItem.path)) return { item: homeItem };
  for (const g of navGroups) {
    const item = g.items.find((i) => pathname === i.path || pathname.startsWith(i.path + '/'));
    if (item) return { group: g, item };
  }
  return {};
}
