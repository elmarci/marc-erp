import { useEffect, useState } from 'react'

// Sonidos del pedido (2026-11-25, pedido del dueño): uno al confirmar el
// pedido y otro cada vez que avanza de etapa. Se generan con Web Audio (sin
// archivos) y vibran en el celular. Encendidos por defecto; el cliente los
// apaga con el interruptor del seguimiento o del menú.
const KEY = 'marc-sounds'
const HEARD = 'marc-stage-heard:'
const EVENT = 'marc-sounds-change'

export function soundsEnabled() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

export function setSoundsEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENT))
  if (on) playSound('stage')
}

export function useSoundsEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(soundsEnabled)
  useEffect(() => {
    const sync = () => setOn(soundsEnabled())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return [on, setSoundsEnabled]
}

let ctx: AudioContext | null = null
function audio() {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  return ctx
}

// Los navegadores solo dejan sonar audio después de un toque: se "despierta"
// el contexto en el primer toque de la persona, así luego suena aunque el
// cambio de etapa llegue solo (sin tocar nada).
export function unlockSoundsOnFirstTouch() {
  const unlock = () => {
    const a = audio()
    if (a && a.state === 'suspended') a.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

type Kind = 'confirm' | 'stage' | 'delivered'
const NOTES: Record<Kind, number[]> = {
  confirm: [659.25, 783.99, 1046.5],   // mi–sol–do, alegre y corto
  stage: [783.99, 1046.5],             // dos notas
  delivered: [523.25, 659.25, 783.99, 1046.5],
}

export function playSound(kind: Kind) {
  if (!soundsEnabled()) return
  try { navigator.vibrate?.(kind === 'stage' ? 80 : [60, 60, 120]) } catch { /* sin vibración */ }
  const a = audio()
  if (!a) return
  if (a.state === 'suspended') a.resume().catch(() => {})
  const t0 = a.currentTime + 0.02
  NOTES[kind].forEach((freq, i) => {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = t0 + i * 0.12
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
    osc.connect(gain).connect(a.destination)
    osc.start(start)
    osc.stop(start + 0.4)
  })
}

// Suena cuando el pedido cambia de etapa. La última etapa "oída" se guarda
// por pedido, así no se repite al cambiar de pantalla ni al recargar.
export function useStageSound(orderNumber: string | undefined, stage: string | undefined) {
  useEffect(() => {
    if (!orderNumber || !stage) return
    const key = HEARD + orderNumber
    let prev: string | null = null
    try { prev = localStorage.getItem(key); localStorage.setItem(key, stage) } catch { /* modo privado */ }
    if (prev && prev !== stage && stage !== 'CANCELADO') playSound(stage === 'ENTREGADO' ? 'delivered' : 'stage')
  }, [orderNumber, stage])
}
