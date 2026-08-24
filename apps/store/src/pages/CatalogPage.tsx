import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, X, ChevronRight, Home, LayoutGrid, Loader2 } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'
import { VoiceSearchButton } from '../components/VoiceSearchButton'
import { getCategoryIcon } from '../categoryIcons'

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
    setCategoryId(searchParams.get('categoryId') ?? '')
  }, [searchParams])

  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })

  // Scroll infinito en vez de "página siguiente" — el celular ya no
  // interrumpe el deslizado natural para forzar un tap en un botón de
  // paginación al llegar al final de la grilla.
  const {
    data: productsData, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['store-products', search, categoryId],
    queryFn: ({ pageParam }) => storeApi.getProducts({
      ...(search ? { search } : {}),
      ...(categoryId ? { categoryId } : {}),
      page: pageParam, limit: 24,
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.data.pagination
      return page < totalPages ? page + 1 : undefined
    },
  })

  const categories = categoriesData?.data.data ?? []
  // Ojo: `activeTopCategory` es un `Category` real (con `.children`); el
  // resultado de buscar entre los hijos aplanados es un `CategoryChild`, que
  // NO tiene `.children` — mezclarlos en un solo `activeCategory` causaba un
  // crash al leer `.children.length` cuando la categoría activa era una hoja.
  const activeTopCategory = categories.find(c => c.id === categoryId)
  const activeCategory = activeTopCategory
    ?? categories.flatMap(c => c.children).find(c => c.id === categoryId)
  const activeParent = categories.find(c => c.children.some(ch => ch.id === categoryId))
  const products = useMemo(() => productsData?.pages.flatMap(p => p.data.data) ?? [], [productsData])
  const pagination = productsData?.pages[0]?.data.pagination
  // Subcategorías de acceso rápido arriba: si estoy viendo una categoría
  // padre, sus hijas; si estoy dentro de una hija, sus hermanas (para poder
  // saltar entre subcategorías sin volver al nivel de arriba primero).
  const subcategoryParent = activeTopCategory && activeTopCategory.children.length > 0 ? activeTopCategory : activeParent
  const subcategories = subcategoryParent?.children ?? []

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '400px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, products.length])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchParams(prev => {
      if (search) prev.set('search', search); else prev.delete('search')
      return prev
    })
  }

  const handleVoiceResult = (transcript: string) => {
    const q = transcript.trim()
    setSearch(q)
    setSearchParams(prev => {
      if (q) prev.set('search', q); else prev.delete('search')
      return prev
    })
  }

  const handleCategory = (id: string) => {
    setCategoryId(id)
    setSearchParams(prev => {
      if (id) prev.set('categoryId', id); else prev.delete('categoryId')
      return prev
    })
  }

  return (
    <main className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-paper-ink-soft mb-4">
        <Link to="/" className="hover:text-brand-green-600 transition-colors flex items-center gap-1"><Home className="h-3.5 w-3.5" />Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost" />
        {activeParent && (
          <>
            <button onClick={() => handleCategory(activeParent.id)} className="hover:text-brand-green-600 transition-colors">{activeParent.name}</button>
            <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost" />
          </>
        )}
        <span className="text-paper-ink font-medium">{activeCategory ? activeCategory.name : search ? `Búsqueda: "${search}"` : 'Catálogo'}</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6 text-paper-ink">
        {activeCategory ? activeCategory.name : 'Catálogo de productos'}
      </h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar de categorías — solo desktop, en mobile se usan los pills */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 bg-white border border-paper-line rounded-2xl shadow-sm p-3">
            <p className="text-xs font-bold text-paper-ink-ghost uppercase tracking-wide px-2 py-2">Categorías</p>
            <button onClick={() => handleCategory('')}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${!categoryId ? 'bg-brand-green-600 text-white' : 'text-paper-ink-soft hover:bg-paper-surface'}`}>
              <LayoutGrid className="h-4 w-4" />Todos los productos
            </button>
            <div className="mt-1 space-y-0.5">
              {categories.map(cat => {
                const Icon = getCategoryIcon(cat.name)
                const isActive = categoryId === cat.id
                const isParentActive = activeParent?.id === cat.id
                return (
                  <div key={cat.id}>
                    <button onClick={() => handleCategory(cat.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-brand-green-600 text-white' : 'text-paper-ink hover:bg-paper-surface'}`}>
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-brand-blue-500'}`} />
                      <span className="flex-1 text-left truncate">{cat.name}</span>
                      <span className={`text-xs ${isActive ? 'text-white/70' : 'text-paper-ink-ghost'}`}>{cat._count.products}</span>
                    </button>
                    {cat.children.length > 0 && (isActive || isParentActive) && (
                      <div className="pl-6 mt-0.5 space-y-0.5">
                        {cat.children.map(child => (
                          <button key={child.id} onClick={() => handleCategory(child.id)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${categoryId === child.id ? 'bg-brand-green-50 text-brand-green-700 font-medium' : 'text-paper-ink-soft hover:bg-paper-surface'}`}>
                            <span className="flex-1 text-left truncate">{child.name}</span>
                            <span className="text-xs text-paper-ink-ghost">{child._count.products}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-paper-ink-ghost" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar productos..."
                  className="w-full bg-white border border-paper-line rounded-full pl-9 pr-10 py-2 text-sm text-paper-ink placeholder-paper-ink-ghost focus:outline-none focus:border-brand-blue-400 transition-colors" />
                <VoiceSearchButton onResult={handleVoiceResult} className="absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </form>
            {(search || categoryId) && (
              <button onClick={() => { setSearch(''); setCategoryId(''); setSearchParams({}) }}
                className="flex items-center gap-2 text-sm text-paper-ink-soft hover:text-paper-ink px-4 py-2 border border-paper-line rounded-full transition-colors bg-white">
                <X className="h-4 w-4" />Limpiar filtros
              </button>
            )}
          </div>

          {/* Categories — pills, solo mobile/tablet */}
          <div className="flex lg:hidden gap-2 overflow-x-auto h-scroll pb-3 mb-1">
            <button onClick={() => handleCategory('')}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${!categoryId ? 'bg-brand-green-600 text-white' : 'bg-white border border-paper-line text-paper-ink-soft hover:bg-paper-surface'}`}>
              Todos
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => handleCategory(cat.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${categoryId === cat.id || activeParent?.id === cat.id ? 'bg-brand-green-600 text-white' : 'bg-white border border-paper-line text-paper-ink-soft hover:bg-paper-surface'}`}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Subcategorías de la categoría activa — acceso rápido arriba,
              en vez de obligar a volver al drawer/sidebar para cambiar de
              subcategoría. Sólo aparece si la categoría tiene hijas. */}
          {subcategoryParent && subcategories.length > 0 && (
            <div className="flex lg:hidden gap-1.5 overflow-x-auto h-scroll pb-4 mb-2">
              <button onClick={() => handleCategory(subcategoryParent.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${categoryId === subcategoryParent.id ? 'bg-brand-green-50 text-brand-green-700 border border-brand-green-200' : 'bg-paper-surface text-paper-ink-soft hover:bg-paper-line'}`}>
                Todo en {subcategoryParent.name}
              </button>
              {subcategories.map(child => (
                <button key={child.id} onClick={() => handleCategory(child.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${categoryId === child.id ? 'bg-brand-green-600 text-white' : 'bg-paper-surface text-paper-ink-soft hover:bg-paper-line'}`}>
                  {child.name}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-paper-surface rounded-2xl aspect-square animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-paper-ink-ghost">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg text-paper-ink-soft">No se encontraron productos</p>
              <p className="text-sm mt-1">Intenta con otro término de búsqueda</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4 text-sm text-paper-ink-ghost">
                <span>{pagination?.total ?? 0} productos</span>
                <span>Mostrando {products.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Sentinel de scroll infinito — al entrar en vista dispara la
                  siguiente página sola, sin botón "Siguiente". */}
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 text-brand-green-600 animate-spin" />
                </div>
              )}
              {!hasNextPage && products.length > 0 && (
                <p className="text-center text-xs text-paper-ink-ghost py-10">Ya viste todos los productos de esta lista.</p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
