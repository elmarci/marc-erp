import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react'
import type { Offer } from '../api'

const AUTOPLAY_MS = 6000

// Alterna azul/verde de marca para que el carrusel se sienta variado sin
// salirse de la paleta — cada slide un color distinto al anterior.
const GRADIENTS = [
  'from-brand-blue-700 to-brand-blue-900',
  'from-brand-green-700 to-brand-green-900',
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

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0.4 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0.4 }),
}

export function PromoCarousel({ offers }: { offers: Offer[] }) {
  const [[index, direction], setState] = useState<[number, number]>([0, 0])
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (paused || offers.length <= 1) return
    timerRef.current = setInterval(() => setState(([i]) => [(i + 1) % offers.length, 1]), AUTOPLAY_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [paused, offers.length])

  if (offers.length === 0) return null

  const go = (i: number, dir: number) => setState([(i + offers.length) % offers.length, dir])
  const offer = offers[index]
  const firstProduct = offer.products[0]?.product

  return (
    <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className="relative rounded-2xl overflow-hidden group h-56 sm:h-72"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={offer.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 300, damping: 32 }, opacity: { duration: 0.2 } }}
            className="absolute inset-0"
          >
            <Link to="/ofertas"
              className={`relative w-full h-full bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} text-white flex items-center overflow-hidden`}>
              {offer.storeVideo ? (
                <>
                  <video src={offer.storeVideo} className="absolute inset-0 h-full w-full object-cover"
                    muted loop autoPlay playsInline />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                </>
              ) : (
                <>
                  <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl animate-float-blob" />
                  <div className="absolute -bottom-16 right-24 h-56 w-56 rounded-full bg-white/5 blur-3xl animate-float-blob-slow" />
                </>
              )}

              <motion.div
                key={`${offer.id}-copy`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="relative z-10 px-6 sm:px-14 max-w-lg"
              >
                {offer.storeBadge && (
                  <span className="inline-block bg-white text-gray-900 text-xs font-black px-3 py-1 rounded-full mb-3 animate-pulse">
                    {offer.storeBadge}
                  </span>
                )}
                <h3 className="text-xl sm:text-3xl font-black mb-1.5 leading-tight">{offer.name}</h3>
                {offer.description && <p className="text-white/70 text-sm mb-3 hidden sm:block">{offer.description}</p>}
                <p className="text-2xl sm:text-4xl font-black text-white mb-4">{getOfferBadgeText(offer)}</p>
                <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                  className="inline-block bg-white/95 text-gray-900 font-bold px-5 py-2.5 rounded-full text-sm">
                  Ver oferta
                </motion.span>
              </motion.div>

              {/* Imagen de producto, si hay (se oculta si ya hay video de fondo) */}
              {!offer.storeVideo && (
                <div className="hidden sm:flex absolute right-6 md:right-16 top-1/2 -translate-y-1/2 h-40 md:h-52 w-40 md:w-52 bg-white/95 rounded-2xl items-center justify-center shadow-2xl">
                  {firstProduct?.imageUrl
                    ? <img src={firstProduct.imageUrl} alt={firstProduct.name} className="h-full w-full object-contain p-4" />
                    : <ShoppingBag className="h-16 w-16 text-gray-200" />}
                </div>
              )}
            </Link>
          </motion.div>
        </AnimatePresence>

        {/* Flechas */}
        {offers.length > 1 && (
          <>
            <button onClick={(e) => { e.preventDefault(); go(index - 1, -1) }} aria-label="Anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </button>
            <button onClick={(e) => { e.preventDefault(); go(index + 1, 1) }} aria-label="Siguiente"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <ChevronRight className="h-5 w-5 text-gray-700" />
            </button>

            {/* Paginación */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {offers.map((_, i) => (
                <button key={i} onClick={(e) => { e.preventDefault(); go(i, i > index ? 1 : -1) }} aria-label={`Ir a promoción ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
