import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Package, User, LogOut, Tag, ChevronDown } from 'lucide-react'
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
  const [showMenu, setShowMenu] = useState(false)
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
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 bg-black border-2 border-green-400 rounded-lg flex items-center justify-center">
              <span className="text-green-400 font-black text-sm">M</span>
            </div>
            <span className="font-black text-white tracking-widest text-sm hidden sm:block">TIENDA MARC</span>
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-green-400 transition-colors" />
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Link to="/ofertas" className="relative hidden sm:flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors px-3 py-2">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-green-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">{offersCount}</span>}
            </Link>

            {isLoggedIn && customer ? (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors px-3 py-2">
                  <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center text-black text-xs font-bold">
                    {customer.name[0].toUpperCase()}
                  </div>
                  <span>{customer.name.split(' ')[0]}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl py-1 w-44">
                      <Link to="/mis-pedidos" onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                        <Package className="h-4 w-4 text-white/40" />Mis pedidos
                      </Link>
                      <div className="border-t border-white/10 my-1" />
                      <button onClick={() => { logout(); setShowMenu(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors">
                        <LogOut className="h-4 w-4" />Cerrar sesión
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => setShowAuth(true)}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors px-3 py-2">
                  <User className="h-4 w-4" />Ingresar
                </button>
              </>
            )}

            <Link to="/mis-pedidos" className="sm:hidden flex items-center px-2 py-2 text-white/60 hover:text-white">
              <Package className="h-5 w-5" />
            </Link>

            <button onClick={openCart}
              className="relative flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-full px-4 py-2 text-sm transition-colors">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-black text-green-400 text-xs font-bold rounded-full flex items-center justify-center border border-green-400">
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
