import { NavLink } from 'react-router-dom'
import { Home, Package, ShoppingBag, Wallet } from 'lucide-react'
import { cn } from '../lib/cn'

const TABS = [
  { to: '/estado', label: 'Inicio', icon: Home },
  { to: '/pedidos', label: 'Pedidos', icon: Package },
  { to: '/mandados', label: 'Mandados', icon: ShoppingBag },
  { to: '/billetera', label: 'Ganancias', icon: Wallet },
]

export function BottomNav() {
  return (
    <nav className="flex border-t border-line bg-card" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => cn('flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-blue' : 'text-ink-faint')}
        >
          <Icon size={22} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
