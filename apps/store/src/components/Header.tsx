import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Package, Tag, User, LogOut, ChevronDown } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'
import { AuthModal } from './AuthModal'

export function Header() {
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { customer, isLoggedIn, logout } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
    staleTime: 5 * 60 * 1000,
  })
  const offersCount = offersData?.data.data.length ?? 0

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate(`/catalogo?search=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-[--border] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <img src="/logo-light.png" alt="MARC" className="h-9 w-auto object-contain hidden sm:block" />
            <img src="/logo-icon.png" alt="MARC" className="h-9 w-auto object-contain sm:hidden" />
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-marc/30" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="¿Qué estás buscando?"
                className="w-full bg-bg border border-[--border] rounded-full pl-9 pr-4 py-2 text-sm text-marc placeholder-marc/40 focus:outline-none focus:border-primary transition-colors" />
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Offers */}
            <Link to="/ofertas" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-marc/60 hover:text-primary transition-colors px-3 py-2 relative">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {offersCount}
                </span>
              )}
            </Link>

            {/* User */}
            {isLoggedIn && customer ? (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)}
                  className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-marc/70 hover:text-marc transition-colors px-3 py-2">
                  <div className="h-7 w-7 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span>{customer.name.split(' ')[0]}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 top-12 bg-white border border-[--border] rounded-2xl shadow-card-hover p-2 w-48 z-50">
                    <Link to="/mis-pedidos" onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-marc/70 hover:bg-bg hover:text-marc rounded-xl transition-colors">
                      <Package className="h-4 w-4" />Mis pedidos
                    </Link>
                    <button onClick={() => { logout(); setShowUserMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                      <LogOut className="h-4 w-4" />Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-marc/60 hover:text-marc transition-colors px-3 py-2">
                <User className="h-4 w-4" />Ingresar
              </button>
            )}

            {/* Pedidos mobile */}
            <Link to="/mis-pedidos" className="sm:hidden p-2 text-marc/50 hover:text-marc">
              <Package className="h-5 w-5" />
            </Link>

            {/* Cart */}
            <button onClick={openCart}
              className="relative flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-full px-4 py-2 text-sm transition-colors shadow-green">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-marc text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
