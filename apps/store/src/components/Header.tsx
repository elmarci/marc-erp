import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Search, Package, User, LogOut, Tag, ChevronDown, Menu } from 'lucide-react'
import { useCartStore, cartCount } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'
import { CategoryMegaMenu } from './CategoryMegaMenu'
import { VoiceSearchButton } from './VoiceSearchButton'
import { SideMenu } from './SideMenu'
import { BRAND_NAME, DELIVERY } from '../lib/storeInfo'

// Cabecera azul de marca. En celular son dos piezas: la fila del logo, que
// se va con el scroll, y la fila del buscador, que queda fija arriba (mide
// 64 px, lo mismo que la cabecera de escritorio, para que las barras fijas
// de cada página — p. ej. "estás acá" del catálogo — sigan usando top-16).
export function Header() {
  const items = useCartStore(s => s.items)
  const openCart = useCartStore(s => s.openCart)
  const count = cartCount(items)
  const { customer, logout } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showSideMenu, setShowSideMenu] = useState(false)
  const navigate = useNavigate()

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'], queryFn: () => storeApi.getOffers(), staleTime: 300000,
  })
  const offersCount = offersData?.data.data.length ?? 0

  const goSearch = (q: string) => {
    if (q.trim()) navigate(`/catalogo?search=${encodeURIComponent(q.trim())}`)
  }
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); goSearch(search) }

  const searchField = (placeholder: string) => (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-paper-ink-soft" aria-hidden="true" />
      <input type="search" enterKeyHint="search" value={search} onChange={e => setSearch(e.target.value)}
        placeholder={placeholder} aria-label="Buscar productos"
        className="w-full h-12 bg-white rounded-2xl pl-11 pr-12 text-base text-paper-ink placeholder:text-paper-ink-ghost focus:outline-none focus:ring-2 focus:ring-brand-sun-400" />
      <VoiceSearchButton onResult={goSearch} className="absolute right-0.5 top-1/2 -translate-y-1/2" />
    </div>
  )

  return (
    <>
      <header className="md:sticky md:top-0 z-50 bg-brand-blue-600 text-white">
        <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
          <button onClick={() => setShowSideMenu(true)} aria-label="Abrir menú"
            className="md:hidden -ml-2 flex items-center justify-center h-11 w-11 shrink-0 rounded-full hover:bg-brand-blue-700 transition-colors">
            <Menu className="h-6 w-6" />
          </button>

          <Link to="/" className="flex items-center gap-2.5 shrink-0 min-w-0">
            <img src="/logo-icon.png" alt="" width={40} height={40} className="h-10 w-10 rounded-full bg-white object-cover" />
            <span className="leading-tight min-w-0">
              <span className="block text-lg font-extrabold truncate">{BRAND_NAME}</span>
              <span className="block text-xs font-semibold text-brand-blue-100 truncate">Reparto en {DELIVERY.zoneName}</span>
            </span>
          </Link>

          <CategoryMegaMenu />

          <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-xl">
            {searchField('Busca leche, arroz, gaseosa…')}
          </form>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-1 shrink-0">
            <Link to="/ofertas" className="relative hidden md:flex items-center gap-1.5 text-sm font-semibold hover:bg-brand-blue-700 rounded-full px-3 h-11 transition-colors">
              <Tag className="h-4 w-4" />Ofertas
              {offersCount > 0 && <span className="h-5 min-w-5 px-1 bg-brand-sun-400 text-brand-sun-900 text-xs font-extrabold rounded-full flex items-center justify-center">{offersCount}</span>}
            </Link>

            {customer ? (
              <div className="relative hidden md:block">
                <button onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:bg-brand-blue-700 rounded-full px-3 h-11 transition-colors">
                  <span className="h-7 w-7 bg-white text-brand-blue-600 rounded-full flex items-center justify-center text-xs font-extrabold">
                    {customer.name[0].toUpperCase()}
                  </span>
                  {customer.name.split(' ')[0]}
                  <ChevronDown className="h-4 w-4" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-12 z-50 bg-white text-paper-ink border border-paper-line rounded-2xl shadow-xl py-1 w-48">
                      <Link to="/mis-pedidos" onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-paper-surface transition-colors">
                        <Package className="h-4 w-4 text-paper-ink-soft" />Mis pedidos
                      </Link>
                      <div className="border-t border-paper-line my-1" />
                      <button onClick={() => { logout(); setShowMenu(false) }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-brand-magenta-600 hover:bg-brand-magenta-50 transition-colors">
                        <LogOut className="h-4 w-4" />Cerrar sesión
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link to="/ingresar" className="hidden md:flex items-center gap-1.5 text-sm font-semibold hover:bg-brand-blue-700 rounded-full px-3 h-11 transition-colors">
                <User className="h-4 w-4" />Ingresar
              </Link>
            )}

            {/* En celular el carrito vive en la barra fija de abajo; acá va
                el acceso a la cuenta. */}
            <Link to={customer ? '/mis-pedidos' : '/ingresar'} aria-label={customer ? 'Mi cuenta' : 'Ingresar'}
              className="md:hidden flex items-center justify-center h-11 w-11 rounded-full bg-brand-blue-700">
              {customer
                ? <span className="text-sm font-extrabold">{customer.name[0].toUpperCase()}</span>
                : <User className="h-5 w-5" />}
            </Link>

            <button data-cart-target onClick={openCart}
              className="hidden md:flex relative items-center gap-2 bg-white text-brand-blue-600 font-bold rounded-full px-4 h-11 text-sm">
              <ShoppingCart className="h-4 w-4" />Carrito
              {count > 0 && (
                <span className="h-5 min-w-5 px-1 bg-brand-green-600 text-white text-xs font-extrabold rounded-full flex items-center justify-center">{count}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <form onSubmit={handleSearch} className="md:hidden sticky top-0 z-40 h-16 bg-brand-blue-600 px-4 pt-1 pb-3">
        {searchField('Busca leche, arroz, gaseosa…')}
      </form>

      <SideMenu open={showSideMenu} onClose={() => setShowSideMenu(false)} />
    </>
  )
}
