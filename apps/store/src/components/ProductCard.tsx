import { useState } from 'react'
import { ShoppingCart, ShoppingBag, Plus, Minus, Scale, X } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

/* ── Modal para productos a granel ─────────────────────────────────── */
function BulkModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem, openCart } = useCartStore()
  const [qty, setQty] = useState('')
  const unit = product.bulkUnit ?? 'kg'
  const price = Number(product.salePrice)
  const total = parseFloat(qty || '0') * price
  const presets = ['0.25', '0.5', '1', '1.5', '2', '3']

  const handleAdd = () => {
    const q = parseFloat(qty)
    if (!q || q <= 0) { toast.error('Ingresa una cantidad válida'); return }
    addItem({
      ...product,
      name: `${product.name} (${q} ${unit})`,
      salePrice: price, // price per unit
    }, q)
    toast.success(`${product.name} (${q} ${unit}) agregado`, {
      action: { label: 'Ver carrito', onClick: openCart }
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-green-400" />
            <div>
              <p className="font-bold text-white text-sm">{product.name}</p>
              <p className="text-white/40 text-xs">S/ {price.toFixed(2)} / {unit}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors">
            <X className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-white/60 mb-2 block">Cantidad ({unit})</label>
            <input type="number" min={0.01} step={0.01} value={qty} onChange={e => setQty(e.target.value)}
              placeholder={`Ej: 0.5 ${unit}`} autoFocus
              className="w-full bg-white/5 border border-white/10 focus:border-green-400 rounded-xl px-4 py-3 text-lg font-bold text-white text-center placeholder-white/20 outline-none transition-colors" />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => setQty(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${qty === p ? 'bg-green-500 text-black' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}>
                {p} {unit}
              </button>
            ))}
          </div>

          {qty && parseFloat(qty) > 0 && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <p className="text-white/50 text-xs mb-0.5">Total a cobrar</p>
              <p className="text-2xl font-black text-green-400">S/ {total.toFixed(2)}</p>
              <p className="text-white/30 text-xs">{qty} {unit} × S/ {price.toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 border border-white/10 hover:border-white/20 rounded-xl text-sm text-white/50 hover:text-white transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!qty || parseFloat(qty) <= 0}
              className="flex-1 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
              <ShoppingCart className="h-4 w-4" />Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── ProductCard ─────────────────────────────────────────────────── */
export function ProductCard({ product }: { product: Product }) {
  const { addItem, updateQuantity, items, openCart } = useCartStore()
  const [showBulk, setShowBulk] = useState(false)
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0
  const lowStock = !outOfStock && product.currentStock <= 5

  const handleAdd = () => {
    if (outOfStock) return
    if (product.isBulk) { setShowBulk(true); return }
    addItem(product)
    toast.success(`${product.name} agregado`, {
      duration: 1500, action: { label: 'Ver carrito', onClick: openCart }
    })
  }

  return (
    <>
      <div onClick={outOfStock ? undefined : handleAdd}
        className={`group relative bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-200 select-none
          ${outOfStock ? 'opacity-60 cursor-not-allowed border-white/5' :
            'hover:bg-zinc-800 border-white/5 hover:border-green-500/30 cursor-pointer active:scale-95'}`}>

        {/* Imagen */}
        <div className="relative aspect-square overflow-hidden bg-zinc-800">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-10 w-10 text-white/10" /></div>
          }

          {/* Badges */}
          {product.isBulk && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-zinc-900/80 border border-white/10 rounded-full px-2 py-0.5">
              <Scale className="h-3 w-3 text-green-400" />
              <span className="text-[10px] text-white/60 font-medium">por {product.bulkUnit ?? 'kg'}</span>
            </div>
          )}
          {lowStock && !product.isBulk && (
            <span className="absolute top-2 left-2 bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
              Últimas {product.currentStock}
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <span className="bg-black/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
            </div>
          )}
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
            <div>
              <span className="text-green-400 font-bold text-lg">S/ {Number(product.salePrice).toFixed(2)}</span>
              {product.isBulk && <span className="text-white/30 text-xs ml-1">/{product.bulkUnit ?? 'kg'}</span>}
            </div>

            {qty > 0 && !product.isBulk ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => updateQuantity(product.id, qty - 1)}
                  className="h-7 w-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm font-bold">{qty}</span>
                <button onClick={() => addItem(product)}
                  className="h-7 w-7 bg-green-500 hover:bg-green-400 text-black rounded-full flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className={`h-8 w-8 text-black rounded-full flex items-center justify-center transition-colors pointer-events-none ${outOfStock ? 'bg-white/10' : 'bg-green-500 group-hover:bg-green-400'}`}>
                {product.isBulk ? <Scale className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              </div>
            )}
          </div>
        </div>
      </div>

      {showBulk && <BulkModal product={product} onClose={() => setShowBulk(false)} />}
    </>
  )
}
