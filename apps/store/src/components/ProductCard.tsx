import { useState, useRef } from 'react'
import { ShoppingCart, ShoppingBag, Plus, Minus, Eye, Zap } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

interface MiniConfirm {
  show: boolean
  name: string
  image: string | null
}

let confirmTimeout: ReturnType<typeof setTimeout>

export function ProductCard({ product, offer }: { product: Product; offer?: { discount: number; label: string } }) {
  const { addItem, updateQuantity, items, openCart } = useCartStore()
  const [showQuickView, setShowQuickView] = useState(false)
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0

  const finalPrice = offer
    ? Math.round(product.salePrice * (1 - offer.discount / 100) * 100) / 100
    : product.salePrice

  const handleAdd = () => {
    if (outOfStock) return
    addItem(product)
    // Mini confirmation toast
    toast.custom(
      () => (
        <div className="flex items-center gap-3 bg-green-pale border border-green px-4 py-3 rounded-2xl shadow-card slide-up">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-green/10 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-green" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-marc line-clamp-1">{product.name}</p>
            <p className="text-xs text-green font-medium">Agregado al carrito ✓</p>
          </div>
        </div>
      ),
      { duration: 2500, position: 'bottom-center' }
    )
  }

  const lowStock = product.currentStock > 0 && product.currentStock <= 5

  return (
    <>
      <div className={`group relative bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer
        ${outOfStock ? 'opacity-60' : 'hover:shadow-card-hover hover:-translate-y-0.5'}
        shadow-card`}
        onClick={outOfStock ? undefined : handleAdd}
      >
        {/* Image — 60% of card */}
        <div className="relative" style={{ paddingBottom: '65%' }}>
          <div className="absolute inset-0 bg-cream">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingBag className="h-10 w-10 text-marc/10" />
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {offer && (
              <span className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full shadow">
                -{offer.discount}% {offer.label}
              </span>
            )}
            {lowStock && (
              <span className="bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                ¡Últimas {product.currentStock}!
              </span>
            )}
          </div>

          {/* Quick view button */}
          <button
            onClick={e => { e.stopPropagation(); setShowQuickView(true) }}
            className="absolute bottom-2 right-2 h-7 w-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eye className="h-3.5 w-3.5 text-marc/60" />
          </button>

          {/* Out of stock overlay */}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <span className="bg-marc/80 text-white text-xs font-bold px-3 py-1.5 rounded-full">Agotado</span>
            </div>
          )}

          {/* Qty badge */}
          {qty > 0 && (
            <div className="absolute top-2 right-2 h-6 w-6 bg-primary text-white text-xs font-black rounded-full flex items-center justify-center shadow">
              {qty}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-[11px] text-primary font-semibold uppercase tracking-wide mb-0.5">{product.category.name}</p>
          <p className="text-sm font-semibold text-marc line-clamp-2 leading-tight mb-2">{product.name}</p>

          <div className="flex items-center justify-between gap-2">
            <div>
              {offer && (
                <p className="text-[11px] text-marc/40 line-through leading-none">{product.salePrice.toFixed(2)}</p>
              )}
              <p className="text-lg font-black text-marc">
                <span className="text-xs font-medium text-marc/50">S/ </span>
                {finalPrice.toFixed(2)}
              </p>
            </div>

            {qty > 0 ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => updateQuantity(product.id, qty - 1)}
                  className="h-7 w-7 bg-primary/10 hover:bg-primary/20 rounded-full flex items-center justify-center transition-colors">
                  <Minus className="h-3 w-3 text-primary" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-marc">{qty}</span>
                <button onClick={() => addItem(product)}
                  className="h-7 w-7 bg-primary hover:bg-primary-dark rounded-full flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3 text-white" />
                </button>
              </div>
            ) : (
              <div className="h-9 w-9 bg-primary hover:bg-primary-dark text-white rounded-full flex items-center justify-center transition-colors pointer-events-none group-hover:shadow-green">
                <ShoppingCart className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick View Modal */}
      {showQuickView && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setShowQuickView(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden slide-up"
            onClick={e => e.stopPropagation()}>
            {product.imageUrl && (
              <div className="aspect-[4/3] overflow-hidden">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <p className="text-xs text-primary font-semibold uppercase tracking-wide mb-1">{product.category.name}</p>
              <h3 className="text-lg font-bold text-marc mb-2">{product.name}</h3>
              {product.description && <p className="text-sm text-marc/60 mb-3">{product.description}</p>}
              <div className="flex items-center justify-between mb-4">
                <div>
                  {offer && <p className="text-xs text-marc/40 line-through">S/ {product.salePrice.toFixed(2)}</p>}
                  <p className="text-2xl font-black text-marc">S/ {finalPrice.toFixed(2)}</p>
                </div>
                <p className={`text-sm font-medium px-3 py-1 rounded-full ${
                  outOfStock ? 'bg-red-50 text-red-500' :
                  lowStock ? 'bg-primary-pale text-primary' :
                  'bg-green-pale text-green-dark'
                }`}>
                  {outOfStock ? 'Agotado' : lowStock ? `${product.currentStock} disponibles` : '✓ En stock'}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowQuickView(false)}
                  className="flex-1 py-3 border border-[--border] rounded-xl text-sm font-medium text-marc/60 hover:bg-bg transition-colors">
                  Cerrar
                </button>
                <button
                  disabled={outOfStock}
                  onClick={() => { handleAdd(); setShowQuickView(false) }}
                  className="flex-1 py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-green">
                  <ShoppingCart className="h-4 w-4" />Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
