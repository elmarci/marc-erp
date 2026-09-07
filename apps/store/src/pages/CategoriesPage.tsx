import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Tag, ChevronDown } from 'lucide-react'
import { storeApi } from '../api'
import { getCategoryIcon } from '../categoryIcons'

// Pantalla completa (no el panel lateral de antes) — mejor para recorrer
// categorías Y subcategorías con calma, en vez de un lateral angosto que
// obligaba a hacer scroll doble. Se abre desde la barra inferior y desde el
// menú hamburguesa del header.
export function CategoriesPage() {
  const { data } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })
  const categories = data?.data.data ?? []
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <main className="min-h-screen bg-paper-bg px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-semibold text-paper-ink mb-1">Categorías</h1>
      <p className="text-sm text-paper-ink-soft mb-5">Encuentra todo tu pedido por pasillo, como en la tienda.</p>

      <div className="flex gap-2.5 mb-5">
        <Link to="/catalogo"
          className="flex-1 flex items-center gap-2 justify-center rounded-xl bg-brand-green-600 hover:bg-brand-green-700 text-white font-display font-semibold text-sm py-3 transition-colors">
          <LayoutGrid className="h-4 w-4" />Todo el catálogo
        </Link>
        <Link to="/ofertas"
          className="flex-1 flex items-center gap-2 justify-center rounded-xl bg-brand-magenta-50 text-brand-magenta-700 font-display font-semibold text-sm py-3 hover:bg-brand-magenta-100 transition-colors">
          <Tag className="h-4 w-4" />Ofertas
        </Link>
      </div>

      <div className="space-y-2.5">
        {categories.map(cat => {
          const Icon = getCategoryIcon(cat.name)
          const isOpen = expanded === cat.id
          const hasChildren = cat.children.length > 0
          return (
            <div key={cat.id} className="bg-white border border-paper-line rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center">
                <Link to={`/catalogo?categoryId=${cat.id}`}
                  className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-paper-surface transition-colors">
                  <div className="h-11 w-11 rounded-xl bg-brand-green-50 flex items-center justify-center shrink-0">
                    <Icon className="h-6 w-6 text-brand-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-paper-ink leading-tight">{cat.name}</p>
                    <p className="text-xs text-paper-ink-ghost font-mono mt-0.5">{cat._count.products} productos</p>
                  </div>
                </Link>
                {hasChildren && (
                  <button onClick={() => setExpanded(isOpen ? null : cat.id)} aria-label="Ver subcategorías"
                    className="h-11 w-11 flex items-center justify-center text-paper-ink-ghost hover:text-brand-green-600 shrink-0 mr-1">
                    <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
              {hasChildren && isOpen && (
                <div className="border-t border-paper-line bg-paper-surface/60 px-4 py-3 grid grid-cols-2 gap-2">
                  {cat.children.map(child => (
                    <Link key={child.id} to={`/catalogo?categoryId=${child.id}`}
                      className="flex items-center justify-between gap-2 bg-white border border-paper-line rounded-xl px-3 py-2.5 hover:border-brand-green-300 transition-colors">
                      <span className="text-sm font-semibold text-paper-ink truncate">{child.name}</span>
                      <span className="text-[10px] font-mono text-paper-ink-ghost shrink-0">{child._count.products}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
