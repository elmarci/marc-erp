import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, ShoppingBag, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import type { Offer } from '../api'
import { AddOfferModal, autoAddPack, canAutoAddPack } from './AddOfferModal'
import { useCartStore } from '../cartStore'
import { dealText } from '../lib/offers'
import { flyToCart } from '../lib/flyToCart'

export function PromoCarousel({ offers }: { offers: Offer[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [openOfferId, setOpenOfferId] = useState<string | null>(null)
  const { addBundle } = useCartStore()

  if (offers.length === 0) return null

  const openOffer = offers.find(o => o.id === openOfferId) ?? null

  // Un paquete de un solo producto no tiene nada que elegir (ej. "Pack
  // Aceite x2" con sólo Aceite Vegetal) — se agrega directo sin abrir el
  // selector, que sólo tiene sentido cuando sí hay variantes entre las
  // cuales repartir las unidades (ej. sabores de Mike's).
  const handleAddClick = (offer: Offer) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (canAutoAddPack(offer)) {
      autoAddPack(offer, addBundle)
      flyToCart()
      toast.success('Paquete agregado')
      return
    }
    setOpenOfferId(offer.id)
  }

  const scrollToIndex = (i: number) => {
    const el = scrollerRef.current
    const card = el?.children[i] as HTMLElement | undefined
    card?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    let closest = 0
    let closestDist = Infinity
    Array.from(el.children).forEach((c, i) => {
      const dist = Math.abs((c as HTMLElement).offsetLeft - el.scrollLeft)
      if (dist < closestDist) { closestDist = dist; closest = i }
    })
    setActiveIndex(closest)
  }

  return (
    <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 pt-2">
      <div className="relative group">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex gap-2.5 overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {offers.map((offer, i) => {
            const firstProduct = offer.products[0]?.product
            const hasMedia = Boolean(offer.storeImage || offer.storeVideo)
            // Diseño ya armado (flyer con texto/precio incluidos) — se muestra
            // tal cual, sin superponerle nuestro propio título/badge/precio.
            const isFullDesign = offer.storeFullDesign && Boolean(offer.storeImage)
            return (
              <Link
                key={offer.id}
                to="/ofertas"
                className={`relative shrink-0 w-[86%] sm:w-[calc(50%-8px)] lg:w-[calc(42%-8px)] snap-start rounded-2xl overflow-hidden shadow-card h-[168px] sm:h-auto sm:aspect-[3/2] flex ${
                  hasMedia ? 'items-end' : 'bg-white items-center gap-3 p-4'
                }`}
              >
                {offer.storeVideo ? (
                  <video
                    src={offer.storeVideo}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted loop autoPlay playsInline
                  />
                ) : offer.storeImage ? (
                  // Nunca sabemos con qué proporción va a venir la imagen que
                  // suban (flyers de proveedores casi siempre son más anchos
                  // que la tarjeta 3:2) — en vez de recortarla a la fuerza
                  // con object-cover (cortaba texto/productos en los bordes),
                  // se rellena el espacio sobrante con una copia
                  // desenfocada de la misma imagen de fondo, y la imagen
                  // real se muestra completa encima sin recortar nada.
                  <>
                    <img src={offer.storeImage} alt="" aria-hidden
                      className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-80" />
                    <img src={offer.storeImage} alt={offer.name} className="absolute inset-0 h-full w-full object-contain" />
                  </>
                ) : (
                  // Sin foto ni video de la promo: tarjeta blanca con el texto a
                  // la izquierda y la foto del producto a la derecha.
                  <>
                    <div className="flex-1 min-w-0 flex flex-col items-start gap-1.5">
                      <h3 className="text-base font-extrabold text-paper-ink leading-tight line-clamp-2">{offer.name}</h3>
                      <span className="bg-brand-sun-400 text-brand-sun-900 text-sm font-extrabold px-2 py-0.5 rounded-md">{dealText(offer)}</span>
                      {offer.products.length > 0 ? (
                        <button onClick={handleAddClick(offer)}
                          className="mt-1 h-11 px-4 rounded-xl bg-brand-green-600 active:bg-brand-green-700 text-white font-bold text-sm flex items-center gap-1.5">
                          <ShoppingCart className="h-4 w-4" aria-hidden="true" />Agregar
                        </button>
                      ) : (
                        <span className="mt-1 h-11 flex items-center text-sm font-bold text-brand-blue-600">Ver oferta</span>
                      )}
                    </div>
                    <div className={`h-28 w-28 shrink-0 rounded-xl overflow-hidden flex items-center justify-center ${firstProduct?.imageUrl ? 'bg-white' : 'bg-paper-surface'}`}>
                      {firstProduct?.imageUrl
                        ? <img src={firstProduct.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                        : <ShoppingBag className="h-10 w-10 text-paper-ink-ghost" aria-hidden="true" />}
                    </div>
                  </>
                )}

                {hasMedia && !isFullDesign && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />}

                {hasMedia && !isFullDesign && (
                <div className="relative z-10 p-4 sm:p-8 max-w-md text-white">
                  {offer.storeBadge && (
                    <span className="inline-block bg-white text-paper-ink text-xs font-bold px-2.5 py-0.5 rounded-md mb-1.5">
                      {offer.storeBadge}
                    </span>
                  )}
                  <h3 className="text-base sm:text-2xl font-extrabold mb-1 leading-tight line-clamp-1">{offer.name}</h3>
                  {offer.description && (
                    <p className="text-white/80 text-sm mb-3 hidden sm:block line-clamp-2">{offer.description}</p>
                  )}
                  <p className="inline-block bg-brand-sun-400 text-brand-sun-900 text-sm sm:text-lg font-extrabold px-2 py-0.5 rounded-md mb-2.5">{dealText(offer)}</p>
                  <div className="flex items-center gap-2">
                    {offer.products.length > 0 && (
                      <button onClick={handleAddClick(offer)}
                        className="inline-flex items-center gap-1.5 h-11 bg-brand-green-600 active:bg-brand-green-700 text-white font-bold px-4 rounded-xl text-sm">
                        <ShoppingCart className="h-4 w-4" />Agregar
                      </button>
                    )}
                    <span className="inline-flex items-center h-11 bg-white text-paper-ink font-bold px-4 rounded-xl text-sm">
                      Ver oferta
                    </span>
                  </div>
                </div>
                )}

                {/* Diseño ya armado (flyer sin overlay de texto propio) — el
                    flyer ya trae su propio precio/texto, así que el botón se
                    reduce a un ícono chico en la esquina superior (donde los
                    flyers casi nunca ponen nada importante) en vez de una
                    píldora ancha abajo que tapaba precio/CTA del diseño
                    original. Semitransparente hasta que se le pasa el dedo o
                    el mouse por encima, para molestar lo menos posible a la
                    vista. Antes esta tarjeta sólo llevaba a /ofertas y había
                    que agregar los productos ahí uno por uno. */}
                {isFullDesign && offer.products.length > 0 && (
                  <button onClick={handleAddClick(offer)} aria-label="Agregar al carrito"
                    className="absolute z-10 top-3 right-3 h-11 w-11 flex items-center justify-center rounded-full bg-white/80 hover:bg-brand-green-600 text-brand-green-700 hover:text-white backdrop-blur-sm shadow-md transition-colors">
                    <ShoppingCart className="h-4.5 w-4.5" />
                  </button>
                )}
              </Link>
            )
          })}
        </div>

        {offers.length > 1 && (
          <>
            <button
              onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              aria-label="Anterior"
              className="hidden sm:flex absolute left-1 top-[45%] -translate-y-1/2 h-9 w-9 bg-white/90 hover:bg-white rounded-full items-center justify-center shadow-md opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity z-20"
            >
              <ChevronLeft className="h-5 w-5 text-paper-ink-soft" />
            </button>
            <button
              onClick={() => scrollToIndex(Math.min(offers.length - 1, activeIndex + 1))}
              disabled={activeIndex === offers.length - 1}
              aria-label="Siguiente"
              className="hidden sm:flex absolute right-1 top-[45%] -translate-y-1/2 h-9 w-9 bg-white/90 hover:bg-white rounded-full items-center justify-center shadow-md opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity z-20"
            >
              <ChevronRight className="h-5 w-5 text-paper-ink-soft" />
            </button>

            <div className="flex justify-center gap-1.5 mt-3">
              {offers.map((_, i) => (
                <span key={i} aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-6 bg-brand-blue-600' : 'w-1.5 bg-paper-line'}`} />
              ))}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {openOffer && <AddOfferModal offer={openOffer} onClose={() => setOpenOfferId(null)} />}
      </AnimatePresence>
    </section>
  )
}
