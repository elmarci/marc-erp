import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, LayoutGrid, Tag, MapPin, Package } from 'lucide-react'
import { storeApi } from '../api'
import { getCategoryIcon } from '../categoryIcons'

export function CategoryDrawer({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })
  const categories = data?.data.data ?? []

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-paper-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[85vw] max-w-xs bg-paper-bg shadow-2xl flex flex-col animate-slide-in-left">
        <div className="flex items-center justify-between px-4 h-16 border-b border-paper-line shrink-0">
          <span className="font-bold text-paper-ink">Categorías</span>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-paper-surface transition-colors">
            <X className="h-4.5 w-4.5 text-paper-ink-soft" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <Link to="/catalogo" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-brand-green-700 font-bold hover:bg-brand-green-50 transition-colors">
            <LayoutGrid className="h-5 w-5" />Todo el catálogo
          </Link>
          <Link to="/ofertas" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-paper-ink font-medium hover:bg-paper-surface transition-colors">
            <Tag className="h-5 w-5 text-brand-magenta-600" />Ofertas y promociones
          </Link>

          <div className="border-t border-paper-line my-2" />

          {categories.map(cat => {
            const Icon = getCategoryIcon(cat.name)
            return (
              <div key={cat.id}>
                <Link to={`/catalogo?categoryId=${cat.id}`} onClick={onClose}
                  className="flex items-center gap-3 px-4 py-2.5 text-paper-ink font-medium hover:bg-paper-surface hover:text-brand-green-700 transition-colors">
                  <Icon className="h-4.5 w-4.5 text-brand-green-600 shrink-0" />
                  <span className="flex-1">{cat.name}</span>
                  <span className="text-xs text-paper-ink-ghost">{cat._count.products}</span>
                </Link>
                {cat.children.length > 0 && (
                  <div className="pl-11">
                    {cat.children.map(child => (
                      <Link key={child.id} to={`/catalogo?categoryId=${child.id}`} onClick={onClose}
                        className="flex items-center gap-2 py-2 text-sm text-paper-ink-soft hover:text-brand-green-600 transition-colors">
                        <span className="flex-1">{child.name}</span>
                        <span className="text-xs text-paper-ink-ghost">{child._count.products}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="border-t border-paper-line my-2" />
          <Link to="/mis-pedidos" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-paper-ink font-medium hover:bg-paper-surface transition-colors">
            <Package className="h-5 w-5 text-paper-ink-ghost" />Mis pedidos / Mi cuenta
          </Link>
        </nav>

        <div className="px-4 py-3 border-t border-paper-line shrink-0 text-xs text-paper-ink-ghost flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />Mz F10 Lt2A, Av. Manchay — Pachacamac
        </div>
      </div>
    </div>
  )
}
