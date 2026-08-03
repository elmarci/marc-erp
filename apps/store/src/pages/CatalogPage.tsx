import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, X, ChevronRight, Home } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const [page, setPage] = useState(1)

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
  const activeCategory = categories.find(c => c.id === categoryId)
  const products = productsData?.data.data ?? []
  const pagination = productsData?.data.pagination

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams(prev => {
      if (search) prev.set('search', search); else prev.delete('search')
      return prev
    })
    setPage(1)
  }

  const handleCategory = (id: string) => {
    setCategoryId(id)
    setSearchParams(prev => {
      if (id) prev.set('categoryId', id); else prev.delete('categoryId')
      return prev
    })
    setPage(1)
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-brand-blue-600 transition-colors flex items-center gap-1"><Home className="h-3.5 w-3.5" />Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-gray-700 font-medium">{activeCategory ? activeCategory.name : search ? `Búsqueda: "${search}"` : 'Catálogo'}</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6 text-gray-900">
        {activeCategory ? activeCategory.name : 'Catálogo de productos'}
      </h1>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full bg-white border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-blue-400 transition-colors" />
          </div>
        </form>
        {(search || categoryId) && (
          <button onClick={() => { setSearch(''); setCategoryId(''); setSearchParams({}); setPage(1) }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 px-4 py-2 border border-gray-200 rounded-full transition-colors bg-white">
            <X className="h-4 w-4" />Limpiar filtros
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-8">
        <button onClick={() => handleCategory('')}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${!categoryId ? 'bg-brand-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          Todos
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => handleCategory(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${categoryId === cat.id ? 'bg-brand-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl aspect-square animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Search className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg text-gray-500">No se encontraron productos</p>
          <p className="text-sm mt-1">Intenta con otro término de búsqueda</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4 text-sm text-gray-400">
            <span>{pagination?.total ?? 0} productos</span>
            <span>Pág. {page} / {pagination?.totalPages ?? 1}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center gap-3 mt-10">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="px-6 py-2.5 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border border-gray-200 rounded-full text-sm text-gray-700 transition-colors">
                Anterior
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages}
                className="px-6 py-2.5 bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-full text-sm transition-colors">
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
