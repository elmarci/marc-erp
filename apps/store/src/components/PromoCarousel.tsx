import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react'
import type { Offer } from '../api'

// Fallback cuando la oferta no tiene foto/video de fondo subido desde el ERP —
// para que igual se vea bien mientras el usuario sube las imágenes reales.
const GRADIENTS = [
  'from-brand-green-600 to-brand-green-900',
  'from-brand-blue-600 to-brand-blue-900',
  'from-paper-ink to-brand-blue-800',
]

function getOfferBadgeText(offer: Offer) {
  if (offer.type === 'PERCENTAGE_DISCOUNT') return `${offer.value}% OFF`
  if (offer.type === 'FIXED_DISCOUNT') return `S/ ${offer.value} OFF`
  if (offer.type === 'BUY_X_GET_Y') {
    const b = offer.buyQuantity ?? 2, g = offer.getQuantity ?? 3
    return `Lleva ${g} paga ${b}`
  }
  return 'Precio especial'
}

export function PromoCarousel({ offers }: { offers: Offer[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  if (offers.length === 0) return null

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
    <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="relative group">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0"
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
                className={`relative shrink-0 w-[86%] sm:w-[calc(50%-8px)] lg:w-[calc(42%-8px)] snap-start rounded-3xl overflow-hidden shadow-lg aspect-[3/2] flex items-end ${
                  hasMedia ? '' : `bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`
                }`}
              >
                {offer.storeVideo ? (
                  <video
                    src={offer.storeVideo}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted loop autoPlay playsInline
                  />
                ) : offer.storeImage ? (
                  <img src={offer.storeImage} alt={offer.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <>
                    <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl animate-float-blob" />
                    <div className="absolute -bottom-16 right-24 h-56 w-56 rounded-full bg-white/5 blur-3xl animate-float-blob-slow" />
                    <div className="hidden sm:flex absolute right-6 md:right-10 top-1/2 -translate-y-1/2 h-40 md:h-48 w-40 md:w-48 bg-white/95 rounded-2xl items-center justify-center shadow-2xl">
                      {firstProduct?.imageUrl
                        ? <img src={firstProduct.imageUrl} alt={firstProduct.name} className="h-full w-full object-contain p-4" />
                        : <ShoppingBag className="h-16 w-16 text-paper-ink-ghost" />}
                    </div>
                  </>
                )}

                {hasMedia && !isFullDesign && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />}

                {!isFullDesign && (
                <div className="relative z-10 p-6 sm:p-8 max-w-md text-white">
                  {offer.storeBadge && (
                    <span className="inline-block bg-white text-paper-ink text-xs font-black px-3 py-1 rounded-full mb-3">
                      {offer.storeBadge}
                    </span>
                  )}
                  <h3 className="text-xl sm:text-2xl font-black mb-1 leading-tight">{offer.name}</h3>
                  {offer.description && (
                    <p className="text-white/80 text-sm mb-3 hidden sm:block line-clamp-2">{offer.description}</p>
                  )}
                  <p className="text-2xl sm:text-3xl font-black mb-4">{getOfferBadgeText(offer)}</p>
                  <span className="inline-block bg-white/95 text-paper-ink font-bold px-5 py-2.5 rounded-full text-sm">
                    Ver oferta
                  </span>
                </div>
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

            <div className="flex justify-center gap-1.5 mt-4">
              {offers.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollToIndex(i)}
                  aria-label={`Ir a promoción ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-6 bg-brand-green-600' : 'w-1.5 bg-paper-line hover:bg-paper-ink-ghost'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
