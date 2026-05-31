import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Search, X, Grid2X2, List, SlidersHorizontal } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'

const CATEGORY_ICONS: Record<string, string> = {
  'Abarrotes': '🛒', 'Bebidas': '🥤', 'Lácteos': '🥛', 'Frutas': '🍎', 'Verduras': '🥦',
  'Carnes': '🥩', 'Panadería': '🍞', 'Limpieza': '🧹', 'Higiene': '🧴', 'Snacks': '🍿',
  'Golosinas': '🍬', 'Congelados': '❄️', 'Mascotas': '🐾',
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
    setCategoryId(searchParams.get('categoryId') ?? '')
    setPage(1)
  }, [searchParams])

  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['store-products', search, categoryId, page],
    queryFn: () => storeApi.getProducts({
      ...(search ? { search } : {}),
      ...(categoryId ? { categoryId } : {}),
      page, limit: 24,
    }),
  })

  const categories = categoriesData?.data.data ?? []
  const products = productsData?.data.data ?? []
  const pagination = productsData?.data.pagination

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams(prev => { if (search) prev.set('search', search); else prev.delete('search'); return prev })
    setPage(1)
  }

  const handleCategory = (id: string) => {
    setCategoryId(id)
    setSearchParams(prev => { if (id) prev.set('categoryId', id); else prev.delete('categoryId'); return prev })
    setPage(1)
  }

  const selectedCat = categories.find(c => c.id === categoryId)

  return (
    <main className="bg-bg min-h-screen">
      {/* Sticky filters bar */}
      <div className="sticky top-16 z-30 bg-white border-b border-[--border] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          {/* Search + view toggle */}
          <div className="flex gap-3">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-marc/30" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar productos..."
                  className="w-full bg-bg border border-[--border] rounded-full pl-9 pr-4 py-2 text-sm text-marc focus:outline-none focus:border-primary transition-colors" />
                {search && (
                  <button type="button" onClick={() => { setSearch(''); setSearchParams(prev => { prev.delete('search'); return prev }); setPage(1) }}
                    className="absolute right-3 top-2.5 text-marc/30 hover:text-marc/60">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
            <div className="flex items-center gap-1 bg-bg border border-[--border] rounded-full px-2">
              <button onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-marc/40 hover:text-marc'}`}>
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-full transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-marc/40 hover:text-marc'}`}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Category chips — horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => handleCategory('')}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                !categoryId ? 'bg-primary text-white shadow-green' : 'bg-bg border border-[--border] text-marc/60 hover:border-primary/40'
              }`}>
              🛒 Todos
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => handleCategory(cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  categoryId === cat.id ? 'bg-primary text-white shadow-green' : 'bg-bg border border-[--border] text-marc/60 hover:border-primary/40'
                }`}>
                {CATEGORY_ICONS[cat.name] ?? '📦'} {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-marc">
            {selectedCat ? `${CATEGORY_ICONS[selectedCat.name] ?? '📦'} ${selectedCat.name}` :
             search ? `Resultados: "${search}"` : 'Todos los productos'}
          </h1>
          {pagination && <p className="text-sm text-marc/40 mt-0.5">{pagination.total} productos</p>}
        </div>
        {(search || categoryId) && (
          <button onClick={() => { setSearch(''); setCategoryId(''); setSearchParams({}); setPage(1) }}
            className="flex items-center gap-1.5 text-sm text-marc/50 hover:text-marc border border-[--border] px-3 py-1.5 rounded-full transition-colors">
            <X className="h-3.5 w-3.5" />Limpiar
          </button>
        )}
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 pb-16">
        {isLoading ? (
          <div className={`grid gap-3 ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-1'}`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`bg-white rounded-2xl animate-pulse ${viewMode === 'grid' ? 'aspect-[3/4]' : 'h-24'}`} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-marc/30">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-semibold">No se encontraron productos</p>
            <p className="text-sm mt-1">Intenta con otro término</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {products.map(product => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          // List mode
          <div className="space-y-3">
            {products.map(product => (
              <div key={product.id}
                className="bg-white rounded-2xl shadow-card hover:shadow-card-hover border border-[--border] p-3 flex gap-4 cursor-pointer transition-all"
                onClick={() => {
                  const { addItem } = (window as unknown as { cartStore?: { addItem: (p: typeof product) => void } }).cartStore ?? {}
                  // fallback: just show
                }}>
                <div className="h-20 w-20 rounded-xl overflow-hidden bg-cream shrink-0">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary font-semibold">{product.category.name}</p>
                  <p className="font-semibold text-marc line-clamp-2 text-sm">{product.name}</p>
                  {product.description && <p className="text-xs text-marc/40 line-clamp-1 mt-0.5">{product.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-marc">S/ {Number(product.salePrice).toFixed(2)}</p>
                  <p className={`text-xs mt-0.5 ${product.currentStock <= 5 ? 'text-primary' : 'text-green-dark'}`}>
                    {product.currentStock <= 0 ? 'Sin stock' : product.currentStock <= 5 ? `${product.currentStock} disp.` : '✓ En stock'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center gap-3 mt-10">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="px-6 py-2.5 bg-white border border-[--border] hover:border-primary/40 disabled:opacity-30 rounded-full text-sm font-medium text-marc/60 transition-colors">
              ← Anterior
            </button>
            <span className="flex items-center px-4 text-sm text-marc/40">Pág. {page} / {pagination.totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}
              className="px-6 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-30 text-white font-bold rounded-full text-sm transition-colors shadow-green">
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
