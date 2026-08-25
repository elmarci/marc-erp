import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Search, X, ChevronDown, LayoutGrid, Loader2 } from 'lucide-react'
import { storeApi } from '../api'
import type { Category, Product } from '../api'
import { ProductCard } from '../components/ProductCard'
import { VoiceSearchButton } from '../components/VoiceSearchButton'
import { getCategoryIcon } from '../categoryIcons'
import { useUIStore } from '../uiStore'

// Mismo trato que los íconos de categoría del Inicio: un acento de color fijo
// por posición, para que el banner "estás acá" sea consistente entre
// categorías en vez de un gris genérico. Padre e hija comparten acento
// (se busca el índice de la categoría de nivel superior) para que cambiar
// entre subcategorías de un mismo padre no cambie el color de golpe.
const BANNER_ACCENTS = [
  'bg-gradient-to-r from-brand-green-600 to-brand-green-700',
  'bg-gradient-to-r from-brand-blue-600 to-brand-blue-700',
  'bg-gradient-to-r from-brand-magenta-600 to-brand-magenta-700',
]
const DEFAULT_BANNER_ACCENT = 'bg-gradient-to-r from-paper-ink to-brand-blue-800'

// Una "unidad" es lo mínimo navegable con productos propios: una
// subcategoría (si la categoría de nivel superior tiene hijas) o la propia
// categoría de nivel superior (si no tiene). Aplanar el árbol en una sola
// secuencia permite "caminarlo" en orden sin importar en qué nivel esté el
// usuario — así se puede saltar de una subcategoría a la siguiente, y al
// acabar las subcategorías de un padre, seguir con la próxima categoría de
// nivel superior, todo con la misma lógica.
interface Unit { id: string; name: string; parentName?: string; parentId?: string }
function buildSequence(categories: Category[]): Unit[] {
  const units: Unit[] = []
  categories.forEach(cat => {
    if (cat.children.length > 0) {
      cat.children.forEach(child => units.push({ id: child.id, name: child.name, parentName: cat.name, parentId: cat.id }))
    } else {
      units.push({ id: cat.id, name: cat.name })
    }
  })
  return units
}

interface FeedSection { unit: Unit; products: Product[]; page: number; totalPages: number; total: number }

// Referencia estable para cuando todavía no cargaron las categorías — un
// `?? []` inline crea un arreglo NUEVO en cada render, lo que invalidaba el
// useMemo/useEffect que dependen de `categories` y producía un loop
// infinito de renders mientras se esperaba la respuesta del API.
const EMPTY_CATEGORIES: Category[] = []

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const openCategoryDrawer = useUIStore(s => s.openCategoryDrawer)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
    setCategoryId(searchParams.get('categoryId') ?? '')
    setDropdownOpen(false)
  }, [searchParams])

  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })
  const categories = categoriesData?.data.data ?? EMPTY_CATEGORIES

  // Modo "encadenado": al elegir una categoría/subcategoría concreta (y no
  // estar buscando texto), el feed camina la secuencia completa de
  // categorías en vez de quedarse pegado a una sola. Buscar por texto sigue
  // siendo una lista plana simple — no tiene un "orden de categorías" al
  // que encadenarse.
  const isChained = Boolean(categoryId) && !search
  const sequence = useMemo(() => buildSequence(categories), [categories])
  const startIndex = useMemo(() => {
    if (!isChained) return -1
    const exact = sequence.findIndex(u => u.id === categoryId)
    if (exact >= 0) return exact
    // El id elegido es una categoría padre (no está en la secuencia porque
    // sus hijas son las unidades reales) — arrancar por la primera hija.
    const parent = categories.find(c => c.id === categoryId)
    if (parent && parent.children.length > 0) {
      return sequence.findIndex(u => u.id === parent.children[0].id)
    }
    return -1
  }, [sequence, categoryId, categories, isChained])

  const [sections, setSections] = useState<FeedSection[]>([])
  const [chainPos, setChainPos] = useState(0)
  const [chainLoading, setChainLoading] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const generationRef = useRef(0)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [visibleUnit, setVisibleUnit] = useState<Unit | null>(null)

  const fetchUnitPage = async (unit: Unit, page: number, gen: number, mode: 'reset' | 'append-page' | 'append-section') => {
    if (mode === 'reset') setChainLoading(true); else setFetchingMore(true)
    try {
      const res = await storeApi.getProducts({ categoryId: unit.id, page, limit: 24 })
      if (generationRef.current !== gen) return // el usuario ya navegó a otro lado
      const { data, pagination } = res.data
      setSections(prev => {
        const section: FeedSection = { unit, products: data, page, totalPages: pagination.totalPages, total: pagination.total }
        if (mode === 'reset') return [section]
        if (mode === 'append-section') return [...prev, section]
        return prev.map((s, i) => i === prev.length - 1 ? { ...s, products: [...s.products, ...data], page } : s)
      })
    } finally {
      if (generationRef.current === gen) { setChainLoading(false); setFetchingMore(false) }
    }
  }

  // Reinicia el feed encadenado cada vez que cambia la categoría elegida.
  useEffect(() => {
    if (!isChained || startIndex < 0 || sequence.length === 0) {
      setSections(prev => prev.length === 0 ? prev : [])
      setVisibleUnit(prev => prev === null ? prev : null)
      return
    }
    const gen = ++generationRef.current
    setChainPos(startIndex)
    setVisibleUnit(null)
    fetchUnitPage(sequence[startIndex], 1, gen, 'reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChained, startIndex, sequence])

  const lastSection = sections[sections.length - 1]
  const hasMoreChained = isChained && Boolean(lastSection) &&
    (lastSection!.page < lastSection!.totalPages || chainPos + 1 < sequence.length)

  const handleLoadMoreChained = () => {
    if (fetchingMore || chainLoading || !lastSection) return
    const gen = generationRef.current
    if (lastSection.page < lastSection.totalPages) {
      fetchUnitPage(lastSection.unit, lastSection.page + 1, gen, 'append-page')
    } else if (chainPos + 1 < sequence.length) {
      const nextPos = chainPos + 1
      setChainPos(nextPos)
      fetchUnitPage(sequence[nextPos], 1, gen, 'append-section')
    }
  }

  // "Scrollspy": qué sección está actualmente a la vista, para que el
  // banner fijo muestre la categoría/subcategoría correcta a medida que se
  // sigue bajando, no sólo la que se eligió al entrar.
  useEffect(() => {
    if (!isChained || sections.length === 0) return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length === 0) return
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const id = visible[0].target.getAttribute('data-unit-id')
      const unit = sequence.find(u => u.id === id)
      if (unit) setVisibleUnit(unit)
    }, { rootMargin: '-120px 0px -75% 0px', threshold: 0 })
    sectionRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [isChained, sections.length, sequence])

  // Modo plano (sin categoría, o buscando texto) — scroll infinito de una
  // sola lista, como antes.
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
    enabled: !isChained,
  })
  const flatProducts = useMemo(() => productsData?.pages.flatMap(p => p.data.data) ?? [], [productsData])
  const flatPagination = productsData?.pages[0]?.data.pagination

  // Ojo: `activeTopCategory` es un `Category` real (con `.children`); el
  // resultado de buscar entre los hijos aplanados es un `CategoryChild`, que
  // NO tiene `.children` — mezclarlos en un solo `activeCategory` causaba un
  // crash al leer `.children.length` cuando la categoría activa era una hoja.
  const activeTopCategory = categories.find(c => c.id === categoryId)
  const activeCategory = activeTopCategory
    ?? categories.flatMap(c => c.children).find(c => c.id === categoryId)
  const activeParent = categories.find(c => c.children.some(ch => ch.id === categoryId))
  // Subcategorías de acceso rápido arriba: si estoy viendo una categoría
  // padre, sus hijas; si estoy dentro de una hija, sus hermanas (para poder
  // saltar entre subcategorías sin volver al nivel de arriba primero).
  const subcategoryParent = activeTopCategory && activeTopCategory.children.length > 0 ? activeTopCategory : activeParent
  const subcategories = subcategoryParent?.children ?? []

  // Banner "estás acá" — fijo (sticky) y, en modo encadenado, refleja la
  // sección que se está viendo AHORA mientras se hace scroll (no sólo la
  // categoría con la que se entró), incluido el color de acento.
  const currentUnit = isChained ? (visibleUnit ?? (startIndex >= 0 ? sequence[startIndex] : null)) : null
  const bannerTopId = isChained ? (currentUnit?.parentId ?? currentUnit?.id) : (activeTopCategory?.id ?? activeParent?.id)
  const topCategoryIndex = categories.findIndex(c => c.id === bannerTopId)
  const bannerAccent = topCategoryIndex >= 0 ? BANNER_ACCENTS[topCategoryIndex % BANNER_ACCENTS.length] : DEFAULT_BANNER_ACCENT
  const bannerLabel = isChained
    ? (currentUnit?.name ?? 'Catálogo de productos')
    : (activeCategory ? activeCategory.name : search ? `"${search}"` : 'Catálogo de productos')
  const bannerParentLabel = isChained ? currentUnit?.parentName : undefined

  useEffect(() => {
    const el = loadMoreRef.current
    const showSentinel = isChained ? hasMoreChained : hasNextPage
    const isFetchingAny = isChained ? fetchingMore : isFetchingNextPage
    if (!el || !showSentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetchingAny) {
        if (isChained) handleLoadMoreChained(); else fetchNextPage()
      }
    }, { rootMargin: '400px' })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChained, hasMoreChained, hasNextPage, fetchingMore, isFetchingNextPage, fetchNextPage, sections, chainPos, flatProducts.length])

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
      <div className="hidden lg:block sticky top-20 z-30 bg-paper-bg/95 backdrop-blur py-2 mb-4">
        <h1 className="text-2xl font-bold text-paper-ink">{bannerLabel}</h1>
        {bannerParentLabel && <p className="text-sm font-medium text-paper-ink-ghost">{bannerParentLabel}</p>}
      </div>

      {/* Barra compacta "estás acá" — solo mobile/tablet, fija mientras se
          scrollea. Sin ícono/logo (para ganar espacio) y de una sola línea
          en vez del banner grande de antes, que tapaba demasiado contenido.
          Tocarla despliega la navegación de subcategorías (o categorías,
          según el contexto) ahí mismo — reemplaza a la fila de pills fija
          que había antes, que siempre ocupaba espacio aunque no se usara. */}
      <div className="lg:hidden sticky top-16 z-30">
        <button onClick={() => setDropdownOpen(o => !o)}
          className={`w-full flex items-center gap-2 px-4 py-2.5 shadow-md text-left transition-colors ${bannerAccent}`}>
          {bannerParentLabel && <span className="text-[11px] font-bold text-white/70 uppercase tracking-wide shrink-0">{bannerParentLabel} ›</span>}
          <span className="flex-1 text-sm font-black text-white truncate">{bannerLabel}</span>
          <ChevronDown className={`h-4.5 w-4.5 text-white/90 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="bg-white border-b border-paper-line shadow-lg max-h-[65vh] overflow-y-auto">
            {subcategoryParent && subcategories.length > 0 ? (
              <>
                <button onClick={() => { handleCategory(subcategoryParent.id); setDropdownOpen(false) }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold border-b border-paper-line transition-colors ${categoryId === subcategoryParent.id ? 'bg-brand-green-50 text-brand-green-700' : 'text-paper-ink hover:bg-paper-surface'}`}>
                  Todo en {subcategoryParent.name}
                </button>
                {subcategories.map(child => (
                  <button key={child.id} onClick={() => { handleCategory(child.id); setDropdownOpen(false) }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold border-b border-paper-line transition-colors ${categoryId === child.id ? 'bg-brand-green-50 text-brand-green-700' : 'text-paper-ink hover:bg-paper-surface'}`}>
                    {child.name}
                    <span className="text-xs text-paper-ink-ghost font-medium">{child._count.products}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button onClick={() => { handleCategory(''); setDropdownOpen(false) }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold border-b border-paper-line transition-colors ${!categoryId ? 'bg-brand-green-50 text-brand-green-700' : 'text-paper-ink hover:bg-paper-surface'}`}>
                  Todos los productos
                </button>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => { handleCategory(cat.id); setDropdownOpen(false) }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold border-b border-paper-line transition-colors ${categoryId === cat.id ? 'bg-brand-green-50 text-brand-green-700' : 'text-paper-ink hover:bg-paper-surface'}`}>
                    {cat.name}
                    <span className="text-xs text-paper-ink-ghost font-medium">{cat._count.products}</span>
                  </button>
                ))}
              </>
            )}
            <button onClick={() => { openCategoryDrawer(); setDropdownOpen(false) }}
              className="w-full px-4 py-3 text-sm font-bold text-brand-blue-600 hover:bg-brand-blue-50 transition-colors">
              Ver todas las categorías
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar de categorías — solo desktop, en mobile se usan los pills */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-44 bg-white border border-paper-line rounded-2xl shadow-sm p-3">
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
          {/* Búsqueda — la X de limpiar vive dentro del campo (sólo aparece
              si hay texto), ya no como botón aparte "Limpiar filtros" que
              quedaba ahí siempre estorbando aunque no hubiera nada que
              limpiar. Para quitar la categoría ya está el banner/pills. */}
          <div className="mb-5">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-paper-ink-ghost" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar productos..."
                  className="w-full bg-white border border-paper-line rounded-full pl-9 pr-16 py-2 text-sm text-paper-ink placeholder-paper-ink-ghost focus:outline-none focus:border-brand-blue-400 transition-colors" />
                {search && (
                  <button type="button" onClick={() => { setSearch(''); setSearchParams(prev => { prev.delete('search'); return prev }) }}
                    aria-label="Borrar búsqueda"
                    className="absolute right-9 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-paper-ink-ghost hover:text-paper-ink-soft">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <VoiceSearchButton onResult={handleVoiceResult} className="absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </form>
          </div>

          {/* Results */}
          {isChained ? (
            chainLoading && sections.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="bg-paper-surface rounded-2xl aspect-square animate-pulse" />
                ))}
              </div>
            ) : sections.length === 0 ? (
              <div className="text-center py-20 text-paper-ink-ghost">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-lg text-paper-ink-soft">No se encontraron productos</p>
              </div>
            ) : (
              <>
                {sections.map((sec, i) => (
                  <div key={`${sec.unit.id}-${i}`}
                    ref={el => { if (el) sectionRefs.current.set(sec.unit.id, el); else sectionRefs.current.delete(sec.unit.id) }}
                    data-unit-id={sec.unit.id}
                    className="mb-8 scroll-mt-32">
                    <div className="flex items-baseline gap-2 mb-3">
                      <h2 className="text-lg font-black text-paper-ink">{sec.unit.name}</h2>
                      <span className="text-xs text-paper-ink-ghost font-semibold">{sec.total} producto{sec.total === 1 ? '' : 's'}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                      {sec.products.map(product => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Sentinel de scroll infinito — al llegar al final de una
                    categoría, sigue con la siguiente sola, sin que el
                    usuario tenga que volver a elegir nada. */}
                {hasMoreChained && (
                  <div ref={loadMoreRef} className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 text-brand-green-600 animate-spin" />
                  </div>
                )}
                {!hasMoreChained && (
                  <p className="text-center text-xs text-paper-ink-ghost py-10">Ya viste todo el catálogo.</p>
                )}
              </>
            )
          ) : isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-paper-surface rounded-2xl aspect-square animate-pulse" />
              ))}
            </div>
          ) : flatProducts.length === 0 ? (
            <div className="text-center py-20 text-paper-ink-ghost">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg text-paper-ink-soft">No se encontraron productos</p>
              <p className="text-sm mt-1">Intenta con otro término de búsqueda</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4 text-sm text-paper-ink-ghost">
                <span>{flatPagination?.total ?? 0} productos</span>
                <span>Mostrando {flatProducts.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {flatProducts.map(product => (
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
              {!hasNextPage && flatProducts.length > 0 && (
                <p className="text-center text-xs text-paper-ink-ghost py-10">Ya viste todos los productos de esta lista.</p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
