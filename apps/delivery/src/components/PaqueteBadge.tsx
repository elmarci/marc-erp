import { AlertTriangle, Package } from 'lucide-react'
import type { PaqueteInfo } from '../types'
import { cn } from '../lib/cn'

const TAMANO_LABEL: Record<PaqueteInfo['tamano'], string> = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' }
const TIPO_LABEL: Record<PaqueteInfo['tipo'], string> = { bolsa: 'Bolsa', caja: 'Caja', bulto: 'Bulto' }

// Para que el biker planifique el espacio de la mochila antes de aceptar —
// no todos los pedidos caben igual, y hoy no había ninguna pista de esto.
export function PaqueteBadge({ paquete, compact }: { paquete: PaqueteInfo; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className={cn('flex items-center gap-1.5 rounded-lg bg-paper-raised px-3 py-1.5', compact && 'px-2.5 py-1')}>
        <Package size={compact ? 12 : 13} className="text-paper-ink-soft" />
        <span className={cn('font-bold uppercase text-paper-ink-soft', compact ? 'text-[11px]' : 'text-xs')}>
          {TAMANO_LABEL[paquete.tamano]} · {TIPO_LABEL[paquete.tipo]} · {paquete.pesoKg} kg
        </span>
      </div>
      {paquete.fragil && (
        <div className={cn('flex items-center gap-1 rounded-lg bg-brand-magenta-900/40 px-2.5 py-1', compact && 'px-2 py-0.5')}>
          <AlertTriangle size={compact ? 11 : 12} className="text-brand-magenta-400" />
          <span className={cn('font-extrabold text-brand-magenta-400', compact ? 'text-[10px]' : 'text-[11px]')}>FRÁGIL</span>
        </div>
      )}
    </div>
  )
}
