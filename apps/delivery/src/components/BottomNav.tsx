import { NavLink } from 'react-router-dom'
import { ClipboardList, Clock, User, Wallet } from 'lucide-react'
import { cn } from '../lib/cn'

const TABS = [
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/historial', label: 'Historial', icon: Clock },
  { to: '/billetera', label: 'Billetera', icon: Wallet },
  { to: '/perfil', label: 'Perfil', icon: User },
]

export function BottomNav() {
  return (
    <div
      className="flex border-t border-paper-line bg-paper-bg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 px-1 transition-transform active:scale-95"
        >
          {({ isActive }) => (
            <>
              <Icon
                size={24}
                strokeWidth={2.2}
                className={cn(isActive ? 'text-accent-green' : 'text-paper-ink-faint')}
              />
              <span className={cn('font-display text-[10px] tracking-wide', isActive ? 'font-extrabold text-accent-green' : 'font-bold text-paper-ink-faint')}>
                {label.toUpperCase()}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}
