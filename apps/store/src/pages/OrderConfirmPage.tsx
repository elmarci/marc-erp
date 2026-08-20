import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, Package, Truck, XCircle, ChevronRight, MessageCircle } from 'lucide-react'
import { storeApi } from '../api'
import { useEffect } from 'react'
import { io } from 'socket.io-client'

const WHATSAPP_NUMBER = '51930555831'
const API_BASE = import.meta.env['VITE_API_URL']?.replace('/api/v1', '') ?? 'http://localhost:3001'

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }
const PAYMENT_ICONS: Record<string, string> = { YAPE: '/yape.png', PLIN: '/plin.png', CASH: '/cash.png' }

const STATUS_FLOW = [
  { key: 'PENDING', icon: Clock, label: 'Recibido', desc: 'Tu pedido fue recibido y está esperando confirmación' },
  { key: 'CONFIRMED', icon: CheckCircle, label: 'Confirmado', desc: 'Tu pedido fue confirmado y lo estamos preparando' },
  { key: 'PREPARING', icon: Package, label: 'Preparando', desc: 'Estamos preparando tu pedido' },
  { key: 'READY', icon: CheckCircle, label: 'Listo', desc: 'Tu pedido está listo para entrega o recojo' },
  { key: 'DELIVERED', icon: Truck, label: 'Entregado', desc: '¡Tu pedido fue entregado!' },
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
        <div className="h-10 w-10 border-2 border-brand-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-paper-ink-ghost">Cargando tu pedido...</p>
      </div>
    </div>
  )

  if (!order) return (
    <div className="text-center py-20">
      <p className="text-paper-ink-ghost mb-4">Pedido no encontrado</p>
      <Link to="/" className="text-brand-green-600">Volver a la tienda</Link>
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
            <div className="inline-flex h-20 w-20 bg-brand-magenta-50 border-2 border-brand-magenta-400 rounded-full items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-brand-magenta-600" />
            </div>
            <h1 className="text-2xl font-black text-paper-ink">Pedido cancelado</h1>
          </>
        ) : (
          <>
            <div className="inline-flex h-20 w-20 bg-white border-2 border-brand-green-600 rounded-full items-center justify-center mb-4 relative animate-stamp-in">
              <CheckCircle className="h-10 w-10 text-brand-green-600" />
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-brand-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <h1 className="text-2xl font-black mb-1 text-paper-ink">¡Pedido recibido!</h1>
            <p className="text-paper-ink-soft">Número de pedido</p>
            <p className="text-3xl font-black text-brand-green-700 mt-1">{order.orderNumber}</p>
          </>
        )}
      </div>

      {/* Payment alert - only for Yape/Plin */}
      {needsPayment && !isCancelled && (
        <div className="bg-white border border-paper-line rounded-2xl shadow-sm p-5 mb-6">
          <h3 className="font-bold text-lg mb-3 text-paper-ink flex items-center gap-2">
            <img src={PAYMENT_ICONS[order.paymentMethod]} alt="" className="h-7 w-7 rounded-lg object-contain" />
            Realiza tu pago por {PAYMENT_LABELS[order.paymentMethod]}
          </h3>
          {order.paymentMethod === 'YAPE' ? (
            <div className="bg-paper-surface rounded-xl p-4 mb-4 border border-paper-line flex flex-col items-center text-center gap-2">
              <img src="/yape-qr.png" alt="QR de Yape para pagar" className="w-40 rounded-xl border border-paper-line" />
              <p className="text-paper-ink-soft text-sm">Monto a pagar:</p>
              <p className="text-3xl font-black text-paper-ink">S/ {Number(order.total).toFixed(2)}</p>
            </div>
          ) : (
            <div className="bg-paper-surface rounded-xl p-4 mb-4 border border-paper-line">
              <p className="text-paper-ink-soft text-sm mb-1">Monto a pagar:</p>
              <p className="text-3xl font-black text-paper-ink">S/ {Number(order.total).toFixed(2)}</p>
              <p className="text-paper-ink-soft text-sm mt-2">Enviar al número:</p>
              <p className="text-2xl font-black text-brand-blue-700">930 555 831</p>
            </div>
          )}
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMsg)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#25D366] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity">
            <MessageCircle className="h-5 w-5" />
            Enviar comprobante por WhatsApp
          </a>
          <p className="text-xs text-paper-ink-ghost text-center mt-3">
            Tu pedido se confirmará cuando verifiquemos el pago
          </p>
        </div>
      )}

      {/* Status timeline */}
      {!isCancelled && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 border border-paper-line">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-paper-ink">Estado del pedido</h3>
            <span className="text-xs text-paper-ink-ghost animate-pulse">• actualizando</span>
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
                      isDone ? 'bg-brand-green-500' : isCurrent ? 'bg-brand-green-600 ring-4 ring-brand-green-100' : 'bg-paper-surface border border-paper-line'
                    }`}>
                      {isDone ? <CheckCircle className="h-5 w-5 text-white" /> :
                       <StatusIcon className={`h-4 w-4 ${isCurrent ? 'text-white' : 'text-paper-ink-ghost'}`} />}
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className={`w-0.5 h-8 transition-all ${isDone ? 'bg-brand-green-500' : 'bg-paper-line'}`} />
                    )}
                  </div>
                  <div className="pb-6 flex-1">
                    <p className={`font-semibold text-sm ${isCurrent ? 'text-brand-green-700' : isDone ? 'text-paper-ink' : 'text-paper-ink-ghost'}`}>
                      {s.label}
                      {isCurrent && <span className="ml-2 text-xs bg-paper-surface text-paper-ink-soft px-2 py-0.5 rounded-full">Actual</span>}
                    </p>
                    {isCurrent && <p className="text-xs text-paper-ink-ghost mt-0.5">{s.desc}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order details - estilo ticket */}
      <div className="bg-white rounded-2xl shadow-sm mb-4 border border-paper-line overflow-hidden">
        <div className="h-2 shrink-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(32,30,29,.18) 1.5px, transparent 1.5px)', backgroundSize: '10px 10px', backgroundPosition: 'center' }} />
        <div className="p-5">
        <h3 className="font-bold mb-4 text-paper-ink">Detalle del pedido</h3>
        <div className="space-y-0 mb-4">
          {order.items.map((item, idx) => (
            <div key={item.id} className={`flex justify-between text-sm py-2 ${idx > 0 ? 'border-t border-dashed border-paper-line' : ''}`}>
              <span className="text-paper-ink-soft">{item.name} <span className="text-paper-ink-ghost">×{item.quantity}</span></span>
              <span className="font-medium text-paper-ink">S/ {Number(item.subtotal).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-paper-line pt-3 space-y-2 text-sm">
          <div className="flex justify-between text-paper-ink-soft">
            <span>Subtotal</span><span>S/ {Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-black text-base text-paper-ink">
            <span>TOTAL</span>
            <span className="text-brand-green-700">S/ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-paper-line mt-3 pt-3 space-y-1.5 text-sm text-paper-ink-soft">
          <p>👤 {order.customerName} · {order.customerPhone}</p>
          <p>{order.deliveryType === 'DELIVERY' ? `🚚 Delivery${order.address ? ` — ${order.address}, ${order.district}` : ''}` : '🏪 Recojo en tienda — Av. Manchay, Pachacamac'}</p>
          <p className="flex items-center gap-1.5">
            <img src={PAYMENT_ICONS[order.paymentMethod]} alt="" className="h-4 w-4 rounded object-contain" />
            {PAYMENT_LABELS[order.paymentMethod]} — {order.paymentStatus === 'VERIFIED' ? '✅ Pago verificado' : order.paymentMethod === 'CASH' ? 'Al recibir' : '⏳ Pendiente de verificación'}
          </p>
        </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-6 border border-paper-line flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm text-paper-ink">¿Necesitas ayuda?</p>
          <p className="text-xs text-paper-ink-ghost mt-0.5">Escríbenos por WhatsApp</p>
        </div>
        <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/30 text-[#1a9c4d] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#25D366]/20 transition-colors">
          <MessageCircle className="h-4 w-4" />WhatsApp
        </a>
      </div>

      <div className="flex gap-3">
        <Link to="/" className="flex-1 text-center bg-white hover:bg-paper-surface border border-paper-line font-medium py-3.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 text-paper-ink-soft">
          Seguir comprando
        </Link>
        <Link to="/mis-pedidos" className="flex-1 text-center bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-3.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
          Ver mis pedidos <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  )
}
