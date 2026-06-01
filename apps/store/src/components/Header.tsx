import { Link } from 'react-router-dom'
import { ShoppingCart, Search, Package } from 'lucide-react'
import { useCartStore } from '../cartStore'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function Header() {
  const { count, openCart } = useCartStore()
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) navigate(`/catalogo?search=${encodeURIComponent(search.trim())}`)
  }

  return (
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
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-green-400 transition-colors"
            />
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/mis-pedidos" className="hidden sm:flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors px-3 py-2">
            <Package className="h-4 w-4" />
            <span>Mis pedidos</span>
          </Link>
          <button onClick={openCart} className="relative flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-full px-4 py-2 text-sm transition-colors">
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
  )
}
