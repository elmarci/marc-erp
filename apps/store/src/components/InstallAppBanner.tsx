import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X, Share } from 'lucide-react'

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
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !('MSStream' in window)
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  return !isNaN(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS
}

// Banner de instalación de la PWA — el aviso automático del navegador pasa
// desapercibido para clientes de una tienda, así que se muestra uno propio.
// Android/Chrome usa el evento beforeinstallprompt real; iOS Safari no lo
// dispara, así que ahí se muestran instrucciones manuales.
export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosInstructions, setShowIosInstructions] = useState(false)
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
      setShowIosInstructions(true)
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
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 inset-x-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-3.5 flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-brand-blue-50 flex items-center justify-center">
              <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-md" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Instala la app de Tienda Marc</p>
              <p className="text-xs text-gray-500 truncate">
                {showIosInstructions
                  ? 'Toca Compartir y luego "Agregar a inicio"'
                  : 'Compra más rápido, sin abrir el navegador'}
              </p>
            </div>
            {showIosInstructions ? (
              <div className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-600">
                <Share className="h-4 w-4" />
              </div>
            ) : (
              <button onClick={handleInstall}
                className="shrink-0 flex items-center gap-1.5 rounded-full bg-brand-blue-500 hover:bg-brand-blue-600 text-white text-sm font-semibold px-3.5 py-2 transition-colors">
                <Download className="h-4 w-4" />Instalar
              </button>
            )}
            <button onClick={dismiss} aria-label="Cerrar"
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
