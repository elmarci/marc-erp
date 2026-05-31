import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Tag, User, Package } from 'lucide-react'
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
  const { customer, isLoggedIn } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const navigate = useNavigate()

  const { data } = useQuery({ queryKey:['store-offers'], queryFn:()=>storeApi.getOffers(), staleTime:300000 })
  const offersCount = data?.data.data.length ?? 0

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate(`/catalogo?search=${encodeURIComponent(search.trim())}`)
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">

          {/* Logo */}
          <Link to="/" className="shrink-0 flex items-center">
            <img src="/logo-light.png" alt="MARC" className="h-8 w-auto hidden sm:block" onError={e=>(e.currentTarget.style.display='none')} />
            <span className="font-black text-lg text-gray-900 hidden sm:block">MARC</span>
            <span className="font-black text-lg text-gray-900 sm:hidden">M</span>
          </Link>

          {/* Búsqueda */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="¿Qué necesitas?"
                className="w-full h-10 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:bg-white transition-colors"
              />
            </div>
          </form>

          {/* Nav */}
          <div className="flex items-center gap-1 shrink-0">
            <Link to="/ofertas" className="relative hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{offersCount}</span>}
            </Link>

            {isLoggedIn && customer ? (
              <Link to="/mis-pedidos" className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors">
                <Package className="h-4 w-4" />{customer.name.split(' ')[0]}
              </Link>
            ) : (
              <button onClick={()=>setShowAuth(true)} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors">
                <User className="h-4 w-4" />Ingresar
              </button>
            )}

            <button onClick={openCart} className="relative flex items-center gap-2 h-10 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-gray-900 text-white text-[11px] font-bold rounded-full flex items-center justify-center">{count}</span>}
            </button>
          </div>
        </div>
      </header>
      {showAuth && <AuthModal onClose={()=>setShowAuth(false)} />}
    </>
  )
}
