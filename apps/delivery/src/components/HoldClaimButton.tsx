import { useRef } from 'react'
import { toast } from 'sonner'
import { useHoldToConfirm } from '../hooks/useHoldToConfirm'
import { cn, withDefaults } from '../lib/cn'

interface HoldClaimButtonProps {
  onConfirm: () => void
  disabled?: boolean
  label?: string
  className?: string
}

// Tomar un pedido = mantener presionado ~0.65 s (un bache o un guante no lo
// captura sin querer). Un toque corto explica cómo hacerlo.
export function HoldClaimButton({ onConfirm, disabled, label = 'Tomar', className }: HoldClaimButtonProps) {
  const { holding, duration, handlers } = useHoldToConfirm(onConfirm)
  const pressedAt = useRef(0)

  return (
    <div
      {...(disabled ? {} : {
        ...handlers,
        onPointerDown: (e: React.PointerEvent) => { pressedAt.current = Date.now(); handlers.onPointerDown(e) },
        onPointerUp: () => {
          handlers.onPointerUp()
          if (pressedAt.current && Date.now() - pressedAt.current < 300) toast('Mantén presionado para tomar el pedido', { id: 'hold-hint', duration: 2000 })
          pressedAt.current = 0
        },
      })}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${label}: mantén presionado`}
      className={withDefaults(cn(
        'relative flex h-[42px] select-none items-center justify-center overflow-hidden rounded-xl px-5 text-[15px] font-semibold',
        disabled ? 'bg-line text-ink-faint' : 'bg-blue text-white',
      ), className)}
      style={{ touchAction: 'none' }}
    >
      {!disabled && (
        <div
          className="absolute inset-0 origin-left bg-night/40"
          style={{ transform: holding ? 'scaleX(1)' : 'scaleX(0)', transition: holding ? `transform ${duration}ms linear` : 'none' }}
        />
      )}
      <span className="relative">{holding ? 'Sostén…' : label}</span>
    </div>
  )
}
