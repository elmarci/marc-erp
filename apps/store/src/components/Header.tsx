import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Package, User, LogOut, Tag, ChevronDown, Menu } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'
import { AuthModal } from './AuthModal'
import { CategoryDrawer } from './CategoryDrawer'
import { CategoryMegaMenu } from './CategoryMegaMenu'

export function Header() {
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { customer, isLoggedIn, logout } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const navigate = useNavigate()

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'], queryFn: () => storeApi.getOffers(), staleTime: 300000,
  })
  const offersCount = offersData?.data.data.length ?? 0

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate(`/catalogo?search=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3 sm:gap-4">

          {/* Hamburguesa — solo mobile, en desktop ya está el dropdown de Categorías */}
          <button onClick={() => setShowDrawer(true)} aria-label="Abrir menú de categorías"
            className="md:hidden flex items-center justify-center h-9 w-9 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 hover:text-brand-blue-600 transition-colors">
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <img src="/logo.png" alt="Minimarket Marc" className="h-8 sm:h-9 w-auto" />
          </Link>

          {/* Categorías — dropdown, reemplaza la barra sólida anterior */}
          <CategoryMegaMenu />

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full bg-gray-100 border border-transparent rounded-full pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-brand-blue-400 transition-colors" />
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Link to="/ofertas" className="relative hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue-600 transition-colors px-3 py-2">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-brand-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{offersCount}</span>}
            </Link>

            {isLoggedIn && customer ? (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue-600 transition-colors px-3 py-2">
                  <div className="h-6 w-6 bg-brand-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {customer.name[0].toUpperCase()}
                  </div>
                  <span>{customer.name.split(' ')[0]}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44">
                      <Link to="/mis-pedidos" onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <Package className="h-4 w-4 text-gray-400" />Mis pedidos
                      </Link>
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={() => { logout(); setShowMenu(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                        <LogOut className="h-4 w-4" />Cerrar sesión
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-blue-600 transition-colors px-3 py-2">
                <User className="h-4 w-4" />Ingresar
              </button>
            )}

            <Link to="/mis-pedidos" className="sm:hidden flex items-center px-2 py-2 text-gray-500 hover:text-brand-blue-600">
              <Package className="h-5 w-5" />
            </Link>

            <button onClick={openCart}
              className="relative flex items-center gap-2 bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold rounded-full px-4 py-2 text-sm transition-colors">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-brand-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {showDrawer && <CategoryDrawer onClose={() => setShowDrawer(false)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
