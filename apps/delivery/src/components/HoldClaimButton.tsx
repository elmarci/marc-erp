import { useHoldToConfirm } from '../hooks/useHoldToConfirm'
import { cn } from '../lib/cn'

interface HoldClaimButtonProps {
  onConfirm: () => void
  disabled?: boolean
  label?: string
  className?: string
}

export function HoldClaimButton({ onConfirm, disabled, label = 'TOMAR', className }: HoldClaimButtonProps) {
  const { holding, duration, handlers } = useHoldToConfirm(onConfirm)

  return (
    <div
      {...(disabled ? {} : handlers)}
      role="button"
      aria-disabled={disabled}
      className={cn(
        'font-display relative select-none overflow-hidden rounded-xl px-5 py-3.5 text-[14px] font-extrabold text-white transition-transform active:scale-[0.97]',
        disabled ? 'bg-paper-line text-paper-ink-faint' : 'bg-brand-green-700',
        className,
      )}
      style={{ touchAction: 'none' }}
    >
      {!disabled && (
        // Barra de progreso en CSS puro (transition, no JS por cuadro) — el
        // disparo real vive en useHoldToConfirm vía setTimeout, esto es solo
        // la señal visual de que se está sosteniendo.
        <div
          className="absolute inset-0 origin-left bg-white/25"
          style={{
            transform: holding ? 'scaleX(1)' : 'scaleX(0)',
            transition: holding ? `transform ${duration}ms linear` : 'none',
          }}
        />
      )}
      <span className="relative">{disabled ? label : holding ? 'SOSTÉN…' : `MANTÉN · ${label}`}</span>
    </div>
  )
}
