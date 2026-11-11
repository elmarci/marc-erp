import { useEffect, useRef } from 'react'

// Botón "atrás" del celular para paneles y ventanas (menú lateral, carrito,
// selector de oferta, etc.). Sin esto, atrás saltaba a la página anterior
// —o salía de la tienda— dejando el panel abierto encima.
//
// Al abrir se apila una entrada propia en el historial (misma URL); atrás la
// consume y cierra el panel. Si el panel se cierra de otra forma (la X, tocar
// fuera), la entrada se retira sola para que no quede un "atrás" que no hace
// nada.
let seq = 0
let pendingBack: ReturnType<typeof setTimeout> | null = null

const topOverlay = (): number | null => window.history.state?.__overlay ?? null

// Para navegar desde dentro de un panel abierto: la página nueva reemplaza
// la entrada del panel en vez de apilarse sobre ella.
// Tras recargar con un panel abierto, la marca queda en el historial pero el
// panel ya no existe: se limpia para no confundir al siguiente que abra.
if (typeof window !== 'undefined' && topOverlay() != null) {
  const { __overlay: _drop, ...rest } = window.history.state
  window.history.replaceState(rest, '')
}

export const overlayNav = () => ({ replace: topOverlay() != null })

export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = ++seq
    const state = { ...window.history.state, __overlay: id }
    if (pendingBack != null && topOverlay() != null) {
      // Otro panel acaba de cerrarse y su entrada sigue arriba (ej. de la
      // lista por voz al carrito): se reutiliza en vez de retroceder y
      // volver a apilar.
      clearTimeout(pendingBack)
      pendingBack = null
      window.history.replaceState(state, '')
    } else {
      window.history.pushState(state, '')
    }
    const onPop = () => { if (topOverlay() !== id) closeRef.current() }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (topOverlay() !== id) return
      pendingBack = setTimeout(() => {
        pendingBack = null
        if (topOverlay() === id) window.history.back()
      }, 0)
    }
  }, [open])
}
