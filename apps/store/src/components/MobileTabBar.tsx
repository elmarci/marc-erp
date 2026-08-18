import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, ShoppingCart, User } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'

const TABS = [
  { to: '/', label: 'Inicio', icon: Home, match: (p: string) => p === '/' },
  { to: '/catalogo', label: 'Categorías', icon: LayoutGrid, match: (p: string) => p.startsWith('/catalogo') || p.startsWith('/producto') },
] as const

export function MobileTabBar() {
  const location = useLocation()
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { isLoggedIn } = useAuthStore()

  const isProfileActive = location.pathname.startsWith('/mis-pedidos')

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-bg/95 backdrop-blur border-t border-paper-line pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-14">
        {TABS.map(tab => {
          const active = tab.match(location.pathname)
          const Icon = tab.icon
          return (
            <Link key={tab.to} to={tab.to}
              className="flex-1 flex flex-col items-center justify-center gap-0.5">
              <Icon className={`h-5 w-5 ${active ? 'text-brand-green-600' : 'text-paper-ink-ghost'}`} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] ${active ? 'text-brand-green-600 font-bold' : 'text-paper-ink-ghost font-normal'}`}>{tab.label}</span>
            </Link>
          )
        })}

        <button onClick={openCart} className="flex-1 flex flex-col items-center justify-center gap-0.5 relative">
          <span className="relative">
            <ShoppingCart className="h-5 w-5 text-paper-ink-ghost" strokeWidth={2} />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-2 h-4 w-4 bg-brand-magenta-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </span>
          <span className="text-[10px] text-paper-ink-ghost font-normal">Carrito</span>
        </button>

        <Link to="/mis-pedidos" className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <User className={`h-5 w-5 ${isProfileActive ? 'text-brand-green-600' : 'text-paper-ink-ghost'}`} strokeWidth={isProfileActive ? 2.5 : 2} />
          <span className={`text-[10px] ${isProfileActive ? 'text-brand-green-600 font-bold' : 'text-paper-ink-ghost font-normal'}`}>
            {isLoggedIn ? 'Perfil' : 'Ingresar'}
          </span>
        </Link>
      </div>
    </nav>
  )
}
