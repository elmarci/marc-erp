import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '../api'
import { useBackClose } from '../lib/useBackClose'
import { useCartStore } from '../cartStore'
import { flyToCart } from '../lib/flyToCart'
import { thumb } from '../lib/thumb'
import { missingRequired, packSavings, withChoice, type Choice } from '../lib/choices'

/* ── Selector de presentación: Unidad / Paquete ──────────────────────── */
export function PackPicker({ product, pack, onChange }: { product: Product; pack: boolean; onChange: (pack: boolean) => void }) {
  if (!product.pack || product.isBulk) return null
  const packStock = Math.floor(product.currentStock / product.pack.size)
  const save = packSavings(product)
  const opt = (active: boolean) =>
    `flex-1 min-h-[56px] rounded-xl border-2 px-2 py-1.5 flex flex-col items-center justify-center text-center leading-tight ${active ? 'border-brand-blue-600 bg-brand-blue-50' : 'border-paper-line bg-white'} disabled:opacity-40`
  return (
    <div>
      <p className="text-[15px] font-bold text-paper-ink mb-2">¿Cómo lo quieres?</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Presentación">
        <button type="button" role="radio" aria-checked={!pack} onClick={() => onChange(false)} className={opt(!pack)}>
          <span className="text-[15px] font-bold text-paper-ink">Unidad</span>
          <span className="text-sm text-paper-ink-soft tabular-nums">S/ {product.salePrice.toFixed(2)}</span>
        </button>
        <button type="button" role="radio" aria-checked={pack} disabled={packStock < 1} onClick={() => onChange(true)} className={opt(pack)}>
          <span className="text-[15px] font-bold text-paper-ink">{product.pack.label} x{product.pack.size}</span>
          <span className="text-sm text-paper-ink-soft tabular-nums">S/ {product.pack.price.toFixed(2)}</span>
          {save > 0 && <span className="text-xs font-bold text-brand-green-700 tabular-nums">Ahorras S/ {save.toFixed(2)}</span>}
        </button>
      </div>
      {packStock < 1 && <p className="mt-1.5 text-xs text-paper-ink-soft">Hoy no alcanza para un {product.pack.label.toLowerCase()} completo.</p>}
    </div>
  )
}

/* ── Opciones de despacho: pierna/pecho, helada/sin helar ────────────── */
export function OptionsPicker({ product, value, onChange, showMissing }: {
  product: Product; value: Record<string, string>; onChange: (v: Record<string, string>) => void; showMissing?: boolean
}) {
  if (!product.options?.length) return null
  return (
    <div className="space-y-3">
      {product.options.map(g => {
        const missing = showMissing && g.required && !value[g.id]
        return (
          <div key={g.id} role="radiogroup" aria-label={g.name}>
            <p className="text-[15px] font-bold text-paper-ink mb-2">
              {g.name}{' '}
              <span className={`text-xs font-semibold ${missing ? 'text-red-600' : 'text-paper-ink-soft'}`}>
                {g.required ? (missing ? 'Elige una' : 'Obligatorio') : 'Opcional'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {g.choices.map(c => {
                const active = value[g.id] === c
                return (
                  <button key={c} type="button" role="radio" aria-checked={active}
                    onClick={() => onChange({ ...value, [g.id]: active && !g.required ? '' : c })}
                    className={`min-h-11 px-4 rounded-full border-2 text-[15px] font-semibold ${active ? 'border-brand-blue-600 bg-brand-blue-600 text-white' : missing ? 'border-red-300 bg-white text-paper-ink' : 'border-paper-line bg-white text-paper-ink'}`}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Ventana para elegir antes de agregar (productos por unidad) ─────── */
export function ChoiceModal({ product, onClose, initialPack = false }: { product: Product; onClose: () => void; initialPack?: boolean }) {
  useBackClose(true, onClose)
  const { addItem, openCart } = useCartStore()
  const [choice, setChoice] = useState<Choice>({ pack: initialPack && !!product.pack, options: {} })
  const [qty, setQty] = useState(1)
  const [tried, setTried] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const line = withChoice(product, choice)
  const missing = missingRequired(product, choice.options)
  const maxQty = line.currentStock

  const handleAdd = () => {
    if (missing.length) { setTried(true); toast.error(`Elige ${missing.join(' y ').toLowerCase()}`); return }
    const result = addItem(line, Math.min(qty, maxQty))
    if (result.addedQuantity <= 0) { toast.error('Ya tienes en el carrito todo lo disponible.'); return }
    flyToCart(imgRef.current)
    toast.success(`${line.name}${line.line?.optionsText ? ` · ${line.line.optionsText}` : ''} agregado`, {
      action: { label: 'Ver carrito', onClick: openCart },
    })
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={product.name}
        className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl"
        initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-paper-line">
          {product.imageUrl
            ? <img ref={imgRef} src={thumb(product.imageUrl, 160)} alt="" className="h-14 w-14 rounded-xl object-contain bg-white shrink-0" />
            : <div className="h-14 w-14 rounded-xl bg-paper-surface shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-paper-ink leading-tight line-clamp-2">{product.name}</p>
            <p className="text-sm text-paper-ink-soft tabular-nums">S/ {line.salePrice.toFixed(2)}{line.line?.pack ? ` el ${product.pack!.label.toLowerCase()}` : ' c/u'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="h-11 w-11 -mr-2 rounded-full flex items-center justify-center text-paper-ink-soft">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <PackPicker product={product} pack={choice.pack} onChange={pack => { setChoice(c => ({ ...c, pack })); setQty(1) }} />
          <OptionsPicker product={product} value={choice.options} showMissing={tried}
            onChange={options => setChoice(c => ({ ...c, options }))} />

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-paper-surface rounded-xl h-[52px]">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Uno menos"
                className="h-[52px] w-12 flex items-center justify-center disabled:text-paper-ink-ghost text-paper-ink">
                <Minus className="h-5 w-5" />
              </button>
              <span className="w-8 text-center text-lg font-extrabold tabular-nums text-paper-ink" aria-live="polite">{qty}</span>
              <button onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Uno más"
                className="h-[52px] w-12 flex items-center justify-center disabled:text-paper-ink-ghost text-paper-ink">
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <button onClick={handleAdd} disabled={maxQty < 1}
              className="flex-1 h-[52px] rounded-xl bg-brand-green-600 active:bg-brand-green-700 disabled:opacity-40 text-white font-bold text-base tabular-nums">
              Agregar · S/ {(line.salePrice * qty).toFixed(2)}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
