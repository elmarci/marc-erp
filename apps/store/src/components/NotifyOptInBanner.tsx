import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { toast } from 'sonner'
import { getPushPermission, subscribeToPush } from '../lib/push'

const DISMISS_KEY = 'marc-notify-dismissed-at'
const COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7 // 7 días

// Mismo storage key que InstallAppBanner.tsx — se evita mostrar los dos
// avisos de golpe (compiten por el mismo lugar en pantalla): primero se le
// pide instalar la app, y sólo una vez que ese aviso ya no aplica (quedó
// instalada o el cliente lo cerró) se le pregunta por notificaciones.
const INSTALL_DISMISS_KEY = 'marc-install-dismissed-at'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function recentlyDismissed(key: string) {
  const raw = localStorage.getItem(key)
  if (!raw) return false
  const dismissedAt = Number(raw)
  return !isNaN(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS
}

// Nunca se pide el permiso del navegador de una — casi siempre se deniega
// automático si no hay contexto. Se muestra primero este aviso propio
// explicando el porqué, y sólo al tocar "Activar" se dispara el prompt real.
export function NotifyOptInBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const permission = getPushPermission()
    // undefined = navegador sin soporte de push; 'granted'/'denied' = ya se
    // le preguntó antes (el navegador no deja volver a preguntar si negó).
    if (!permission || permission !== 'default') return
    if (recentlyDismissed(DISMISS_KEY)) return
    // Espera a que el aviso de instalación deje de competir por el espacio.
    if (!isStandalone() && !recentlyDismissed(INSTALL_DISMISS_KEY)) return

    const timer = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const handleActivate = async () => {
    const ok = await subscribeToPush()
    setVisible(false)
    if (ok) {
      toast.success('¡Listo! Te avisaremos de ofertas y horas felices nuevas.')
    } else if (getPushPermission() === 'denied') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-14 md:bottom-0 inset-x-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
        >
          <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-paper-line p-3.5 flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-brand-green-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-brand-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-paper-ink">¿Avisos de ofertas?</p>
              <p className="text-xs text-paper-ink-soft truncate">Entérate apenas hay una promo nueva o empieza la hora feliz</p>
            </div>
            <button onClick={handleActivate}
              className="shrink-0 flex items-center gap-1.5 rounded-full bg-brand-green-600 hover:bg-brand-green-700 text-white text-sm font-semibold px-3.5 py-2 transition-colors">
              <Bell className="h-4 w-4" />Activar
            </button>
            <button onClick={dismiss} aria-label="Cerrar"
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-paper-ink-ghost hover:bg-paper-surface hover:text-paper-ink-soft transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
