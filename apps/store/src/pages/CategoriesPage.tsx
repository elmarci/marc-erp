import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Tag } from 'lucide-react'
import { storeApi } from '../api'
import { getCategoryIcon } from '../categoryIcons'

// Todas las categorías en cuadrícula de 2. Un toque entra directo a la
// categoría: antes, si tenía subcategorías, el toque solo las desplegaba y
// hacía falta un segundo toque para entrar. Las subcategorías se eligen ya
// dentro del catálogo, en la barra "estás acá".
export function CategoriesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })
  const categories = data?.data.data ?? []

  return (
    <main className="px-4 sm:px-6 lg:px-8 pt-4 pb-6 max-w-3xl mx-auto">
      <h1 className="text-[22px] font-extrabold text-paper-ink">Categorías</h1>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <Link to="/catalogo"
          className="h-12 flex items-center gap-2 justify-center rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold text-sm">
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />Todo el catálogo
        </Link>
        <Link to="/ofertas"
          className="h-12 flex items-center gap-2 justify-center rounded-xl bg-brand-sun-400 text-brand-sun-900 font-bold text-sm">
          <Tag className="h-4 w-4" aria-hidden="true" />Ofertas
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
        {isLoading && Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-card h-[156px] animate-pulse" aria-hidden="true" />
        ))}
        {categories.map(cat => {
          const Icon = getCategoryIcon(cat.name)
          return (
            <Link key={cat.id} to={`/catalogo?categoryId=${cat.id}`}
              className="bg-white rounded-2xl shadow-card p-2.5 flex flex-col gap-2 active:bg-paper-surface">
              <div className={`aspect-[4/3] rounded-xl overflow-hidden flex items-center justify-center ${cat.imageUrl ? 'bg-white' : 'bg-brand-blue-50'}`}>
                {cat.imageUrl
                  ? <img src={cat.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  : <Icon className="h-14 w-14" />}
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-paper-ink leading-tight truncate">{cat.name}</p>
                <p className="text-xs text-paper-ink-soft mt-0.5">{cat._count.products} productos</p>
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
