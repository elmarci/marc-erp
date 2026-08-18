import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingCart, ShoppingBag, Plus, Minus, Scale, X } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'
import { flyToCart } from '../lib/flyToCart'

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
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="w-full max-w-sm bg-white border border-paper-line rounded-3xl shadow-2xl"
        initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-paper-line">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-brand-green-600" />
            <div>
              <p className="font-bold text-paper-ink text-sm">{product.name}</p>
              <p className="text-paper-ink-ghost text-xs">S/ {price.toFixed(2)} / {unit}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 bg-paper-surface hover:bg-paper-line rounded-full flex items-center justify-center transition-colors">
            <X className="h-3.5 w-3.5 text-paper-ink-soft" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-paper-ink-soft mb-2 block">
              Cantidad ({unit}) <span className="text-paper-ink-ghost">· disponible: {product.currentStock} {unit}</span>
            </label>
            <input type="number" min={0.01} max={product.currentStock} step={0.01} value={qty} onChange={e => setQty(e.target.value)}
              placeholder={`Ej: 0.5 ${unit}`} autoFocus
              className="w-full bg-paper-surface border border-paper-line focus:border-brand-green-400 rounded-xl px-4 py-3 text-lg font-bold text-paper-ink text-center placeholder-paper-ink-ghost outline-none transition-colors" />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => setQty(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${qty === p ? 'bg-brand-green-600 text-white' : 'bg-paper-surface hover:bg-paper-line text-paper-ink-soft'}`}>
                {p} {unit}
              </button>
            ))}
          </div>

          {qty && parseFloat(qty) > 0 && (
            <div className="bg-brand-green-50 border border-brand-green-200 rounded-xl p-3 text-center">
              <p className="text-paper-ink-soft text-xs mb-0.5">Total a cobrar</p>
              <p className="text-2xl font-black text-brand-green-700">S/ {total.toFixed(2)}</p>
              <p className="text-paper-ink-ghost text-xs">{qty} {unit} × S/ {price.toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!qty || parseFloat(qty) <= 0}
              className="flex-1 py-3 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
              <ShoppingCart className="h-4 w-4" />Agregar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ── ProductCard ─────────────────────────────────────────────────── */
export function ProductCard({ product }: { product: Product }) {
  const { addItem, updateQuantity, items, openCart } = useCartStore()
  const [showBulk, setShowBulk] = useState(false)
  const navigate = useNavigate()
  const imgRef = useRef<HTMLImageElement>(null)
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
    flyToCart(imgRef.current)
    toast.success(`${product.name} agregado`, {
      duration: 1500, action: { label: 'Ver carrito', onClick: openCart }
    })
  }

  return (
    <>
      <motion.div onClick={goToProduct}
        whileHover={outOfStock ? undefined : { y: -6 }}
        whileTap={outOfStock ? undefined : { scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        className={`group relative bg-white border rounded-2xl overflow-hidden select-none cursor-pointer shadow-sm
          ${outOfStock ? 'opacity-60 border-paper-line' : 'border-paper-line hover:border-brand-blue-200 hover:shadow-lg'}`}>

        {/* Imagen */}
        <div className="relative aspect-square overflow-hidden bg-paper-surface">
          {product.imageUrl
            ? <img ref={imgRef} src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-10 w-10 text-paper-ink-ghost" /></div>
          }

          {/* Badges */}
          {product.isBulk && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 border border-paper-line rounded-full px-2 py-0.5">
              <Scale className="h-3 w-3 text-brand-blue-600" />
              <span className="text-[10px] text-paper-ink-soft font-medium">por {product.bulkUnit ?? 'kg'}</span>
            </div>
          )}
          {lowStock && !product.isBulk && (
            <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
              Últimas {product.currentStock}
            </span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="bg-paper-ink/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
            </div>
          )}
          <AnimatePresence>
            {qty > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="absolute top-2 right-2 h-6 w-6 bg-brand-green-600 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg">
                {qty}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-xs text-paper-ink-ghost mb-0.5">{product.category.name}</p>
          <p className="font-semibold text-sm text-paper-ink line-clamp-2 leading-tight mb-2">{product.name}</p>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-paper-ink font-extrabold text-lg tabular-nums">S/ {Number(product.salePrice).toFixed(2)}</span>
              {product.isBulk && <span className="text-paper-ink-ghost text-xs ml-1">/{product.bulkUnit ?? 'kg'}</span>}
            </div>

            {qty > 0 && !product.isBulk ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => updateQuantity(product.id, qty - 1)}
                  className="h-7 w-7 bg-paper-surface hover:bg-paper-line rounded-full flex items-center justify-center transition-colors">
                  <Minus className="h-3 w-3 text-paper-ink-soft" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-paper-ink">{qty}</span>
                <button onClick={() => { addItem(product); flyToCart(imgRef.current) }} disabled={qty >= product.currentStock}
                  className="h-7 w-7 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-30 disabled:hover:bg-brand-green-600 text-white rounded-full flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button onClick={outOfStock ? undefined : handleAdd} disabled={outOfStock}
                className={`h-8 w-8 text-white rounded-full flex items-center justify-center transition-colors ${outOfStock ? 'bg-paper-ink-ghost cursor-not-allowed' : 'bg-brand-green-600 group-hover:bg-brand-green-700'}`}>
                {product.isBulk ? <Scale className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showBulk && <BulkModal product={product} onClose={() => setShowBulk(false)} />}
      </AnimatePresence>
    </>
  )
}
