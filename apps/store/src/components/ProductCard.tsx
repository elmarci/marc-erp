import { useState } from 'react'
import { ShoppingCart, ShoppingBag, Plus, Minus } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

export function ProductCard({ product }: { product: Product }) {
  const { addItem, updateQuantity, items, openCart } = useCartStore()
  const [showQty, setShowQty] = useState(false)
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0

  const handleAdd = () => {
    if (outOfStock) return
    addItem(product)
    setShowQty(true)
    setTimeout(() => setShowQty(false), 2000)
    toast.success(`${product.name} agregado`, {
      duration: 1200,
      action: { label: 'Ver carrito', onClick: openCart },
    })
  }

  return (
    <div
      onClick={outOfStock ? undefined : handleAdd}
      className={`group relative bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-200 select-none
        ${outOfStock
          ? 'opacity-60 cursor-not-allowed border-white/5'
          : 'hover:bg-zinc-800 border-white/5 hover:border-green-500/30 cursor-pointer active:scale-95'
        }`}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-zinc-800">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="h-10 w-10 text-white/10" />
          </div>
        )}

        {/* Stock badge */}
        {product.currentStock <= 5 && product.currentStock > 0 && (
          <span className="absolute top-2 left-2 bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
            Últimas {product.currentStock}
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="bg-black/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
          </div>
        )}

        {/* Qty overlay when added */}
        {qty > 0 && (
          <div className="absolute top-2 right-2 h-6 w-6 bg-green-500 text-black text-xs font-black rounded-full flex items-center justify-center shadow-lg">
            {qty}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-white/40 mb-0.5">{product.category.name}</p>
        <p className="font-semibold text-sm line-clamp-2 leading-tight mb-2">{product.name}</p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-green-400 font-bold text-lg">S/ {Number(product.salePrice).toFixed(2)}</span>

          {/* Qty controls - show when item is in cart */}
          {qty > 0 ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => updateQuantity(product.id, qty - 1)}
                className="h-7 w-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center text-sm font-bold">{qty}</span>
              <button
                onClick={() => { addItem(product) }}
                className="h-7 w-7 bg-green-500 hover:bg-green-400 text-black rounded-full flex items-center justify-center transition-colors">
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="h-8 w-8 bg-green-500 group-hover:bg-green-400 text-black rounded-full flex items-center justify-center transition-colors pointer-events-none">
              <ShoppingCart className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
