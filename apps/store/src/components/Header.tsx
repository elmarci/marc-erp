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
      <header className="sticky top-0 z-40 bg-white border-b border-ln shadow-sm2">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">

          {/* Logo */}
          <Link to="/" className="shrink-0">
            <img src="/logo-light.png" alt="MARC" className="h-8 w-auto hidden sm:block" />
            <img src="/logo-icon.png" alt="M" className="h-8 w-8 sm:hidden" />
          </Link>

          {/* Buscador */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-bk-4" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="¿Qué necesitas hoy?"
                className="w-full h-10 pl-10 pr-4 bg-g-xl border border-ln-g rounded-full text-sm text-bk placeholder-bk-4
                           focus:outline-none focus:border-g focus:bg-white transition-all"
              />
            </div>
          </form>

          {/* Links */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link to="/ofertas" className="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-bk-3 hover:text-g transition-colors rounded-lg hover:bg-g-p">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {offersCount}
                </span>
              )}
            </Link>

            {isLoggedIn && customer ? (
              <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-bk-3 hover:text-bk rounded-lg hover:bg-g-p transition-colors">
                  <div className="h-6 w-6 bg-g rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {customer.name[0].toUpperCase()}
                  </div>
                  {customer.name.split(' ')[0]}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 bg-white border border-ln rounded-xl2 shadow-lg2 py-1.5 w-44">
                      <Link to="/mis-pedidos" onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-bk-2 hover:bg-g-p transition-colors">
                        <Package className="h-4 w-4 text-bk-4" />Mis pedidos
                      </Link>
                      <div className="border-t border-ln my-1" />
                      <button onClick={() => { logout(); setShowUserMenu(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                        <LogOut className="h-4 w-4" />Salir
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-bk-3 hover:text-bk rounded-lg hover:bg-g-p transition-colors">
                <User className="h-4 w-4" />Ingresar
              </button>
            )}
          </nav>

          {/* Carrito */}
          <button onClick={openCart}
            className="relative flex items-center gap-2 h-10 px-4 bg-g hover:bg-g-l text-white text-sm font-bold rounded-full transition-colors shadow-btn">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-bk text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
