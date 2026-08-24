import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, ShoppingCart, User } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useUIStore } from '../uiStore'

export function MobileTabBar() {
  const location = useLocation()
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { isLoggedIn } = useAuthStore()
  const openCategoryDrawer = useUIStore(s => s.openCategoryDrawer)
  const isCategoryDrawerOpen = useUIStore(s => s.isCategoryDrawerOpen)

  const isHomeActive = location.pathname === '/'
  const isProfileActive = location.pathname.startsWith('/mis-pedidos')
  // "Categorías" ya no navega directo al catálogo completo (eso confundía —
  // parecía que el botón no hacía nada distinto a buscar) sino que abre el
  // mismo panel de categorías/subcategorías que el menú hamburguesa del
  // header, para poder elegir a dónde ir.
  const isCategoriesActive = isCategoryDrawerOpen || location.pathname.startsWith('/catalogo') || location.pathname.startsWith('/producto')

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-bg/95 backdrop-blur border-t border-paper-line pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-14">
        <Link to="/" className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <Home className={`h-5 w-5 ${isHomeActive ? 'text-brand-green-600' : 'text-paper-ink-ghost'}`} strokeWidth={isHomeActive ? 2.5 : 2} />
          <span className={`text-[10px] ${isHomeActive ? 'text-brand-green-600 font-bold' : 'text-paper-ink-ghost font-normal'}`}>Inicio</span>
        </Link>

        <button onClick={openCategoryDrawer} className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <LayoutGrid className={`h-5 w-5 ${isCategoriesActive ? 'text-brand-green-600' : 'text-paper-ink-ghost'}`} strokeWidth={isCategoriesActive ? 2.5 : 2} />
          <span className={`text-[10px] ${isCategoriesActive ? 'text-brand-green-600 font-bold' : 'text-paper-ink-ghost font-normal'}`}>Categorías</span>
        </button>

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
