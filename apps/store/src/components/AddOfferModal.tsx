import { useState } from 'react'
import { motion } from 'framer-motion'
import { Minus, Plus, X, ShoppingBag, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { Offer } from '../api'
import { useCartStore } from '../cartStore'

// "Paquete" = oferta de cantidad fija a un precio total (BUNDLE_PRICE:
// "3 x S/15" del mismo producto o de variantes intercambiables, ej. sabores
// de Mike's; BUY_X_GET_Y: "paga 2 lleva 3"; COMBO: "N productos por S/X" —
// en la tienda se trata igual que BUNDLE_PRICE, cualquier mezcla de las
// variantes listadas cuenta para el total de unidades, sin exigir 1 de cada
// una en específico). En todos, el precio total es fijo sin importar CUÁLES
// productos elija el cliente para completarlo — antes cada fila de producto
// se agregaba por separado al precio TOTAL del paquete completo, así que
// elegir varios sabores cobraba el paquete una vez por cada uno en vez de
// una sola vez. Acá se reparte el precio total entre las unidades elegidas.
function getPackInfo(offer: Offer): { totalQty: number; totalPrice: number; hint: string } | null {
  if (offer.products.length === 0) return null
  if (offer.type === 'BUNDLE_PRICE' || offer.type === 'COMBO') {
    const totalQty = offer.type === 'COMBO'
      ? offer.products.reduce((sum, p) => sum + (p.quantity || 1), 0)
      : offer.getQuantity ?? offer.products.length
    const totalPrice = Number(offer.value)
    return { totalQty, totalPrice, hint: `Elige ${totalQty} unidades (de cualquier variante) por S/ ${totalPrice.toFixed(2)} en total` }
  }
  if (offer.type === 'BUY_X_GET_Y') {
    const buy = offer.buyQuantity ?? 2
    const get = offer.getQuantity ?? 3
    const firstPrice = Number(offer.products[0].product.salePrice)
    const totalPrice = Math.round(firstPrice * buy * 100) / 100
    return { totalQty: get, totalPrice, hint: `Elige ${get} unidades — pagas ${buy}, llevas ${get}` }
  }
  return null
}

export function AddOfferModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { addItem, setBundle, openCart } = useCartStore()
  const pack = getPackInfo(offer)
  // HAPPY_HOUR también es % de descuento (con ventana horaria aparte que ya
  // filtra el backend) — se trata igual que un descuento simple para que el
  // modal no quede con el botón bloqueado para siempre por no encajar en
  // ningún caso.
  const isDiscount = offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT' || offer.type === 'HAPPY_HOUR'

  // Si hay tantos productos como unidades pide el paquete (el caso más común:
  // 3 sabores para un "3 x S/15"), se arranca con 1 de cada uno — ya queda
  // listo para agregar de una, y el cliente igual puede ajustar antes.
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const startAtOne = pack && offer.products.length === pack.totalQty
    return Object.fromEntries(offer.products.map(({ product }) => [product.id, startAtOne ? 1 : 0]))
  })

  const totalSelected = Object.values(quantities).reduce((a, b) => a + b, 0)
  const setQty = (productId: string, qty: number) => setQuantities(prev => ({ ...prev, [productId]: Math.max(0, qty) }))

  const canConfirm = isDiscount ? totalSelected > 0 : Boolean(pack) && totalSelected === pack!.totalQty

  const handleConfirm = () => {
    const chosen = offer.products.filter(({ product }) => (quantities[product.id] ?? 0) > 0)
    if (chosen.length === 0) return

    if (isDiscount) {
      chosen.forEach(({ product }) => {
        const original = Number(product.salePrice)
        const finalPrice = offer.type === 'FIXED_DISCOUNT'
          ? Math.max(0, Math.round((original - offer.value) * 100) / 100)
          : Math.round(original * (1 - offer.value / 100) * 100) / 100 // % — también el default de HAPPY_HOUR
        addItem({
          id: product.id, name: product.name, salePrice: finalPrice, currentStock: 99,
          imageUrl: product.imageUrl, barcode: null, category: { id: '', name: '' }, description: null,
        }, quantities[product.id])
      })
    } else if (pack) {
      // Precio parejo por unidad, salga la mezcla de sabores/variantes que
      // salga — la suma de todas las líneas da exactamente el precio del
      // paquete, no un múltiplo de él. Se guardan agrupadas bajo `bundle`
      // (setBundle, no addItem) para que el carrito las muestre como un solo
      // paquete y NO se puedan incrementar sueltas ahí — si el precio por
      // unidad quedara suelto, un +1 en el carrito compraría más al precio
      // rebajado del paquete en vez del precio real del producto.
      const pricePerUnit = Math.round((pack.totalPrice / pack.totalQty) * 100) / 100
      const entries = chosen.map(({ product }) => ({
        product: {
          id: `bundle-${offer.id}-${product.id}`,
          name: product.name,
          salePrice: pricePerUnit,
          currentStock: 99,
          imageUrl: product.imageUrl,
          barcode: null,
          category: { id: '', name: '' },
          description: null,
        },
        quantity: quantities[product.id],
      }))
      setBundle(offer.id, entries, { label: offer.storeBadge ?? offer.name, totalPrice: pack.totalPrice, totalQty: pack.totalQty })
    }

    toast.success(`${offer.name} agregado al carrito`, { action: { label: 'Ver carrito', onClick: openCart } })
    onClose()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div className="w-full max-w-sm bg-white border border-paper-line rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
        initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-paper-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <PackageCheck className="h-4.5 w-4.5 text-brand-green-600 shrink-0" />
            <p className="font-bold text-paper-ink text-sm truncate">{offer.name}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 bg-paper-surface hover:bg-paper-line rounded-full flex items-center justify-center transition-colors shrink-0">
            <X className="h-3.5 w-3.5 text-paper-ink-soft" />
          </button>
        </div>

        {pack && (
          <p className="text-xs text-paper-ink-soft px-4 pt-3">{pack.hint}</p>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {offer.products.map(({ product }) => {
            const qty = quantities[product.id] ?? 0
            const atPackLimit = Boolean(pack) && totalSelected >= pack!.totalQty
            return (
              <div key={product.id} className="flex items-center gap-3 bg-paper-surface rounded-xl p-2.5">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded-lg object-cover shrink-0 bg-white border border-paper-line" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white border border-paper-line shrink-0 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-paper-ink-ghost" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-paper-ink line-clamp-2 leading-tight">{product.name}</p>
                  {!pack && <p className="text-xs text-paper-ink-ghost mt-0.5">S/ {Number(product.salePrice).toFixed(2)}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setQty(product.id, qty - 1)} disabled={qty === 0}
                    className="h-7 w-7 bg-white hover:bg-paper-line disabled:opacity-30 border border-paper-line rounded-full flex items-center justify-center transition-colors">
                    <Minus className="h-3 w-3 text-paper-ink-soft" />
                  </button>
                  <span className="w-5 text-center text-sm font-bold text-paper-ink">{qty}</span>
                  <button onClick={() => setQty(product.id, qty + 1)} disabled={atPackLimit}
                    className="h-7 w-7 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-30 text-white rounded-full flex items-center justify-center transition-colors">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-paper-line shrink-0 space-y-3">
          {pack ? (
            <p className={`text-center text-sm font-bold ${totalSelected === pack.totalQty ? 'text-brand-green-700' : 'text-paper-ink-soft'}`}>
              {totalSelected} / {pack.totalQty} unidades elegidas
              {totalSelected === pack.totalQty && ` · S/ ${pack.totalPrice.toFixed(2)} en total`}
            </p>
          ) : (
            <p className="text-center text-sm text-paper-ink-soft">{totalSelected} unidad{totalSelected === 1 ? '' : 'es'} elegida{totalSelected === 1 ? '' : 's'}</p>
          )}
          <button onClick={handleConfirm} disabled={!canConfirm}
            className="w-full py-3 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 disabled:hover:bg-brand-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
            <ShoppingBag className="h-4 w-4" />Agregar al carrito
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
