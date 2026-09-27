import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

// Fix P1 (crítica de diseño): el verde de marca (#4ca324) mide ~3.2:1 de
// contraste con texto blanco — por debajo del 4.5:1 mínimo de accesibilidad,
// justo en el botón principal de cada pantalla. brand-green-700 (#2f6c12)
// mide ~6.4:1 y sigue siendo inequívocamente "el verde de Marc" (mismo tono,
// un paso más oscuro en la escala oficial) — usar SIEMPRE este botón para
// cualquier acción primaria con texto encima, nunca bg-brand-green-500
// directo con texto blanco.
export function PrimaryButton({ children, className, disabled, ...props }: PrimaryButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'flex h-[60px] items-center justify-center gap-2 rounded-2xl text-lg font-extrabold transition-transform active:scale-[0.97]',
        disabled ? 'bg-paper-surface text-paper-ink-soft' : 'bg-brand-green-700 text-white',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
