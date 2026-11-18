import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary'
}

// Azul del logo para la acción principal de cada pantalla (texto blanco 6.4:1).
export function PrimaryButton({ children, className, disabled, variant = 'primary', ...props }: PrimaryButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'flex h-[52px] items-center justify-center gap-2 rounded-[14px] text-base font-semibold transition-colors',
        variant === 'primary'
          ? disabled ? 'bg-line text-ink-faint' : 'bg-blue text-white active:bg-blue-press'
          : 'border border-line bg-card text-ink active:bg-bg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
