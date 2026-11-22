import type { ReactNode } from 'react'
import { CalendarClock, Zap } from 'lucide-react'
import { cn } from '../lib/cn'
import type { Urgencia } from '../lib/formato'

// Tarjeta única para cualquier viaje (pedido de tienda o mandado): la misma
// forma en toda la app para leerla de un vistazo con el celular en el
// soporte de la moto. Arriba cuándo, al medio cuánto ganas y a dónde, abajo
// la acción. Todo lo demás vive en el detalle.

export function EntregaChip({ texto, urgencia }: { texto: string; urgencia: Urgencia }) {
  const Icon = urgencia === 'ya' ? Zap : CalendarClock
  return (
    <span className={cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold',
      urgencia === 'ya' ? 'bg-ink text-white' : urgencia === 'pronto' ? 'bg-warn-soft text-warn' : 'bg-blue-soft text-blue',
    )}>
      <Icon size={14} strokeWidth={2.2} />{texto}
    </span>
  )
}

interface TripCardProps {
  chip: ReactNode
  meta?: ReactNode // "#123 · hace 3 min"
  tag?: ReactNode // etiqueta pequeña a la izquierda del monto (Nuevo, Comida…)
  monto: number
  montoLabel?: string
  destino: string
  distancia?: string
  pie?: ReactNode // cobro / adelanto
  accion?: ReactNode
  onOpen?: () => void
  resaltado?: boolean
  className?: string
}

export function TripCard({ chip, meta, tag, monto, montoLabel = 'Ganas', destino, distancia, pie, accion, onOpen, resaltado, className }: TripCardProps) {
  return (
    <article className={cn('animate-enter-up overflow-hidden rounded-[22px] bg-card shadow-card', resaltado && 'ring-2 ring-blue', className)}>
      <button type="button" onClick={onOpen} className="block w-full px-4 pb-3 pt-3.5 text-left active:bg-bg">
        <div className="flex items-center justify-between gap-2">
          {chip}
          {meta && <span className="truncate text-[13px] text-ink-faint">{meta}</span>}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[13px] text-ink-soft">{tag}{tag && <span aria-hidden>·</span>}{montoLabel}</div>
            <div className="num text-[34px] font-semibold leading-none tracking-tight">S/ {monto.toFixed(2)}</div>
          </div>
          {distancia && <div className="num pb-0.5 text-right text-[17px] font-semibold text-ink-soft">{distancia}</div>}
        </div>
        <p className="num mt-2.5 line-clamp-2 text-[19px] font-semibold leading-snug">{destino}</p>
      </button>
      {(pie || accion) && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <div className="min-w-0 text-[14px] leading-snug text-ink-soft">{pie}</div>
          {accion}
        </div>
      )}
    </article>
  )
}
