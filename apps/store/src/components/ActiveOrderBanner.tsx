import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { storeApi, type TrackingStage } from '../api'

// Último pedido hecho desde este celular — lo guarda el checkout. Sirve para
// mostrar "tu pedido va en camino" en el inicio sin pedir cuenta.
export const ACTIVE_ORDER_KEY = 'marc-active-order'

// Se guarda "número|clave"; versiones viejas guardaban solo el número.
export function rememberActiveOrder(orderNumber: string, accessKey?: string) {
  try { localStorage.setItem(ACTIVE_ORDER_KEY, accessKey ? `${orderNumber}|${accessKey}` : orderNumber) } catch { /* sin almacenamiento */ }
}
function readActiveOrder(): { n: string; k: string | null } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_ORDER_KEY)
    if (!raw) return null
    const [n, k] = raw.split('|')
    return { n, k: k || null }
  } catch { return null }
}
/** Enlace al seguimiento, con la clave si la hay. */
export function orderLink(orderNumber: string, accessKey?: string | null) {
  return `/pedido/${orderNumber}${accessKey ? `?k=${encodeURIComponent(accessKey)}` : ''}`
}
function forgetActiveOrder() {
  try { localStorage.removeItem(ACTIVE_ORDER_KEY) } catch { /* sin almacenamiento */ }
}

const LABEL: Partial<Record<TrackingStage, { text: string; img: string }>> = {
  RECIBIDO: { text: 'Recibido, por confirmar', img: '/icons/seg-recibido.svg' },
  CONFIRMADO: { text: 'Confirmado', img: '/icons/seg-confirmado.svg' },
  PREPARANDO: { text: 'Lo estamos preparando', img: '/icons/seg-preparando.svg' },
  LISTO: { text: 'Listo para salir', img: '/icons/seg-listo.svg' },
  EN_CAMINO: { text: 'En camino', img: '/icons/seg-moto.svg' },
}

export function ActiveOrderBanner({ className = '' }: { className?: string }) {
  const saved = readActiveOrder()
  const { data } = useQuery({
    queryKey: ['order', saved?.n, saved?.k],
    queryFn: () => storeApi.getOrder(saved!.n, saved!.k),
    enabled: !!saved,
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
      <Link to={orderLink(order.orderNumber, saved?.k)}
        className="bg-brand-blue-600 text-white rounded-2xl px-3.5 py-3 flex items-center gap-3 shadow-float">
        <span className="h-11 w-11 rounded-xl bg-white flex items-center justify-center shrink-0">
          <img src={meta.img} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
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
