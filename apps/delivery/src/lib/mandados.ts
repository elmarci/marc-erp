import { FileText, Package, Pill, ShoppingBasket, UtensilsCrossed, Wine } from 'lucide-react'
import type { CategoriaMandado, EstadoMandado, Mandado } from '../types'

export const CATEGORIA: Record<CategoriaMandado, { label: string; icon: typeof Pill }> = {
  COMIDA: { label: 'Comida', icon: UtensilsCrossed },
  MEDICAMENTOS: { label: 'Farmacia', icon: Pill },
  ABARROTES: { label: 'Abarrotes', icon: ShoppingBasket },
  LICORES: { label: 'Licores', icon: Wine },
  DOCUMENTOS: { label: 'Recojo', icon: FileText },
  OTROS: { label: 'Otro', icon: Package },
}

export const ESTADO_RIDER: Record<EstadoMandado, string> = {
  ABIERTO: 'Disponible',
  ACORDADO: 'Ve a comprar',
  COTIZADO: 'Esperando al cliente',
  COMPRA_APROBADA: 'Paga y toma foto',
  COMPRADO: 'Listo para salir',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}

// Lo que el repartidor pone de su bolsillo: lo real si ya cotizó, si no lo
// estimado por el cliente (o el tope si no estimó nada).
export function adelanto(m: Mandado): { monto: number | null; texto: string } {
  if (!m.conCompra) return { monto: 0, texto: 'Sin compra, solo recojo' }
  if (m.totalCompra != null) return { monto: m.totalCompra, texto: 'Compra real' }
  if (m.totalEstimado > 0) return { monto: m.totalEstimado, texto: m.totalEstimadoCompleto ? 'Adelantas aprox.' : 'Adelantas desde' }
  if (m.presupuestoMax != null) return { monto: m.presupuestoMax, texto: 'Hasta' }
  return { monto: null, texto: 'Precio por confirmar' }
}
