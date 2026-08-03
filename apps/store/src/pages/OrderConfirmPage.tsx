import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, Package, Truck, XCircle, ChevronRight, MessageCircle } from 'lucide-react'
import { storeApi } from '../api'
import { useEffect } from 'react'
import { io } from 'socket.io-client'

const WHATSAPP_NUMBER = '51930555831'
const API_BASE = import.meta.env['VITE_API_URL']?.replace('/api/v1', '') ?? 'http://localhost:3001'

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }
const PAYMENT_EMOJIS: Record<string, string> = { YAPE: '💜', PLIN: '💚', CASH: '💵' }

const STATUS_FLOW = [
  { key: 'PENDING', icon: Clock, label: 'Recibido', desc: 'Tu pedido fue recibido y está esperando confirmación', color: 'text-amber-600', bg: 'bg-amber-400' },
  { key: 'CONFIRMED', icon: CheckCircle, label: 'Confirmado', desc: 'Tu pedido fue confirmado y lo estamos preparando', color: 'text-brand-blue-600', bg: 'bg-brand-blue-500' },
  { key: 'PREPARING', icon: Package, label: 'Preparando', desc: 'Estamos preparando tu pedido', color: 'text-purple-600', bg: 'bg-purple-400' },
  { key: 'READY', icon: CheckCircle, label: 'Listo', desc: 'Tu pedido está listo para entrega o recojo', color: 'text-brand-green-700', bg: 'bg-brand-green-500' },
  { key: 'DELIVERED', icon: Truck, label: 'Entregado', desc: '¡Tu pedido fue entregado!', color: 'text-brand-green-700', bg: 'bg-brand-green-500' },
]

export function OrderConfirmPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderNumber],
    queryFn: () => storeApi.getOrder(orderNumber!),
    enabled: !!orderNumber,
    refetchInterval: 5000, // Poll every 5 seconds
  })

  // WebSocket for real-time updates
  useEffect(() => {
    if (!orderNumber) return
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socket.on(`store:order-updated:${orderNumber}`, () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderNumber] })
    })
    return () => { socket.disconnect() }
  }, [orderNumber, queryClient])

  const order = data?.data.data

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 border-2 border-brand-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400">Cargando tu pedido...</p>
      </div>
    </div>
  )

  if (!order) return (
    <div className="text-center py-20">
      <p className="text-gray-400 mb-4">Pedido no encontrado</p>
      <Link to="/" className="text-brand-blue-600">Volver a la tienda</Link>
    </div>
  )

  const isCancelled = order.status === 'CANCELLED'
  const currentStep = isCancelled ? -1 : STATUS_FLOW.findIndex(s => s.key === order.status)
  const needsPayment = order.paymentMethod !== 'CASH' && order.paymentStatus === 'PENDING'
  const whatsappMsg = `Hola! Mi pedido es *${order.orderNumber}* — quiero enviar el comprobante de pago por ${PAYMENT_LABELS[order.paymentMethod]}.`

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        {isCancelled ? (
          <>
            <div className="inline-flex h-20 w-20 bg-red-50 border-2 border-red-400 rounded-full items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Pedido cancelado</h1>
          </>
        ) : (
          <>
            <div className="inline-flex h-20 w-20 bg-brand-green-50 border-2 border-brand-green-400 rounded-full items-center justify-center mb-4 relative">
              <CheckCircle className="h-10 w-10 text-brand-green-600" />
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-brand-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <h1 className="text-2xl font-black mb-1 text-gray-900">¡Pedido recibido!</h1>
            <p className="text-gray-500">Número de pedido</p>
            <p className="text-3xl font-black text-brand-blue-600 mt-1">{order.orderNumber}</p>
          </>
        )}
      </div>

      {/* Payment alert - only for Yape/Plin */}
      {needsPayment && !isCancelled && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-6">
          <h3 className="font-bold text-lg mb-3 text-gray-900">
            {PAYMENT_EMOJIS[order.paymentMethod]} Realiza tu pago por {PAYMENT_LABELS[order.paymentMethod]}
          </h3>
          <div className="bg-white rounded-xl p-4 mb-4 border border-purple-100">
            <p className="text-gray-500 text-sm mb-1">Monto a pagar:</p>
            <p className="text-3xl font-black text-gray-900">S/ {Number(order.total).toFixed(2)}</p>
            <p className="text-gray-500 text-sm mt-2">Enviar al número:</p>
            <p className="text-2xl font-black text-brand-blue-600">930 555 831</p>
          </div>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMsg)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#25D366] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity">
            <MessageCircle className="h-5 w-5" />
            Enviar comprobante por WhatsApp
          </a>
          <p className="text-xs text-gray-400 text-center mt-3">
            Tu pedido se confirmará cuando verifiquemos el pago
          </p>
        </div>
      )}

      {/* Status timeline */}
      {!isCancelled && (
        <div className="bg-white rounded-2xl p-5 mb-4 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Estado del pedido</h3>
            <span className="text-xs text-gray-400 animate-pulse">• actualizando</span>
          </div>
          <div className="space-y-0">
            {STATUS_FLOW.map((s, i) => {
              const isDone = i < currentStep
              const isCurrent = i === currentStep
              const StatusIcon = s.icon
              return (
                <div key={s.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                      isDone ? 'bg-brand-green-500' : isCurrent ? `${s.bg} ring-4 ring-gray-100` : 'bg-gray-100 border border-gray-200'
                    }`}>
                      {isDone ? <CheckCircle className="h-5 w-5 text-white" /> :
                       <StatusIcon className={`h-4 w-4 ${isCurrent ? 'text-white' : 'text-gray-300'}`} />}
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className={`w-0.5 h-8 transition-all ${isDone ? 'bg-brand-green-500' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <div className="pb-6 flex-1">
                    <p className={`font-semibold text-sm ${isCurrent ? s.color : isDone ? 'text-gray-900' : 'text-gray-300'}`}>
                      {s.label}
                      {isCurrent && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Actual</span>}
                    </p>
                    {isCurrent && <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order details */}
      <div className="bg-white rounded-2xl p-5 mb-4 border border-gray-200">
        <h3 className="font-bold mb-4 text-gray-900">Detalle del pedido</h3>
        <div className="space-y-2 mb-4">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-500">{item.name} <span className="text-gray-300">×{item.quantity}</span></span>
              <span className="font-medium text-gray-900">S/ {Number(item.subtotal).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span><span>S/ {Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-black text-base text-gray-900">
            <span>TOTAL</span>
            <span className="text-brand-green-700">S/ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t border-gray-100 mt-3 pt-3 space-y-1.5 text-sm text-gray-500">
          <p>👤 {order.customerName} · {order.customerPhone}</p>
          <p>{order.deliveryType === 'DELIVERY' ? `🚚 Delivery${order.address ? ` — ${order.address}, ${order.district}` : ''}` : '🏪 Recojo en tienda — Av. Manchay, Pachacamac'}</p>
          <p>{PAYMENT_EMOJIS[order.paymentMethod]} {PAYMENT_LABELS[order.paymentMethod]} — {order.paymentStatus === 'VERIFIED' ? '✅ Pago verificado' : order.paymentMethod === 'CASH' ? 'Al recibir' : '⏳ Pendiente de verificación'}</p>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-2xl p-5 mb-6 border border-gray-200 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm text-gray-900">¿Necesitas ayuda?</p>
          <p className="text-xs text-gray-400 mt-0.5">Escríbenos por WhatsApp</p>
        </div>
        <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 text-[#1a9c4d] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#25D366]/20 transition-colors">
          <MessageCircle className="h-4 w-4" />WhatsApp
        </a>
      </div>

      <div className="flex gap-3">
        <Link to="/" className="flex-1 text-center bg-white hover:bg-gray-50 border border-gray-200 font-medium py-3.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 text-gray-700">
          Seguir comprando
        </Link>
        <Link to="/mis-pedidos" className="flex-1 text-center bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
          Ver mis pedidos <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  )
}
