import { Delete } from 'lucide-react'
import { cn } from '../lib/cn'

// Casillas de PIN/código + teclado numérico grande (se usa con guantes).
export function PinBoxes({ value, length, error, reveal }: { value: string; length: number; error?: boolean; reveal?: boolean }) {
  return (
    <div className="flex gap-2" role="status" aria-live="polite" aria-label={`${value.length} de ${length} dígitos`}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex h-12 flex-1 items-center justify-center rounded-xl border-[1.5px] bg-card',
            error ? 'border-bad' : i === value.length ? 'border-blue' : 'border-line',
          )}
        >
          {i < value.length && (reveal
            ? <span className="num text-2xl font-semibold">{value[i]}</span>
            : <span className={cn('h-2.5 w-2.5 rounded-full', error ? 'bg-bad' : 'bg-ink')} />)}
        </div>
      ))}
    </div>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export function KeyPad({ onKey, disabled }: { onKey: (k: string) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k, i) => k === '' ? <div key={i} /> : (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onKey(k)}
          aria-label={k === 'del' ? 'Borrar' : `Dígito ${k}`}
          className={cn('flex h-[54px] items-center justify-center rounded-[14px] active:bg-line', k === 'del' ? 'text-ink-soft' : 'num bg-card text-2xl font-medium shadow-card')}
        >
          {k === 'del' ? <Delete size={22} /> : k}
        </button>
      ))}
    </div>
  )
}
