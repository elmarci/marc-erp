import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, ShoppingCart, User } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'

// Barra inferior fija. Cada pestaña mide 64 px de alto y un cuarto del ancho
// (bien por encima del mínimo táctil de 44 px) y el texto es de 12 px en un
// gris que pasa contraste AA.
export function MobileTabBar() {
  const location = useLocation()
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const cartOpen = useCartStore(s => s.isOpen)
  const count = cartCount(items)
  const { isLoggedIn } = useAuthStore()
  const path = location.pathname

  const tab = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs ${active ? 'text-brand-blue-600 font-bold' : 'text-paper-ink-soft font-semibold'}`

  const isHome = path === '/' && !cartOpen
  const isCategories = !cartOpen && (path.startsWith('/categorias') || path.startsWith('/catalogo') || path.startsWith('/producto'))
  const isAccount = !cartOpen && (path.startsWith('/mis-pedidos') || path.startsWith('/ingresar'))

  return (
    <nav aria-label="Navegación principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-paper-line pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-16">
        <Link to="/" className={tab(isHome)} aria-current={isHome ? 'page' : undefined}>
          <Home className="h-6 w-6" strokeWidth={isHome ? 2.5 : 2} />Inicio
        </Link>
        <Link to="/categorias" className={tab(isCategories)} aria-current={isCategories ? 'page' : undefined}>
          <LayoutGrid className="h-6 w-6" strokeWidth={isCategories ? 2.5 : 2} />Categorías
        </Link>
        <button onClick={openCart} className={tab(cartOpen)}>
          <span className="relative">
            <ShoppingCart className="h-6 w-6" strokeWidth={cartOpen ? 2.5 : 2} />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-2.5 h-5 min-w-5 px-1 bg-brand-green-600 text-white text-[11px] font-extrabold rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </span>
          Carrito
        </button>
        <Link to={isLoggedIn ? '/mis-pedidos' : '/ingresar'} className={tab(isAccount)} aria-current={isAccount ? 'page' : undefined}>
          <User className="h-6 w-6" strokeWidth={isAccount ? 2.5 : 2} />{isLoggedIn ? 'Cuenta' : 'Ingresar'}
        </Link>
      </div>
    </nav>
  )
}
