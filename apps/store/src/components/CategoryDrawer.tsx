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
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-[85vw] max-w-xs bg-white shadow-2xl flex flex-col animate-slide-in-left">
        <div className="flex items-center justify-between px-4 h-16 border-b border-gray-100 shrink-0">
          <span className="font-bold text-gray-900">Categorías</span>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="h-4.5 w-4.5 text-gray-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <Link to="/catalogo" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-brand-blue-700 font-bold hover:bg-brand-blue-50 transition-colors">
            <LayoutGrid className="h-5 w-5" />Todo el catálogo
          </Link>
          <Link to="/ofertas" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            <Tag className="h-5 w-5 text-brand-green-600" />Ofertas y promociones
          </Link>

          <div className="border-t border-gray-100 my-2" />

          {categories.map(cat => {
            const Icon = getCategoryIcon(cat.name)
            return (
              <div key={cat.id}>
                <Link to={`/catalogo?categoryId=${cat.id}`} onClick={onClose}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-800 font-medium hover:bg-gray-50 hover:text-brand-blue-700 transition-colors">
                  <Icon className="h-4.5 w-4.5 text-brand-blue-500 shrink-0" />
                  <span className="flex-1">{cat.name}</span>
                  <span className="text-xs text-gray-300">{cat._count.products}</span>
                </Link>
                {cat.children.length > 0 && (
                  <div className="pl-11">
                    {cat.children.map(child => (
                      <Link key={child.id} to={`/catalogo?categoryId=${child.id}`} onClick={onClose}
                        className="flex items-center gap-2 py-2 text-sm text-gray-500 hover:text-brand-blue-600 transition-colors">
                        <span className="flex-1">{child.name}</span>
                        <span className="text-xs text-gray-300">{child._count.products}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="border-t border-gray-100 my-2" />
          <Link to="/mis-pedidos" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            <Package className="h-5 w-5 text-gray-400" />Mis pedidos / Mi cuenta
          </Link>
        </nav>

        <div className="px-4 py-3 border-t border-gray-100 shrink-0 text-xs text-gray-400 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />Mz F10 Lt2A, Av. Manchay — Pachacamac
        </div>
      </div>
    </div>
  )
}
