import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, ShoppingBag, Plus, Minus, Scale, X } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

/* ── Modal para productos a granel ─────────────────────────────────── */
function BulkModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem, renameItem, openCart } = useCartStore()
  const [qty, setQty] = useState('')
  const unit = product.bulkUnit ?? 'kg'
  const price = Number(product.salePrice)
  const total = parseFloat(qty || '0') * price
  const presets = ['0.25', '0.5', '1', '1.5', '2', '3']

  const handleAdd = () => {
    const q = parseFloat(qty)
    if (!q || q <= 0) { toast.error('Ingresa una cantidad válida'); return }
    const result = addItem({
      ...product,
      name: `${product.name} (${q} ${unit})`,
      salePrice: price, // price per unit
    }, q)
    if (result.addedQuantity <= 0) {
      toast.error(`No hay más stock de "${product.name}" disponible (máximo ${product.currentStock} ${unit}).`)
      return
    }
    // El nombre incluye el peso ("Azucar (1000 kg)") — si terminó topado por
    // el stock hay que corregirlo para que coincida con lo que realmente se
    // agregó, no con lo que se pidió antes de topar.
    if (result.finalQuantity !== q) {
      renameItem(product.id, `${product.name} (${result.finalQuantity} ${unit})`)
    }
    if (result.capped) {
      toast.warning(`Solo se agregaron ${result.finalQuantity} ${unit} de "${product.name}" — stock disponible: ${product.currentStock} ${unit}.`)
    } else {
      toast.success(`${product.name} (${q} ${unit}) agregado`, {
        action: { label: 'Ver carrito', onClick: openCart }
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-2xl slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-brand-blue-600" />
            <div>
              <p className="font-bold text-gray-900 text-sm">{product.name}</p>
              <p className="text-gray-400 text-xs">S/ {price.toFixed(2)} / {unit}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors">
            <X className="h-3.5 w-3.5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-2 block">
              Cantidad ({unit}) <span className="text-gray-400">· disponible: {product.currentStock} {unit}</span>
            </label>
            <input type="number" min={0.01} max={product.currentStock} step={0.01} value={qty} onChange={e => setQty(e.target.value)}
              placeholder={`Ej: 0.5 ${unit}`} autoFocus
              className="w-full bg-gray-50 border border-gray-200 focus:border-brand-blue-400 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 text-center placeholder-gray-300 outline-none transition-colors" />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => setQty(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${qty === p ? 'bg-brand-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                {p} {unit}
              </button>
            ))}
          </div>

          {qty && parseFloat(qty) > 0 && (
            <div className="bg-brand-green-50 border border-brand-green-200 rounded-xl p-3 text-center">
              <p className="text-gray-500 text-xs mb-0.5">Total a cobrar</p>
              <p className="text-2xl font-black text-brand-green-700">S/ {total.toFixed(2)}</p>
              <p className="text-gray-400 text-xs">{qty} {unit} × S/ {price.toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 border border-gray-200 hover:border-gray-300 rounded-xl text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!qty || parseFloat(qty) <= 0}
              className="flex-1 py-3 bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-40 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
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
  const navigate = useNavigate()
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0
  const lowStock = !outOfStock && product.currentStock <= 5

  const goToProduct = () => navigate(`/producto/${product.id}`)

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (outOfStock) return
    if (product.isBulk) { setShowBulk(true); return }
    const result = addItem(product)
    if (result.addedQuantity <= 0) {
      toast.error(`"${product.name}" ya tiene todo el stock disponible en el carrito (${product.currentStock}).`)
      return
    }
    toast.success(`${product.name} agregado`, {
      duration: 1500, action: { label: 'Ver carrito', onClick: openCart }
    })
  }

  return (
    <>
      <div onClick={goToProduct}
        className={`group relative bg-white border rounded-2xl overflow-hidden transition-all duration-200 select-none cursor-pointer
          ${outOfStock ? 'opacity-60 border-gray-100' : 'border-gray-200 hover:border-brand-blue-300 hover:shadow-md'}`}>

        {/* Imagen */}
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-10 w-10 text-gray-200" /></div>
          }

          {/* Badges */}
          {product.isBulk && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 border border-gray-200 rounded-full px-2 py-0.5">
              <Scale className="h-3 w-3 text-brand-blue-600" />
              <span className="text-[10px] text-gray-600 font-medium">por {product.bulkUnit ?? 'kg'}</span>
            </div>
          )}
          {lowStock && !product.isBulk && (
            <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              Últimas {product.currentStock}
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="bg-gray-900/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
            </div>
          )}
          {qty > 0 && (
            <div className="absolute top-2 right-2 h-6 w-6 bg-brand-blue-600 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg">
              {qty}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-xs text-gray-400 mb-0.5">{product.category.name}</p>
          <p className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight mb-2">{product.name}</p>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-brand-green-700 font-bold text-lg">S/ {Number(product.salePrice).toFixed(2)}</span>
              {product.isBulk && <span className="text-gray-400 text-xs ml-1">/{product.bulkUnit ?? 'kg'}</span>}
            </div>

            {qty > 0 && !product.isBulk ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => updateQuantity(product.id, qty - 1)}
                  className="h-7 w-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors">
                  <Minus className="h-3 w-3 text-gray-600" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-gray-900">{qty}</span>
                <button onClick={() => addItem(product)} disabled={qty >= product.currentStock}
                  className="h-7 w-7 bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-30 disabled:hover:bg-brand-blue-600 text-white rounded-full flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button onClick={outOfStock ? undefined : handleAdd} disabled={outOfStock}
                className={`h-8 w-8 text-white rounded-full flex items-center justify-center transition-colors ${outOfStock ? 'bg-gray-200 cursor-not-allowed' : 'bg-brand-blue-600 group-hover:bg-brand-blue-700'}`}>
                {product.isBulk ? <Scale className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {showBulk && <BulkModal product={product} onClose={() => setShowBulk(false)} />}
    </>
  )
}
