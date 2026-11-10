import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingCart, ShoppingBag, Plus, Minus, Scale, X } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'
import { flyToCart } from '../lib/flyToCart'

// Redondeo a gramo (o su equivalente) al calcular el peso desde un monto —
// evita arrastrar error de punto flotante (ej. 0.267000000004).
const BULK_WEIGHT_STEP = 0.001

/* ── Modal para productos a granel ─────────────────────────────────── */
function BulkModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addItem, renameItem, openCart } = useCartStore()
  // Sólo tiene sentido "pedir por monto" en unidades que se pesan/miden de
  // verdad (kg, g, L) — para "unidad" (ej. a granel por pieza suelta) el
  // precio ya es exacto sin necesidad de pesar nada.
  const isWeighable = product.bulkUnit === 'kg' || product.bulkUnit === 'g' || product.bulkUnit === 'L'
  const [mode, setMode] = useState<'peso' | 'monto'>(isWeighable ? 'monto' : 'peso')
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const unit = product.bulkUnit ?? 'kg'
  const price = Number(product.salePrice)

  // Modo "por monto": quien compra a distancia no tiene forma de saber
  // cuánto pesa "un pecho de pollo" — pero sí sabe cuánto quiere gastar. Se
  // calcula el peso aproximado sólo como referencia; lo que se cobra es
  // exactamente el monto que eligió, sin sorpresas al pesar en tienda.
  const amountNum = parseFloat(amount)
  const computedQty = amountNum > 0 && price > 0
    ? Number((Math.round((amountNum / price) / BULK_WEIGHT_STEP) * BULK_WEIGHT_STEP).toFixed(3))
    : 0

  const finalQty = mode === 'monto' ? computedQty : parseFloat(qty || '0')
  const total = (finalQty > 0 ? finalQty : 0) * price
  const presets = ['0.25', '0.5', '1', '1.5', '2', '3']
  const amountPresets = ['5', '10', '15', '20']

  const handleAdd = () => {
    const q = finalQty
    if (!q || q <= 0) { toast.error(mode === 'monto' ? 'Ingresa un monto válido' : 'Ingresa una cantidad válida'); return }
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
      toast.success(`${product.name} (${result.finalQuantity} ${unit}) agregado`, {
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
          {isWeighable && (
            <div className="flex rounded-xl bg-paper-surface p-1 text-sm font-semibold">
              <button onClick={() => setMode('monto')}
                className={`flex-1 rounded-lg py-1.5 transition-colors ${mode === 'monto' ? 'bg-white shadow-sm text-paper-ink' : 'text-paper-ink-ghost'}`}>
                Por monto (S/)
              </button>
              <button onClick={() => setMode('peso')}
                className={`flex-1 rounded-lg py-1.5 transition-colors ${mode === 'peso' ? 'bg-white shadow-sm text-paper-ink' : 'text-paper-ink-ghost'}`}>
                Por peso
              </button>
            </div>
          )}

          {mode === 'monto' ? (
            <>
              <div>
                <label className="text-sm text-paper-ink-soft mb-2 block">¿Cuánto quieres gastar?</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-paper-ink-ghost">S/</span>
                  <input type="number" min={0.5} step={0.5} value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="Ej: 10" autoFocus
                    className="w-full bg-paper-surface border border-paper-line focus:border-brand-green-400 rounded-xl pl-11 pr-4 py-3 text-lg font-bold text-paper-ink text-center placeholder-paper-ink-ghost outline-none transition-colors" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {amountPresets.map(p => (
                  <button key={p} onClick={() => setAmount(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${amount === p ? 'bg-brand-green-600 text-white' : 'bg-paper-surface hover:bg-paper-line text-paper-ink-soft'}`}>
                    S/ {p}
                  </button>
                ))}
              </div>
              {computedQty > 0 && (
                <p className="text-paper-ink-ghost text-xs text-center">
                  Equivale aprox. a <span className="font-bold text-paper-ink-soft">{computedQty} {unit}</span> — el peso final se ajusta al pesar en tienda.
                </p>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="text-sm text-paper-ink-soft mb-2 block">
                  Cantidad ({unit}) <span className="text-paper-ink-ghost">· disponible: {product.currentStock} {unit}</span>
                </label>
                <input type="number" min={0.01} max={product.currentStock} step={0.01} value={qty} onChange={e => setQty(e.target.value)}
                  placeholder={`Ej: 0.5 ${unit}`} autoFocus={!isWeighable}
                  className="w-full bg-paper-surface border border-paper-line focus:border-brand-green-400 rounded-xl px-4 py-3 text-lg font-bold text-paper-ink text-center placeholder-paper-ink-ghost outline-none transition-colors" />
              </div>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button key={p} onClick={() => setQty(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${qty === p ? 'bg-brand-green-600 text-white' : 'bg-paper-surface hover:bg-paper-line text-paper-ink-soft'}`}>
                    {p} {unit}
                  </button>
                ))}
              </div>
            </>
          )}

          {finalQty > 0 && (
            <div className="bg-brand-green-50 border border-brand-green-200 rounded-xl p-3 text-center">
              <p className="text-paper-ink-soft text-xs mb-0.5">Total a cobrar</p>
              <p className="text-2xl font-display font-semibold text-brand-green-700">S/ {total.toFixed(2)}</p>
              <p className="text-paper-ink-ghost text-xs">{finalQty} {unit} × S/ {price.toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={!(finalQty > 0)}
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
// Sistema "Azul de confianza". Dos formas:
//  - 'row' (por defecto): en celular es una fila por producto — foto a la
//    izquierda, nombre y precio a la derecha, cantidad debajo a todo el
//    ancho — para recorrer el catálogo de arriba abajo con el pulgar. Desde
//    640 px vuelve a ser tarjeta vertical en cuadrícula.
//  - 'card': siempre tarjeta vertical (carruseles).
// El verde se reserva para el botón de agregar en toda la tienda.
export function ProductCard({ product, layout = 'row' }: { product: Product; layout?: 'row' | 'card' }) {
  const row = layout === 'row'
  const { addItem, updateQuantity, items } = useCartStore()
  const [showBulk, setShowBulk] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0
  const unit = product.bulkUnit ?? 'kg'

  const badge = outOfStock ? { text: 'Agotado', cls: 'bg-paper-ink text-white' }
    : product.isBulk ? { text: `Por ${unit}`, cls: 'bg-white text-paper-ink shadow-card' }
    : null

  const handleAdd = () => {
    if (outOfStock) return
    if (product.isBulk) { setShowBulk(true); return }
    const result = addItem(product)
    if (result.addedQuantity <= 0) {
      toast.error(`Ya tienes en el carrito todo el stock de "${product.name}" (${product.currentStock}).`)
      return
    }
    flyToCart(imgRef.current)
  }

  return (
    <>
      <article className={`h-full bg-white shadow-card flex flex-col ${row ? 'rounded-2xl p-3 gap-2.5 sm:rounded-[18px] sm:p-2.5 sm:gap-2' : 'rounded-[18px] p-2.5 gap-2'} ${outOfStock ? 'opacity-70' : ''}`}>
        <Link to={`/producto/${product.id}`} className={`flex flex-1 ${row ? 'flex-row items-start gap-3 sm:flex-col sm:items-stretch sm:gap-2' : 'flex-col gap-2'}`}>
          {/* La foto va completa (contain) sobre blanco: así todas ocupan el
              mismo cuadro aunque vengan con tamaños y recortes distintos. */}
          <div className={`relative overflow-hidden ${product.imageUrl ? 'bg-white' : 'bg-paper-surface'} ${row ? 'h-[72px] w-[72px] shrink-0 rounded-lg sm:h-auto sm:w-full sm:aspect-square sm:rounded-xl' : 'aspect-square rounded-xl'}`}>
            {product.imageUrl
              ? <img ref={imgRef} src={product.imageUrl} alt="" loading="lazy" decoding="async" width={300} height={300}
                  className="w-full h-full object-contain" />
              : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className={`text-paper-ink-ghost ${row ? 'h-7 w-7 sm:h-10 sm:w-10' : 'h-10 w-10'}`} aria-hidden="true" /></div>}

            {badge && (
              <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-lg ${badge.cls} ${row ? 'hidden sm:block' : ''}`}>{badge.text}</span>
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className={`text-paper-ink line-clamp-2 ${row ? 'text-[15px] font-medium leading-snug sm:font-semibold sm:leading-tight sm:min-h-[2.5em]' : 'text-[15px] font-semibold leading-tight min-h-[2.5em]'}`}>{product.name}</p>
            <p className={`font-extrabold text-paper-ink tabular-nums leading-tight ${row ? 'text-lg sm:text-xl' : 'text-xl'}`}>
              S/ {Number(product.salePrice).toFixed(2)}
              {product.isBulk && <span className="text-sm font-semibold text-paper-ink-soft"> /{unit}</span>}
            </p>
          </div>
        </Link>

        {/* Control compacto y alineado a la izquierda (176 px en celular): no
            ocupa todo el ancho y deja libre la esquina de los botones flotantes. */}
        <div className={`flex items-center justify-between gap-3 ${row ? '' : 'flex-col items-stretch'}`}>
          {outOfStock || product.isBulk ? (
            <button onClick={handleAdd} disabled={outOfStock}
              aria-label={outOfStock ? `${product.name}, agotado` : `Elegir cantidad de ${product.name}`}
              className={`h-11 rounded-xl flex items-center justify-center gap-1.5 font-bold text-sm ${row ? 'w-44 sm:w-full' : 'w-full'} ${outOfStock ? 'bg-paper-surface text-paper-ink-soft cursor-not-allowed' : 'bg-brand-green-600 active:bg-brand-green-700 text-white'}`}>
              {outOfStock ? 'Agotado' : <><Scale className="h-4 w-4" />Elegir cantidad</>}
            </button>
          ) : (
            <div className={`flex items-stretch h-[46px] rounded-xl overflow-hidden border border-paper-line ${row ? 'w-44 sm:w-full' : 'w-full'}`}>
              <button onClick={() => updateQuantity(product.id, qty - 1)} disabled={qty === 0}
                aria-label={`Quitar uno de ${product.name}`}
                className="w-11 flex items-center justify-center text-paper-ink active:bg-paper-surface disabled:text-paper-ink-ghost disabled:opacity-50">
                <Minus className="h-4 w-4" />
              </button>
              <span aria-live="polite"
                className={`flex-1 flex items-center justify-center text-base font-bold tabular-nums ${qty > 0 ? 'text-paper-ink' : 'text-paper-ink-soft'}`}>{qty}</span>
              <button onClick={qty > 0 ? () => { addItem(product); flyToCart(imgRef.current) } : handleAdd}
                disabled={qty >= product.currentStock}
                aria-label={qty > 0 ? `Agregar uno más de ${product.name}` : `Agregar ${product.name}`}
                className="w-11 flex items-center justify-center bg-brand-green-600 active:bg-brand-green-700 disabled:opacity-40 text-white">
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )}
          {row && qty > 0 && !product.isBulk && (
            <span className="sm:hidden text-sm font-semibold text-paper-ink-soft tabular-nums">
              Subtotal S/ {(qty * Number(product.salePrice)).toFixed(2)}
            </span>
          )}
        </div>
      </article>

      <AnimatePresence>
        {showBulk && <BulkModal product={product} onClose={() => setShowBulk(false)} />}
      </AnimatePresence>
    </>
  )
}
