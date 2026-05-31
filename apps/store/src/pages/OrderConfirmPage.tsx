import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Package, MapPin, Phone, Clock } from 'lucide-react'
import { storeApi } from '../api'

const WHATSAPP_NUMBER = '51930555831'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de confirmación',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando pedido',
  READY: 'Listo para entrega/recojo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
}

const PAYMENT_LABELS: Record<string, string> = {
  YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo',
}

export function OrderConfirmPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: () => storeApi.getOrder(orderNumber!),
    enabled: !!orderNumber,
    refetchInterval: 30000,
  })

  const order = data?.data.data

  if (isLoading) return <div className="text-center py-20 text-white/40">Cargando...</div>
  if (!order) return <div className="text-center py-20 text-white/40">Pedido no encontrado</div>

  const needsPaymentProof = order.paymentMethod !== 'CASH' && order.paymentStatus === 'PENDING'
  const whatsappMsg = `Hola! Hice el pedido *${order.orderNumber}* y quiero enviar mi comprobante de pago por ${PAYMENT_LABELS[order.paymentMethod]}.`

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Success */}
      <div className="text-center mb-10">
        <div className="inline-flex h-20 w-20 bg-green-500/10 border-2 border-green-500 rounded-full items-center justify-center mb-4">
          <CheckCircle className="h-10 w-10 text-green-400" />
        </div>
        <h1 className="text-2xl font-black mb-2">¡Pedido recibido!</h1>
        <p className="text-white/50">Tu número de pedido es</p>
        <p className="text-3xl font-black text-green-400 mt-1">{order.orderNumber}</p>
      </div>

      {/* Status */}
      <div className="bg-zinc-900 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="h-5 w-5 text-green-400" />
          <h2 className="font-bold">Estado del pedido</h2>
        </div>
        <span className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium px-3 py-1.5 rounded-full">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
        <p className="text-xs text-white/30 mt-2">Esta página se actualiza automáticamente</p>
      </div>

      {/* Payment instructions */}
      {needsPaymentProof && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-5 mb-4">
          <h3 className="font-bold mb-2">💳 Realiza tu pago por {PAYMENT_LABELS[order.paymentMethod]}</h3>
          <p className="text-sm text-white/60 mb-4">
            Envía <span className="text-white font-bold">S/ {Number(order.total).toFixed(2)}</span> al número:
            <span className="block text-2xl font-black text-white mt-1">930 555 831</span>
          </p>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMsg)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-3 rounded-xl text-sm transition-opacity hover:opacity-90">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar comprobante por WhatsApp
          </a>
        </div>
      )}

      {/* Order details */}
      <div className="bg-zinc-900 rounded-2xl p-5 mb-4">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-green-400" />Productos</h3>
        <div className="space-y-2">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-white/70">{item.name} ×{item.quantity}</span>
              <span className="font-medium">S/ {Number(item.subtotal).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 mt-4 pt-3 flex justify-between font-bold">
          <span>Total</span>
          <span className="text-green-400">S/ {Number(order.total).toFixed(2)}</span>
        </div>
      </div>

      {/* Delivery info */}
      <div className="bg-zinc-900 rounded-2xl p-5 mb-6">
        <h3 className="font-bold mb-3 flex items-center gap-2"><MapPin className="h-5 w-5 text-green-400" />Entrega</h3>
        <div className="text-sm text-white/60 space-y-1">
          <p><span className="text-white">Tipo:</span> {order.deliveryType === 'DELIVERY' ? '🚚 Delivery' : '🏪 Recojo en tienda'}</p>
          {order.address && <p><span className="text-white">Dirección:</span> {order.address}, {order.district}</p>}
          <p><span className="text-white">Pago:</span> {PAYMENT_LABELS[order.paymentMethod]}</p>
          <p><span className="text-white">Cliente:</span> {order.customerName} · {order.customerPhone}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/catalogo" className="flex-1 text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-xl transition-colors text-sm">
          Seguir comprando
        </Link>
        <Link to="/mis-pedidos" className="flex-1 text-center bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl transition-colors text-sm">
          Ver mis pedidos
        </Link>
      </div>
    </main>
  )
}
