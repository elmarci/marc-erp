import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { useCartStore } from '../cartStore'
import { useBackClose } from '../lib/useBackClose'
import { Ico, Ilu } from './Ico'
import { welcomeSeenAt } from './WelcomeGuide'

// Popup para quien navega sin cuenta: lo invita a registrarse (gratis) para
// sumar puntos, seguir sus pedidos y guardar sus direcciones. Sale a los 40 s
// de navegar o al agregar el primer producto, lo que pase primero. Nunca
// pegado a la bienvenida de 3 pantallas (2 min de respiro), ni en el pago,
// el ingreso, el seguimiento o formularios. Si lo cierra, no vuelve en 3
// días en ese celular.
const DISMISS_KEY = 'marc-register-invite-dismissed-at'
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000
// Respiro después de la bienvenida de 3 pantallas, para no encadenar dos
// ventanas seguidas: el visitante primero mira la tienda.
const AFTER_GUIDE_MS = 2 * 60 * 1000
const SKIP_ROUTES = ['/checkout', '/pedido', '/ingresar', '/libro-de-reclamaciones', '/mis-pedidos']

const BENEFITS = [
  { icon: 'ico-puntos', text: 'Sumas puntos en cada compra para canjearlos por productos' },
  { icon: 'menu-pedidos', text: 'Sigues tus pedidos y repites uno en un toque' },
  { icon: 'menu-direcciones', text: 'Guardas tus direcciones y pides más rápido' },
] as const

function readNum(key: string) {
  try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 }
}

export function RegisterInvitePopup() {
  const isLoggedIn = useAuthStore(s => !!s.isLoggedIn)
  const itemCount = useCartStore(s => s.items.length)
  const cartOpen = useCartStore(s => s.isOpen)
  const location = useLocation()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false) // pasaron los 40 s
  const [open, setOpen] = useState(false)

  const allowed = () => {
    if (isLoggedIn || cartOpen) return false
    if (Date.now() - readNum(DISMISS_KEY) < COOLDOWN_MS) return false
    const seen = welcomeSeenAt()
    if (!seen || Date.now() - seen < AFTER_GUIDE_MS) return false // primero la bienvenida
    return !SKIP_ROUTES.some(r => location.pathname.startsWith(r))
  }

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40_000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (open) return
    if ((ready || itemCount > 0) && allowed()) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, itemCount, location.pathname, isLoggedIn, cartOpen])

  // Si cerró la bienvenida hace poco, vuelve a revisar cuando se cumplan
  // los 2 minutos (sin esto esperaría a otra navegación).
  useEffect(() => {
    const seen = welcomeSeenAt()
    if (!seen || open) return
    const wait = seen + AFTER_GUIDE_MS - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => { if ((ready || itemCount > 0) && allowed()) setOpen(true) }, wait + 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, itemCount, open])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* modo privado */ }
    setOpen(false)
  }
  useBackClose(open, dismiss)

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-paper-ink/65 backdrop-blur-md p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}
          role="dialog" aria-modal="true" aria-labelledby="wo-title">
          <motion.div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_24px_60px_rgba(7,31,74,.45)] ring-1 ring-white/60 overflow-hidden"
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }} onClick={e => e.stopPropagation()}>
            <div className="relative">
              <Ilu name="ilu-registro" eager className="w-full h-44 !rounded-none" />
              <button onClick={dismiss} aria-label="Cerrar" className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 shadow-card flex items-center justify-center text-paper-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pt-4 text-center">
              <h2 id="wo-title" className="text-xl font-extrabold leading-tight text-paper-ink">Crea tu cuenta gratis y suma puntos</h2>
              <p className="mt-1 text-[15px] text-paper-ink-soft">Te toma menos de un minuto.</p>
            </div>
            <div className="px-5 pt-4 pb-5">
              <ul className="space-y-2.5">
                {BENEFITS.map(b => (
                  <li key={b.text} className="flex items-center gap-3 text-[15px] text-paper-ink leading-snug">
                    <Ico name={b.icon} className="h-8 w-8" />{b.text}
                  </li>
                ))}
              </ul>
              <button onClick={() => { setOpen(false); navigate('/ingresar') }}
                className="mt-4 w-full h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold">
                Crear mi cuenta gratis
              </button>
              <button onClick={dismiss} className="w-full h-11 mt-1 text-sm font-bold text-paper-ink-soft">Ahora no</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
