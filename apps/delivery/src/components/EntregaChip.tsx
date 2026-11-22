import { CalendarClock, Zap } from 'lucide-react'
import type { DeliveryOrder, EntregaProgramada } from '../types'

// Día relativo a hoy en Lima: "Hoy", "Mañana" o "sáb 22 nov".
function diaRelativo(p: EntregaProgramada): string {
  if (!p.cuando) return p.dia ?? ''
  const lima = (d: Date) => new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10)
  const hoy = lima(new Date())
  const manana = lima(new Date(Date.now() + 86400000))
  const dia = lima(new Date(p.cuando))
  return dia === hoy ? 'Hoy' : dia === manana ? 'Mañana' : (p.dia ?? '')
}

// Cuándo entregar, en una línea que se lee de un vistazo.
export function EntregaChip({ p }: { p: EntregaProgramada }) {
  if (p.express) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-blue">
        <Zap size={14} strokeWidth={2.4} /> Express · lo antes posible
      </div>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink">
      <CalendarClock size={14} strokeWidth={2.2} className="text-ink-soft" />
      Entregar {diaRelativo(p).toLowerCase() === 'hoy' ? 'hoy' : diaRelativo(p)} a las {p.hora}
    </div>
  )
}

// Encabezado para juntar pedidos del mismo día y turno al ordenar por hora.
export function grupoEntrega(o: DeliveryOrder): string {
  const p = o.programado
  if (!p) return 'Sin hora elegida'
  if (p.express) return 'Express'
  return `${diaRelativo(p)} · ${p.turno ?? ''}`.trim()
}
