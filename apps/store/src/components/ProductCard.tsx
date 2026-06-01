import { ShoppingCart, ShoppingBag } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

export function ProductCard({ product }: { product: Product }) {
  const { addItem, openCart } = useCartStore()

  const handleAdd = () => {
    if (product.currentStock <= 0) return
    addItem(product)
    toast.success(`${product.name} agregado`, {
      duration: 1500,
      action: { label: 'Ver carrito', onClick: openCart },
    })
  }

  return (
    <div className="group bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-green-500/30 rounded-2xl overflow-hidden transition-all duration-200">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-zinc-800">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-white/10" />
          </div>
        )}
        {product.currentStock <= 5 && product.currentStock > 0 && (
          <span className="absolute top-2 left-2 bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
            Últimas {product.currentStock}
          </span>
        )}
        {product.currentStock === 0 && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="bg-black/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-white/40 mb-0.5">{product.category.name}</p>
        <p className="font-semibold text-sm line-clamp-2 leading-tight mb-2">{product.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-green-400 font-bold text-lg">S/ {product.salePrice.toFixed(2)}</span>
          <button onClick={handleAdd} disabled={product.currentStock === 0}
            className="h-9 w-9 bg-green-500 hover:bg-green-400 disabled:bg-white/10 disabled:cursor-not-allowed text-black rounded-full flex items-center justify-center transition-colors">
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
