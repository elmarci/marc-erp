import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bike, ChevronRight, Clock, Package, PackageCheck, CheckCircle2 } from 'lucide-react'
import { storeApi, type TrackingStage } from '../api'

// Último pedido hecho desde este celular — lo guarda el checkout. Sirve para
// mostrar "tu pedido va en camino" en el inicio sin pedir cuenta.
export const ACTIVE_ORDER_KEY = 'marc-active-order'

export function rememberActiveOrder(orderNumber: string) {
  try { localStorage.setItem(ACTIVE_ORDER_KEY, orderNumber) } catch { /* sin almacenamiento */ }
}
function readActiveOrder() {
  try { return localStorage.getItem(ACTIVE_ORDER_KEY) } catch { return null }
}
function forgetActiveOrder() {
  try { localStorage.removeItem(ACTIVE_ORDER_KEY) } catch { /* sin almacenamiento */ }
}

const LABEL: Partial<Record<TrackingStage, { text: string; Icon: typeof Bike }>> = {
  RECIBIDO: { text: 'Recibido, por confirmar', Icon: Clock },
  CONFIRMADO: { text: 'Confirmado', Icon: CheckCircle2 },
  PREPARANDO: { text: 'Lo estamos preparando', Icon: Package },
  LISTO: { text: 'Listo para salir', Icon: PackageCheck },
  EN_CAMINO: { text: 'En camino', Icon: Bike },
}

export function ActiveOrderBanner({ className = '' }: { className?: string }) {
  const orderNumber = readActiveOrder()
  const { data } = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: () => storeApi.getOrder(orderNumber!),
    enabled: !!orderNumber,
    refetchInterval: 30000,
    retry: false,
  })
  const order = data?.data.data
  const t = order?.tracking
  if (!order || !t) return null
  // Entregado o cancelado: el aviso ya no tiene sentido.
  if (t.stage === 'ENTREGADO' || t.stage === 'CANCELADO') { forgetActiveOrder(); return null }
  const meta = LABEL[t.stage]
  if (!meta) return null
  const isPickup = order.deliveryType !== 'DELIVERY'
  const detail = t.stage === 'EN_CAMINO' && t.etaMinutes != null
    ? `Llega en ~${t.etaMinutes} min`
    : isPickup && t.stage === 'LISTO' ? 'Ya puedes recogerlo' : 'Toca para ver el seguimiento'

  return (
    <section className={className} aria-label="Tu pedido en curso">
      <Link to={`/pedido/${order.orderNumber}`}
        className="bg-brand-blue-600 text-white rounded-2xl px-3.5 py-3 flex items-center gap-3 shadow-float">
        <span className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <meta.Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug truncate">Tu pedido · {meta.text}</span>
          <span className="block text-[13px] text-brand-blue-100 leading-snug truncate">{order.orderNumber} · {detail}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </Link>
    </section>
  )
}
