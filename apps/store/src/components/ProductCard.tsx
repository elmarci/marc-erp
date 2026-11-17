import { useRef, useState } from 'react'
import { useBackClose } from '../lib/useBackClose'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Scale, X } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'
import { flyToCart } from '../lib/flyToCart'
import { thumb } from '../lib/thumb'
import { Ico } from './Ico'
import { ChoiceModal, OptionsPicker } from './ProductChoice'
import { missingRequired, needsChooser, realIdOf, withChoice } from '../lib/choices'

// Redondeo a gramo (o su equivalente) al calcular el peso desde un monto —
// evita arrastrar error de punto flotante (ej. 0.267000000004).
const BULK_WEIGHT_STEP = 0.001

/* ── Modal para productos a granel ─────────────────────────────────── */
function BulkModal({ product, onClose }: { product: Product; onClose: () => void }) {
  useBackClose(true, onClose)
  const { addItem, renameItem, openCart } = useCartStore()
  // Opciones de despacho (ej. pollo: pierna o pecho): cada elección es una
  // línea distinta del carrito.
  const [options, setOptions] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)
  const missing = missingRequired(product, options)
  const lineProduct = withChoice(product, { pack: false, options })
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
    if (missing.length) { setTried(true); toast.error(`Elige ${missing.join(' y ').toLowerCase()}`); return }
    const result = addItem({
      ...lineProduct,
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
      renameItem(lineProduct.id, `${product.name} (${result.finalQuantity} ${unit})`)
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
            <Ico name="ico-granel" className="h-7 w-7" />
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
          <OptionsPicker product={product} value={options} onChange={setOptions} showMissing={tried} />
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
// Sistema "Azul de confianza". Tarjeta vertical pensada para ir de a dos
// por fila en celular: todas miden lo mismo (foto en cuadro fijo, nombre
// reservado a 2 líneas, precio y control de cantidad a todo el ancho), así
// la cuadrícula queda pareja aunque cambien fotos y nombres.
// El verde se reserva para el botón de agregar en toda la tienda.
export function ProductCard({ product }: { product: Product }) {
  const { addItem, updateQuantity, items } = useCartStore()
  const [showBulk, setShowBulk] = useState(false)
  const [showChoice, setShowChoice] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // Con paquete u opciones, el producto puede estar en varias líneas
  // (2 heladas + 1 sin helar): el contador suma todas.
  const chooser = needsChooser(product)
  const lines = items.filter(i => !i.bundle && realIdOf(i.product) === product.id)
  const qty = chooser
    ? lines.reduce((s, i) => s + (product.isBulk ? 0 : i.quantity), 0)
    : items.find(i => i.product.id === product.id)?.quantity ?? 0
  const lastLine = lines[lines.length - 1]
  const outOfStock = product.currentStock <= 0
  const unit = product.bulkUnit ?? 'kg'

  const handleAdd = () => {
    if (outOfStock) return
    if (product.isBulk) { setShowBulk(true); return }
    if (chooser) { setShowChoice(true); return }
    const result = addItem(product)
    if (result.addedQuantity <= 0) {
      toast.error(`Ya tienes en el carrito todo el stock de "${product.name}" (${product.currentStock}).`)
      return
    }
    flyToCart(imgRef.current)
  }

  return (
    <>
      <article className={`h-full bg-white rounded-2xl shadow-card p-2.5 flex flex-col gap-2 ${outOfStock ? 'opacity-70' : ''}`}>
        <Link to={`/producto/${product.id}`} className="flex flex-col gap-2 flex-1">
          {/* La foto va completa (contain) sobre blanco: todas ocupan el
              mismo cuadro aunque vengan con tamaños y recortes distintos. */}
          <div className={`relative aspect-[4/3] sm:aspect-square rounded-xl overflow-hidden ${product.imageUrl ? 'bg-white' : 'bg-paper-surface'}`}>
            {product.imageUrl
              ? <img ref={imgRef} src={thumb(product.imageUrl, 320)} alt="" loading="lazy" decoding="async" width={300} height={300}
                  className="w-full h-full object-contain" />
              : <img src="/ilustraciones/ilu-producto-sin-foto.webp" alt="" loading="lazy" decoding="async" width={640} height={480} className="w-full h-full object-cover" />}
          </div>
          <p className="text-sm sm:text-[15px] font-semibold text-paper-ink leading-snug line-clamp-2 min-h-[2.75em]">{product.name}</p>
          <p className="text-base sm:text-[17px] font-extrabold text-paper-ink tabular-nums leading-none">
            S/ {Number(product.salePrice).toFixed(2)}
            {product.isBulk && <span className="text-[13px] font-semibold text-paper-ink-soft"> /{unit}</span>}
          </p>
          {product.pack && !product.isBulk && (
            <p className="-mt-1 text-xs font-semibold text-brand-blue-700 tabular-nums leading-none">
              {product.pack.label} x{product.pack.size}: S/ {product.pack.price.toFixed(2)}
            </p>
          )}
        </Link>

        {outOfStock || product.isBulk ? (
          <button onClick={handleAdd} disabled={outOfStock}
            aria-label={outOfStock ? `${product.name}, agotado` : `Elegir cantidad de ${product.name}`}
            className={`w-full h-[34px] rounded-full flex items-center justify-center gap-1.5 font-bold text-[13px] ${outOfStock ? 'bg-paper-surface text-paper-ink-soft cursor-not-allowed' : 'bg-brand-green-600 active:bg-brand-green-700 text-white'}`}>
            {outOfStock ? 'Agotado' : <><Scale className="h-3.5 w-3.5" />Elegir cantidad</>}
          </button>
        ) : (
          <div className="flex items-center h-[34px] rounded-full bg-paper-surface p-[3px]">
            {/* Control de cantidad delgado (34 px): píldora gris con botones
              redondos; solo el + va en verde. Cada botón tiene 28 px más el
              margen de la píldora, suficiente para el dedo sin verse tosco. */}
            <button onClick={() => chooser
                ? lastLine && updateQuantity(lastLine.product.id, lastLine.quantity - 1)
                : updateQuantity(product.id, qty - 1)} disabled={qty === 0}
              aria-label={`Quitar uno de ${product.name}`}
              className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-paper-ink active:bg-paper-line disabled:shadow-none disabled:bg-transparent disabled:text-paper-ink-ghost">
              <Minus className="h-3.5 w-3.5" strokeWidth={2.75} />
            </button>
            <span aria-live="polite"
              className={`flex-1 text-center text-sm font-bold tabular-nums ${qty > 0 ? 'text-paper-ink' : 'text-paper-ink-soft'}`}>{qty}</span>
            <button onClick={qty > 0 && !chooser ? () => { addItem(product); flyToCart(imgRef.current) } : handleAdd}
              disabled={!chooser && qty >= product.currentStock}
              aria-label={qty > 0 ? `Agregar uno más de ${product.name}` : `Agregar ${product.name}`}
              className="h-7 w-7 rounded-full bg-brand-green-600 active:bg-brand-green-700 disabled:opacity-40 text-white flex items-center justify-center">
              <Plus className="h-4 w-4" strokeWidth={2.75} />
            </button>
          </div>
        )}
      </article>

      <AnimatePresence>
        {showBulk && <BulkModal product={product} onClose={() => setShowBulk(false)} />}
        {showChoice && <ChoiceModal product={product} onClose={() => setShowChoice(false)} />}
      </AnimatePresence>
    </>
  )
}
