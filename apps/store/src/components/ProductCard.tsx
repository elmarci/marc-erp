import { useState } from 'react'
import { ShoppingCart, ShoppingBag, Plus, Minus, Eye } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

export function ProductCard({ product, offer }: {
  product: Product
  offer?: { discount: number; label: string }
}) {
  const { addItem, updateQuantity, items } = useCartStore()
  const [showQuick, setShowQuick] = useState(false)

  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0
  const lowStock = !outOfStock && product.currentStock <= 5

  const finalPrice = offer
    ? Math.round(product.salePrice * (1 - offer.discount / 100) * 100) / 100
    : Number(product.salePrice)

  const handleAdd = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (outOfStock) return
    addItem(product)
    toast.success(`${product.name} agregado`, {
      duration: 1800,
      position: 'bottom-center',
      style: { background: '#EAF7EF', color: '#111827', border: '1px solid #D1EEE0', borderRadius: '12px' },
    })
  }

  return (
    <>
      <div
        onClick={() => !outOfStock && handleAdd()}
        className={`group relative bg-white rounded-xl3 overflow-hidden cursor-pointer transition-all duration-200
          ${outOfStock ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md2'}
          shadow-sm2 border border-ln`}
      >
        {/* Imagen — 62% de la tarjeta */}
        <div className="relative overflow-hidden bg-g-xl" style={{ paddingBottom: '62%' }}>
          <div className="absolute inset-0">
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-400" />
              : <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="h-10 w-10 text-g/20" />
                </div>
            }
          </div>

          {/* Badges top-left */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {offer && (
              <span className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-full leading-tight shadow-sm">
                -{offer.discount}%
              </span>
            )}
            {lowStock && (
              <span className="bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full leading-tight">
                ¡Últimas {product.currentStock}!
              </span>
            )}
          </div>

          {/* Qty badge top-right */}
          {qty > 0 && (
            <div className="absolute top-2 right-2 h-6 w-6 bg-g text-white text-xs font-black rounded-full flex items-center justify-center shadow-btn">
              {qty}
            </div>
          )}

          {/* Quick view btn */}
          <button
            onClick={e => { e.stopPropagation(); setShowQuick(true) }}
            className="absolute bottom-2 right-2 h-7 w-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eye className="h-3.5 w-3.5 text-bk-3" />
          </button>

          {/* Agotado */}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
              <span className="text-xs font-bold text-bk-3 bg-ln px-3 py-1 rounded-full">Agotado</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-[10px] font-semibold text-g uppercase tracking-wider mb-0.5">{product.category.name}</p>
          <p className="text-sm font-semibold text-bk leading-snug line-clamp-2 mb-2" style={{ minHeight: '2.5rem' }}>
            {product.name}
          </p>

          <div className="flex items-end justify-between gap-1">
            <div>
              {offer && (
                <p className="text-[11px] text-bk-4 line-through leading-none">
                  S/ {Number(product.salePrice).toFixed(2)}
                </p>
              )}
              <p className="text-base font-black text-bk leading-none">
                S/ {finalPrice.toFixed(2)}
              </p>
            </div>

            {qty > 0 ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => { e.stopPropagation(); updateQuantity(product.id, qty - 1) }}
                  className="h-7 w-7 rounded-full bg-g-p hover:bg-g-xl border border-ln-g flex items-center justify-center transition-colors">
                  <Minus className="h-3 w-3 text-g" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-bk">{qty}</span>
                <button
                  onClick={e => { e.stopPropagation(); addItem(product) }}
                  className="h-7 w-7 rounded-full bg-g hover:bg-g-l flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3 text-white" />
                </button>
              </div>
            ) : (
              <div className="h-8 w-8 bg-g group-hover:bg-g-l rounded-full flex items-center justify-center transition-colors pointer-events-none shadow-btn">
                <ShoppingCart className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick View */}
      {showQuick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bk/40 backdrop-blur-sm p-4"
          onClick={() => setShowQuick(false)}>
          <div className="w-full max-w-sm bg-white rounded-xl4 shadow-lg2 overflow-hidden slide-up"
            onClick={e => e.stopPropagation()}>
            {product.imageUrl && (
              <div className="aspect-[4/3] overflow-hidden bg-g-xl">
                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-g uppercase tracking-wider">{product.category.name}</p>
                <h3 className="text-lg font-bold text-bk mt-0.5">{product.name}</h3>
                {product.description && <p className="text-sm text-bk-3 mt-1 line-clamp-3">{product.description}</p>}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  {offer && <p className="text-xs text-bk-4 line-through">S/ {Number(product.salePrice).toFixed(2)}</p>}
                  <p className="text-2xl font-black text-bk">S/ {finalPrice.toFixed(2)}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  outOfStock ? 'bg-red-50 text-red-500' :
                  lowStock   ? 'bg-amber-50 text-amber-600' :
                               'bg-g-p text-g'
                }`}>
                  {outOfStock ? 'Agotado' : lowStock ? `Solo ${product.currentStock}` : '✓ Disponible'}
                </span>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowQuick(false)}
                  className="flex-1 h-11 border border-ln rounded-xl text-sm font-medium text-bk-3 hover:bg-g-xl transition-colors">
                  Cerrar
                </button>
                <button
                  disabled={outOfStock}
                  onClick={() => { handleAdd(); setShowQuick(false) }}
                  className="flex-1 h-11 bg-g hover:bg-g-l disabled:opacity-40 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-btn">
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
