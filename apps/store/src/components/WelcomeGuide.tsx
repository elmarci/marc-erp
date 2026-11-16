import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Ilu } from './Ico'
import { useBackClose } from '../lib/useBackClose'
import { DELIVERY, FEES } from '../lib/storeInfo'

// Bienvenida de 3 pantallas: solo la primera vez que alguien abre la tienda
// en ese celular. Se puede saltar en cualquier momento. Guarda la fecha en
// que se vio para que otros avisos (ej. el de descuento de bienvenida) no
// salgan el mismo día y el visitante no reciba dos ventanas seguidas.
export const WELCOME_SEEN_KEY = 'marc-welcome-seen-at'

export function welcomeSeenAt(): number | null {
  try {
    const raw = localStorage.getItem(WELCOME_SEEN_KEY)
    return raw ? Number(raw) || null : null
  } catch { return null }
}

const SLIDES = [
  {
    ilu: 'ilu-bienvenida-elegir',
    title: 'Elige tus productos',
    text: 'Busca por nombre, entra a las categorías o mira las ofertas. También puedes dictar tu lista con el micrófono.',
  },
  {
    ilu: 'ilu-bienvenida-pagar',
    title: 'Paga como prefieras',
    text: `Yape, efectivo o tarjeta débito/crédito al recibir (el repartidor lleva el POS, comisión ${FEES.cardPercent} %). No necesitas cuenta para pedir.`,
  },
  {
    ilu: 'ilu-bienvenida-reparto',
    title: 'Te lo llevamos',
    text: `Delivery desde S/ ${DELIVERY.costFrom.toFixed(2)}, tres repartos al día. Sigues a tu repartidor en el mapa hasta tu puerta.`,
  },
] as const

// Pantallas donde la bienvenida estorbaría: pago, seguimiento de un pedido,
// formularios y la TV de la tienda.
const SKIP_ROUTES = ['/checkout', '/pedido', '/libro-de-reclamaciones', '/como-comprar']

export function WelcomeGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (welcomeSeenAt() || SKIP_ROUTES.some(r => location.pathname.startsWith(r))) return
    // Un segundo de respiro para que se vea la tienda antes de la ventana.
    const t = setTimeout(() => setOpen(true), 1000)
    return () => clearTimeout(t)
    // Solo se decide al entrar; no vuelve a evaluarse en cada navegación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    try { localStorage.setItem(WELCOME_SEEN_KEY, String(Date.now())) } catch { /* modo privado */ }
    setOpen(false)
  }
  useBackClose(open, close)

  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-paper-ink/50 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <motion.div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 pb-5"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-paper-ink-soft">Bienvenido a Tiendas Marc</span>
              <button onClick={close} aria-label="Cerrar" className="h-9 w-9 -mr-1.5 rounded-full flex items-center justify-center text-paper-ink-soft active:bg-paper-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={i} className="pt-3 pb-5 text-center"
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.18 }}>
                <Ilu name={slide.ilu} eager className="w-full h-auto aspect-[4/3]" />
                <h2 id="welcome-title" className="mt-2 text-xl font-extrabold text-paper-ink">{slide.title}</h2>
                <p className="mt-1.5 text-[15px] text-paper-ink-soft leading-relaxed">{slide.text}</p>
              </motion.div>
            </AnimatePresence>

            {/* Precarga las otras ilustraciones para que no aparezcan tarde. */}
            <div className="hidden">{SLIDES.map(sl => <Ilu key={sl.ilu} name={sl.ilu} eager />)}</div>
            <div className="flex justify-center gap-1.5 mb-4" aria-hidden="true">
              {SLIDES.map((_, n) => (
                <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-brand-blue-600' : 'w-1.5 bg-paper-line'}`} />
              ))}
            </div>

            <button onClick={() => (last ? close() : setI(i + 1))}
              className="w-full h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold">
              {last ? 'Empezar a comprar' : 'Siguiente'}
            </button>
            {last ? (
              <button onClick={() => { close(); navigate('/como-comprar') }}
                className="w-full h-11 mt-1 text-sm font-bold text-brand-blue-600">Ver la guía completa</button>
            ) : (
              <button onClick={close} className="w-full h-11 mt-1 text-sm font-bold text-paper-ink-soft">Saltar</button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
