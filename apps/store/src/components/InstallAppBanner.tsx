import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X, Share, SquarePlus, Check, Compass } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'marc-install-dismissed-at'
const COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7 // 7 días

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIos() {
  const ua = window.navigator.userAgent
  return (/iphone|ipad|ipod/i.test(ua) && !('MSStream' in window))
    // iPadOS 13+ se hace pasar por Mac de escritorio — se detecta por el
    // touch en un "Mac" (una Mac real no tiene pantalla táctil).
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// En iOS SÓLO Safari puede instalar una PWA de verdad (agregándola queda
// como app standalone). Chrome/Firefox/Edge en iPhone son webviews de Safari
// pero "Agregar a inicio" ahí crea sólo un acceso directo, no la app.
function isIosSafari() {
  const ua = window.navigator.userAgent
  return isIos() && !/crios|fxios|edgios|opt\//i.test(ua)
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  return !isNaN(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS
}

/* ── Modal de instrucciones para iPhone ──────────────────────────────────
   Apple no deja que una web dispare la instalación con un botón (no existe
   ese permiso en iOS), así que el único camino es manual desde Safari. Este
   modal lo explica paso a paso en vez de dejar un ícono muerto que no hace
   nada — que es justo lo que se reportaba como "el botón de descarga no
   funciona en iPhone". ──────────────────────────────────────────────── */
function IosInstallGuide({ onClose }: { onClose: () => void }) {
  const notSafari = isIos() && !isIosSafari()

  const steps = [
    { icon: Share, text: <>Toca el botón <strong>Compartir</strong> en la barra de abajo de Safari</> },
    { icon: SquarePlus, text: <>Baja y elige <strong>«Agregar a inicio»</strong> (Add to Home Screen)</> },
    { icon: Check, text: <>Toca <strong>«Agregar»</strong> arriba a la derecha — queda como una app en tu pantalla</> },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-brand-blue-50 flex items-center justify-center">
            <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-paper-ink leading-tight">Instala Tienda Marc en tu iPhone</h3>
            <p className="text-xs text-paper-ink-soft mt-0.5">Se agrega a tu pantalla de inicio como una app normal.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-paper-ink-ghost hover:bg-paper-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {notSafari && (
          <div className="flex items-start gap-2 rounded-xl bg-brand-achiote-50 border border-brand-achiote-200 p-3 mb-4">
            <Compass className="h-4 w-4 text-brand-achiote-600 shrink-0 mt-0.5" />
            <p className="text-xs text-brand-achiote-800">
              En iPhone esto sólo funciona desde <strong>Safari</strong>. Abre <span className="font-mono">tiendasmarc.pe</span> en Safari y vuelve a intentarlo.
            </p>
          </div>
        )}

        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="h-8 w-8 shrink-0 rounded-full bg-brand-green-50 text-brand-green-700 font-display font-semibold text-sm flex items-center justify-center">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 shrink-0 text-paper-ink-soft" />
              <p className="text-sm text-paper-ink leading-snug">{s.text}</p>
            </li>
          ))}
        </ol>

        <button onClick={onClose}
          className="w-full mt-5 py-3 rounded-xl bg-brand-green-600 hover:bg-brand-green-700 text-white font-semibold text-sm transition-colors">
          Entendido
        </button>
      </motion.div>
    </motion.div>
  )
}

// Banner de instalación de la PWA — el aviso automático del navegador pasa
// desapercibido para clientes de una tienda, así que se muestra uno propio.
// Android/Chrome usa el evento beforeinstallprompt real; iOS Safari no lo
// dispara (Apple no lo soporta), así que ahí el botón abre una guía paso a
// paso en vez de intentar (y fallar en silencio) disparar la instalación.
export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    if (isIos()) {
      setShowIos(true)
      setVisible(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            // Arriba de los FAB de WhatsApp/voz (bottom-20) en mobile — si no,
            // el botón de cerrar y el de "Cómo" quedaban tapados por el FAB
            // de voz y no se podían tocar.
            className="fixed bottom-40 md:bottom-0 inset-x-0 z-40 px-3 pointer-events-none md:pb-3"
          >
            <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-paper-line p-3.5 flex items-center gap-3 pointer-events-auto">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-brand-blue-50 flex items-center justify-center">
                <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-paper-ink">Instala la app de Tienda Marc</p>
                <p className="text-xs text-paper-ink-soft truncate">
                  {showIos ? 'Te mostramos cómo en 3 pasos' : 'Compra más rápido, sin abrir el navegador'}
                </p>
              </div>
              {showIos ? (
                <button onClick={() => setShowIosGuide(true)}
                  className="shrink-0 flex items-center gap-1.5 rounded-full bg-brand-green-600 hover:bg-brand-green-700 text-white text-sm font-semibold px-3.5 py-2 transition-colors">
                  <Share className="h-4 w-4" />Cómo
                </button>
              ) : (
                <button onClick={handleInstall}
                  className="shrink-0 flex items-center gap-1.5 rounded-full bg-brand-green-600 hover:bg-brand-green-700 text-white text-sm font-semibold px-3.5 py-2 transition-colors">
                  <Download className="h-4 w-4" />Instalar
                </button>
              )}
              <button onClick={dismiss} aria-label="Cerrar"
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-paper-ink-ghost hover:bg-paper-surface hover:text-paper-ink-soft transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIosGuide && <IosInstallGuide onClose={() => setShowIosGuide(false)} />}
      </AnimatePresence>
    </>
  )
}
