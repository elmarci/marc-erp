import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, LayoutGrid, ShoppingBag } from 'lucide-react'
import { storeApi } from '../api'
import { getCategoryIcon } from '../categoryIcons'

// Menú de categorías en dropdown — reemplaza la barra sólida de color que se
// veía "cuadriculada": esto escala a cualquier cantidad de categorías y
// subcategorías sin ocupar espacio permanente, y de paso deja un espacio fijo
// para publicidad dentro de la propia navegación (para que nunca se pierda).
export function CategoryMegaMenu() {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'], queryFn: () => storeApi.getCategories(), staleTime: 300000,
  })
  const { data: offersData } = useQuery({
    queryKey: ['store-offers'], queryFn: () => storeApi.getOffers(), staleTime: 300000,
  })
  const categories = categoriesData?.data.data ?? []
  const offer = offersData?.data.data[0]
  const active = categories.find(c => c.id === activeId) ?? categories[0]

  const close = () => { setOpen(false); setActiveId(null) }

  if (categories.length === 0) return null

  return (
    <div className="relative hidden md:block" onMouseLeave={close}>
      <button onClick={() => setOpen(o => !o)} onMouseEnter={() => setOpen(true)}
        className={`flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold transition-colors ${open ? 'bg-brand-green-50 text-brand-green-700' : 'text-paper-ink-soft hover:bg-paper-surface'}`}>
        <LayoutGrid className="h-4 w-4" />Categorías
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 flex bg-white border border-paper-line rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Categorías principales */}
          <div className="w-56 border-r border-paper-line py-2 max-h-[26rem] overflow-y-auto">
            {categories.map(cat => {
              const Icon = getCategoryIcon(cat.name)
              const isActive = active?.id === cat.id
              return (
                <button key={cat.id} onMouseEnter={() => setActiveId(cat.id)} onClick={() => setActiveId(cat.id)}
                  className={`w-full flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 text-sm font-medium text-left border-l-2 transition-colors
                    ${isActive ? 'bg-brand-green-50 text-brand-green-700 border-brand-green-600' : 'text-paper-ink hover:bg-paper-surface border-transparent'}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{cat.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost shrink-0" />
                </button>
              )
            })}
          </div>

          {/* Subcategorías de la categoría activa */}
          <div className="w-72 p-5">
            {active && (
              <>
                <Link to={`/catalogo?categoryId=${active.id}`} onClick={close}
                  className="block font-bold text-paper-ink mb-3 hover:text-brand-green-600 transition-colors">
                  Ver todo {active.name} →
                </Link>
                {active.children.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {active.children.map(child => (
                      <Link key={child.id} to={`/catalogo?categoryId=${child.id}`} onClick={close}
                        className="text-sm text-paper-ink-soft hover:text-brand-green-600 transition-colors truncate">
                        {child.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-paper-ink-ghost">{active._count.products} productos disponibles</p>
                )}
              </>
            )}
          </div>

          {/* Publicidad — un espacio de anuncio fijo dentro de la navegación,
              para que las promociones nunca queden fuera del recorrido de compra. */}
          <Link to={offer ? '/ofertas' : '/catalogo'} onClick={close}
            className="w-52 shrink-0 bg-gradient-to-br from-brand-blue-600 to-brand-blue-800 text-white p-5 flex flex-col justify-between hover:from-brand-blue-700 hover:to-brand-blue-900 transition-colors">
            {offer ? (
              <>
                <div>
                  {offer.storeBadge && (
                    <span className="inline-block bg-white text-paper-ink text-[10px] font-black px-2 py-0.5 rounded-full mb-2">
                      {offer.storeBadge}
                    </span>
                  )}
                  <p className="font-black text-lg leading-tight">{offer.name}</p>
                </div>
                <span className="text-sm font-bold underline underline-offset-2">Ver oferta →</span>
              </>
            ) : (
              <>
                <ShoppingBag className="h-8 w-8 text-white/70" />
                <span className="text-sm font-bold underline underline-offset-2">Ver catálogo →</span>
              </>
            )}
          </Link>
        </div>
      )}
    </div>
  )
}
