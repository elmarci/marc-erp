import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Tag, ChevronDown } from 'lucide-react'
import { storeApi } from '../api'
import { getCategoryIcon } from '../categoryIcons'

// Pantalla completa (no el panel lateral de antes) — mejor para recorrer
// categorías Y subcategorías con calma, en vez de un lateral angosto que
// obligaba a hacer scroll doble. Se abre desde la barra inferior y desde el
// menú hamburguesa del header.
//
// Grid de 2 columnas (antes: 1 sola columna, mucho scroll) y una sola zona
// táctil por card — antes "tocar el nombre" y "tocar la flechita" hacían
// cosas distintas en la misma fila, confuso. Ahora: si la categoría tiene
// subcategorías, tocar la card las despliega debajo (ocupando el ancho
// completo de la grilla); si no tiene, tocar la card va directo al catálogo
// — una sola acción posible por card, sin ambigüedad.
export function CategoriesPage() {
  const navigate = useNavigate()
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

      <div className="grid grid-cols-2 gap-2.5">
        {categories.map(cat => {
          const Icon = getCategoryIcon(cat.name)
          const isOpen = expanded === cat.id
          const hasChildren = cat.children.length > 0

          return (
            <Fragment key={cat.id}>
              <button
                onClick={() => hasChildren ? setExpanded(isOpen ? null : cat.id) : navigate(`/catalogo?categoryId=${cat.id}`)}
                className={`flex items-center gap-2.5 text-left bg-white border rounded-2xl p-3 shadow-sm transition-colors ${isOpen ? 'border-brand-green-300' : 'border-paper-line hover:border-brand-green-200'}`}>
                <div className="h-10 w-10 rounded-xl bg-brand-green-50 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-brand-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold text-paper-ink leading-tight">{cat.name}</p>
                  <p className="text-[11px] text-paper-ink-ghost font-mono mt-0.5">{cat._count.products} productos</p>
                </div>
                {hasChildren && (
                  <ChevronDown className={`h-4 w-4 text-paper-ink-ghost shrink-0 transition-transform ${isOpen ? 'rotate-180 text-brand-green-600' : ''}`} />
                )}
              </button>

              {hasChildren && isOpen && (
                <div className="col-span-2 bg-white border border-paper-line rounded-2xl p-3 -mt-1">
                  <Link to={`/catalogo?categoryId=${cat.id}`}
                    className="block text-sm font-display font-semibold text-brand-green-700 hover:text-brand-green-800 mb-2.5 transition-colors">
                    Ver todo en {cat.name} →
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    {cat.children.map(child => (
                      <Link key={child.id} to={`/catalogo?categoryId=${child.id}`}
                        className="flex items-center justify-between gap-2 bg-paper-surface border border-transparent rounded-xl px-3 py-2.5 hover:border-brand-green-300 transition-colors">
                        <span className="text-sm font-semibold text-paper-ink truncate">{child.name}</span>
                        <span className="text-[10px] font-mono text-paper-ink-ghost shrink-0">{child._count.products}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </main>
  )
}
