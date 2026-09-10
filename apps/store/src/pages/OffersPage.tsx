import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Tag, ShoppingCart, Clock, Package, X, ChevronRight } from 'lucide-react'
import { storeApi, type Offer } from '../api'
import { useCartStore } from '../cartStore'
import { AddOfferModal, autoAddPack, canAutoAddPack } from '../components/AddOfferModal'
import { getCategoryIcon } from '../categoryIcons'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

function getDiscountedPrice(originalPrice: number, offer: Offer): number {
  if (offer.type === 'PERCENTAGE_DISCOUNT') {
    return Math.round(originalPrice * (1 - offer.value / 100) * 100) / 100
  }
  if (offer.type === 'FIXED_DISCOUNT') {
    return Math.max(0, Math.round((originalPrice - offer.value) * 100) / 100)
  }
  return originalPrice
}

function getBuyXGetYPrice(originalPrice: number, offer: Offer): { pricePerUnit: number; totalUnits: number; paidUnits: number } {
  // e.g. BUY 2 GET 3: pay for 2, receive 3
  const paidUnits = offer.buyQuantity ?? 2
  const totalUnits = offer.getQuantity ?? 3
  const pricePerUnit = Math.round((originalPrice * paidUnits / totalUnits) * 100) / 100
  return { pricePerUnit, totalUnits, paidUnits }
}

// Texto corto del badge — se usa tanto en la card compacta de la lista como
// en el detalle, antes vivía sólo dentro de OfferCard.
function getOfferBadgeText(offer: Offer): string {
  if (offer.type === 'PERCENTAGE_DISCOUNT') return `${offer.value}% OFF`
  if (offer.type === 'FIXED_DISCOUNT') return `S/ ${offer.value} OFF`
  if (offer.type === 'BUY_X_GET_Y') {
    const b = offer.buyQuantity ?? 2, g = offer.getQuantity ?? 3
    return `${g}×${b} — Lleva ${g} paga ${b}`
  }
  return 'Precio especial'
}

// Imagen representativa de la oferta: la que subió el dueño de la tienda
// para esa promo si existe, si no la del primer producto que trae, si no
// nada (placeholder con ícono).
function getOfferImage(offer: Offer): string | null {
  return offer.storeImage ?? offer.products[0]?.product.imageUrl ?? null
}

/* ── Detalle completo de una oferta — arma el carrito de verdad ────────── */
function OfferDetail({ offer, accent = 'green' }: { offer: Offer; accent?: 'green' | 'achiote' }) {
  const { addItem, addBundle, openCart } = useCartStore()
  const [showPackModal, setShowPackModal] = useState(false)
  const headerBg = accent === 'green' ? 'bg-brand-green-600' : 'bg-brand-achiote-500'
  // BUY_X_GET_Y / BUNDLE_PRICE son paquetes de precio fijo total, sin
  // importar cuáles productos de la lista lo completen (ej. "3 sabores de
  // Mike's x S/15") — una sola acción abre el selector de cantidades
  // (AddOfferModal), que reparte el precio total entre las unidades elegidas.
  const isPack = offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE' || offer.type === 'COMBO'

  const handlePackClick = () => {
    if (canAutoAddPack(offer)) {
      autoAddPack(offer, addBundle)
      toast.success(`${offer.name} agregado al carrito`, { action: { label: 'Ver carrito', onClick: openCart } })
      return
    }
    setShowPackModal(true)
  }

  const handleAdd = (product: Offer['products'][0]['product']) => {
    const originalPrice = Number(product.salePrice)
    const finalPrice = getDiscountedPrice(originalPrice, offer)
    const savings = Math.round((originalPrice - finalPrice) * 100) / 100
    addItem({
      id: product.id,
      name: product.name,
      salePrice: finalPrice,
      currentStock: 99,
      imageUrl: product.imageUrl,
      barcode: null,
      description: savings > 0 ? `Descuento: ahorras S/ ${savings.toFixed(2)}` : null,
      category: { id: '', name: '' },
    })
    toast.success(`${product.name} agregado con descuento`, {
      description: savings > 0 ? `Precio normal S/ ${originalPrice.toFixed(2)} · Ahorras S/ ${savings.toFixed(2)}` : undefined,
      action: { label: 'Ver carrito', onClick: openCart },
    })
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden">
      {/* Header oferta — franja de color sólido tipo empaque de promo, con el
          "descuento" en grande como si fuera el precio destacado de la caja. */}
      <div className={`relative ${headerBg} text-white px-5 pt-5 pb-8`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/70 mb-1">Paquete</p>
            <h3 className="font-display font-semibold text-lg leading-tight">{offer.name}</h3>
            {offer.description && <p className="text-sm text-white/80 mt-1">{offer.description}</p>}
          </div>
          {offer.storeBadge && (
            <span className="shrink-0 bg-white text-paper-ink text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
              {offer.storeBadge}
            </span>
          )}
        </div>

        <div className="mt-4 inline-flex flex-col bg-white/15 rounded-xl px-3.5 py-2.5">
          <span className="font-display font-semibold text-2xl leading-tight">{getOfferBadgeText(offer)}</span>
          {offer.type === 'BUY_X_GET_Y' && (
            <span className="text-white/80 text-xs mt-0.5">Pagas {offer.buyQuantity ?? 2}, llevas {offer.getQuantity ?? 3}</span>
          )}
          {(offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT') && (
            <span className="text-white/80 text-xs mt-0.5">Se aplica solo al agregar</span>
          )}
        </div>

        {offer.endDate && (
          <div className="flex items-center gap-1.5 text-xs text-white/75 mt-3">
            <Clock className="h-3.5 w-3.5" />
            Hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>

      {/* Borde perforado — como si se cortara el cupón de la promo del resto
          del empaque, separando el "precio destacado" de los productos. */}
      <div className="h-3 bg-white" style={{
        WebkitMaskImage: 'radial-gradient(circle 6px at 10px 6px, transparent 6px, black 6.5px)',
        maskImage: 'radial-gradient(circle 6px at 10px 6px, transparent 6px, black 6.5px)',
        WebkitMaskRepeat: 'repeat-x', maskRepeat: 'repeat-x',
        WebkitMaskSize: '20px 12px', maskSize: '20px 12px',
      }} />

      {/* Productos de la oferta */}
      {offer.products.length > 0 && (
        <div className="p-4 pt-1">
          <p className="text-xs text-paper-ink-ghost uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            {isPack ? (canAutoAddPack(offer) ? 'Este producto' : 'Elige entre estos productos') : 'Productos en esta oferta'}
          </p>
          <div className="space-y-2">
            {offer.products.map(({ product }) => {
              const original = Number(product.salePrice)
              const isBXGY = offer.type === 'BUY_X_GET_Y'
              const isDiscount = offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT'
              const finalPrice = isDiscount ? getDiscountedPrice(original, offer) : original
              const bxgy = isBXGY ? getBuyXGetYPrice(original, offer) : null

              return (
                <div key={product.id}
                  className="flex items-center gap-3 bg-paper-surface hover:bg-paper-line/40 rounded-xl p-3 transition-colors cursor-pointer"
                  onClick={() => isPack ? handlePackClick() : handleAdd(product)}>
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name}
                      className="h-14 w-14 rounded-lg object-cover shrink-0 bg-white border border-paper-line" />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-paper-surface shrink-0 flex items-center justify-center">
                      <Tag className="h-5 w-5 text-paper-ink-ghost" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-paper-ink line-clamp-1">{product.name}</p>

                    {isDiscount && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-paper-ink-ghost line-through text-xs">S/ {original.toFixed(2)}</span>
                        <span className="text-paper-ink font-extrabold text-base">S/ {finalPrice.toFixed(2)}</span>
                        <span className="bg-brand-magenta-100 text-brand-magenta-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {offer.type === 'PERCENTAGE_DISCOUNT' ? `-${offer.value}%` : `-S/${offer.value}`}
                        </span>
                      </div>
                    )}

                    {isBXGY && bxgy && (
                      <div className="mt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-paper-ink-ghost text-xs">S/ {original.toFixed(2)} c/u</span>
                          <span className="text-paper-ink font-extrabold text-sm">
                            S/ {(bxgy.pricePerUnit * bxgy.totalUnits).toFixed(2)} el pack
                          </span>
                        </div>
                        <p className="text-paper-ink-ghost text-[11px]">
                          {bxgy.totalUnits} unidades · equivale a S/ {bxgy.pricePerUnit.toFixed(2)} c/u
                        </p>
                      </div>
                    )}

                    {!isDiscount && !isBXGY && (
                      <span className="text-paper-ink font-extrabold text-sm">S/ {original.toFixed(2)}</span>
                    )}
                  </div>

                  <button
                    onClick={e => { if (isPack) { e.stopPropagation(); handlePackClick() } }}
                    className="h-10 w-10 bg-brand-green-600 hover:bg-brand-green-700 text-white rounded-full flex items-center justify-center transition-colors shrink-0">
                    <ShoppingCart className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>

          {isPack && (
            <button onClick={handlePackClick}
              className="w-full mt-3 py-3 bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm">
              <ShoppingCart className="h-4 w-4" />
              {canAutoAddPack(offer) ? 'Agregar el paquete' : 'Elegir y agregar el paquete'}
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showPackModal && <AddOfferModal offer={offer} onClose={() => setShowPackModal(false)} />}
      </AnimatePresence>

      {offer.products.length === 0 && (
        <div className="p-5 text-center">
          <p className="text-sm text-paper-ink-soft">Oferta válida en productos seleccionados</p>
          <Link to="/catalogo" className="inline-block mt-3 text-brand-blue-600 hover:text-brand-blue-700 text-sm font-medium transition-colors">
            Ver catálogo →
          </Link>
        </div>
      )}
    </div>
  )
}

/* ── Card compacta de la lista — estilo "promociones" de una app de pagos:
   una fila angosta con imagen, nombre y el ahorro, sin todo el desglose de
   productos a la vista. Tocarla abre el detalle completo (OfferDetail) en
   una hoja modal. Antes cada oferta ocupaba una tarjeta larga siempre
   desplegada — mucho scroll para ver cuántas promos hay disponibles. ──── */
function OfferRow({ offer, accent, onOpen }: { offer: Offer; accent: 'green' | 'achiote'; onOpen: () => void }) {
  const image = getOfferImage(offer)
  const accentText = accent === 'green' ? 'text-brand-green-700 bg-brand-green-50' : 'text-brand-achiote-700 bg-brand-achiote-50'

  return (
    <button onClick={onOpen}
      className="w-full flex items-center gap-3 bg-white border border-paper-line hover:border-brand-blue-200 hover:shadow-md rounded-2xl p-3 shadow-sm transition-all text-left">
      <div className="h-16 w-16 rounded-xl overflow-hidden bg-paper-surface shrink-0 flex items-center justify-center">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Tag className="h-6 w-6 text-paper-ink-ghost" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-sm text-paper-ink line-clamp-1">{offer.name}</p>
        {offer.description && <p className="text-xs text-paper-ink-ghost line-clamp-1 mt-0.5">{offer.description}</p>}
        <span className={`inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${accentText}`}>
          {getOfferBadgeText(offer)}
        </span>
      </div>
      <ChevronRight className="h-4 w-4 text-paper-ink-ghost shrink-0" />
    </button>
  )
}

export function OffersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
    refetchInterval: 60000,
  })

  const offers = data?.data.data ?? []
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [openOffer, setOpenOffer] = useState<Offer | null>(null)

  // Categorías presentes en las ofertas activas — se derivan de los
  // productos reales que trae cada oferta (no de PromotionCategory, que no
  // todas las promos usan). Se cuenta cuántas ofertas caen en cada una para
  // no mostrar categorías vacías en los chips.
  const categoryChips = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const offer of offers) {
      const seen = new Set<string>()
      for (const { product } of offer.products) {
        if (!product.category || seen.has(product.category.id)) continue
        seen.add(product.category.id)
        const entry = map.get(product.category.id) ?? { ...product.category, count: 0 }
        entry.count += 1
        map.set(product.category.id, entry)
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [offers])

  const filteredOffers = categoryId
    ? offers.filter(o => o.products.some(({ product }) => product.category?.id === categoryId))
    : offers

  return (
    <main className="max-w-lg mx-auto px-4 py-8 sm:py-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 bg-brand-achiote-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
          <Tag className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold text-paper-ink">Ofertas de hoy</h1>
          <p className="text-paper-ink-soft text-sm">Toca una promo para ver el detalle</p>
        </div>
      </div>

      {/* Chips de categoría — sólo si hay más de una con ofertas, no tiene
          sentido segmentar cuando todo cae en la misma. */}
      {categoryChips.length > 1 && (
        <div className="flex overflow-x-auto no-scrollbar gap-2 mb-5 -mx-4 px-4">
          <button onClick={() => setCategoryId(null)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${!categoryId ? 'bg-brand-green-600 border-brand-green-600 text-white' : 'bg-white border-paper-line text-paper-ink-soft hover:border-brand-green-300'}`}>
            Todas
          </button>
          {categoryChips.map(cat => {
            const Icon = getCategoryIcon(cat.name)
            const active = categoryId === cat.id
            return (
              <button key={cat.id} onClick={() => setCategoryId(active ? null : cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${active ? 'bg-brand-green-600 border-brand-green-600 text-white' : 'bg-white border-paper-line text-paper-ink-soft hover:border-brand-green-300'}`}>
                <Icon className="h-4 w-4" />{cat.name}
              </button>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-paper-surface rounded-2xl h-20 animate-pulse" />)}
        </div>
      )}

      {!isLoading && offers.length === 0 && (
        <div className="text-center py-20">
          <Tag className="h-16 w-16 mx-auto mb-4 text-paper-ink-ghost" />
          <p className="text-paper-ink-faint text-lg">No hay ofertas activas en este momento</p>
          <Link to="/" className="inline-block mt-6 bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold px-6 py-3 rounded-full shadow-md shadow-brand-green-600/20 text-sm transition-colors">
            Ver productos
          </Link>
        </div>
      )}

      {!isLoading && filteredOffers.length === 0 && offers.length > 0 && (
        <div className="text-center py-16 text-paper-ink-ghost">
          <p>No hay ofertas en esta categoría por ahora.</p>
        </div>
      )}

      {!isLoading && filteredOffers.length > 0 && (
        <div className="space-y-2.5">
          {filteredOffers.map((offer, i) => (
            <OfferRow key={offer.id} offer={offer} accent={i % 2 === 0 ? 'green' : 'achiote'} onOpen={() => setOpenOffer(offer)} />
          ))}
        </div>
      )}

      {/* Detalle — hoja modal, mismo trato visual (bottom-sheet en mobile,
          centrado en desktop) que el selector de paquetes. */}
      <AnimatePresence>
        {openOffer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpenOffer(null)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-0 sm:p-4">
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto relative">
              <button onClick={() => setOpenOffer(null)} aria-label="Cerrar"
                className="absolute top-3 right-3 z-10 h-8 w-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-paper-ink-soft">
                <X className="h-4 w-4" />
              </button>
              <OfferDetail offer={openOffer} accent={filteredOffers.findIndex(o => o.id === openOffer.id) % 2 === 0 ? 'green' : 'achiote'} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
