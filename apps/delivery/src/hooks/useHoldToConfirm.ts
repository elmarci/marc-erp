import { useCallback, useEffect, useRef, useState } from 'react'

// Reemplaza el tap directo (y el tap+ConfirmSheet antes de eso) para tomar
// un pedido: mantener presionado ~650ms en vez de un solo toque, para que
// un guante o un bache no capture un pedido sin querer.
//
// El disparo usa setTimeout, no requestAnimationFrame — rAF solo debe
// mover cosas en pantalla cuadro a cuadro, nunca decidir si una acción de
// negocio ocurre: en una pestaña que el navegador no está pintando
// activamente (fondo, algunos modos de ahorro de energía) rAF puede dejar
// de dispararse por completo y la captura nunca se confirmaría aunque el
// dedo siguiera presionado. setTimeout corre igual, esté la pestaña
// pintando o no. El llenado visual de la barra es CSS puro (ver
// HoldClaimButton), no depende de este cálculo.
export function useHoldToConfirm(onConfirm: () => void, duration = 650) {
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setHolding(false)
  }, [])

  const start = useCallback(() => {
    setHolding(true)
    timerRef.current = setTimeout(() => {
      setHolding(false)
      onConfirm()
    }, duration)
  }, [duration, onConfirm])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return {
    holding,
    duration,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation()
        start()
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
  }
}
