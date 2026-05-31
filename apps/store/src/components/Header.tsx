import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Package, Tag, User } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useState } from 'react'
import { AuthModal } from './AuthModal'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'

export function Header() {
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { customer, isLoggedIn } = useAuthStore()
  const [showAuth, setShowAuth] = useState(false)
  const { data: offersData } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
    staleTime: 5 * 60 * 1000,
  })
  const offersCount = offersData?.data.data.length ?? 0
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate(`/catalogo?search=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link to="/" className="flex items-center shrink-0">
          <img src="/logo-icon.png" alt="MARC" className="h-9 w-auto object-contain sm:hidden" />
          <img src="/logo-dark.png" alt="TIENDA MARC" className="h-9 w-auto object-contain hidden sm:block" />
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full bg-gray-50 border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-white/40 focus:outline-none focus:border-green-400 transition-colors" />
          </div>
        </form>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/ofertas" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-900/60 hover:text-gray-900 transition-colors px-3 py-2 relative">
            <Tag className="h-4 w-4" />
            <span>Ofertas</span>
            {offersCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-green-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {offersCount}
              </span>
            )}
          </Link>
          {isLoggedIn && customer ? (
            <Link to="/mis-pedidos" className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2">
              <Package className="h-4 w-4" />
              <span>{customer.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-2">
              <User className="h-4 w-4" />Ingresar
            </button>
          )}
          <button onClick={openCart}
            className="relative flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-full px-4 py-2 text-sm transition-colors">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-gray-900 text-green-400 text-xs font-bold rounded-full flex items-center justify-center border border-green-400">
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
