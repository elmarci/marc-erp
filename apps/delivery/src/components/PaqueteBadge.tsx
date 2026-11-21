import type { PaqueteInfo } from '../types'

const TAMANO: Record<PaqueteInfo['tamano'], string> = { chico: 'chica', mediano: 'mediana', grande: 'grande' }
const TIPO: Record<PaqueteInfo['tipo'], string> = { bolsa: 'Bolsa', caja: 'Caja', bulto: 'Bulto' }

export function paqueteTexto(p: PaqueteInfo): string {
  const tam = p.tipo === 'bulto' ? p.tamano : TAMANO[p.tamano]
  return `${TIPO[p.tipo]} ${tam}, ${p.pesoKg} kg`
}

// Paquete en texto, con "Frágil" como única marca (sin colores).
export function PaqueteBadge({ paquete }: { paquete: PaqueteInfo }) {
  return (
    <span>
      {paqueteTexto(paquete)}
      {paquete.fragil && <span className="ml-1.5 rounded-md border border-line px-1.5 py-px text-xs font-semibold text-ink">Frágil</span>}
    </span>
  )
}
