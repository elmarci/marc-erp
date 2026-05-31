import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Search, ChevronRight, LogOut, User } from 'lucide-react'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'
import { Link } from 'react-router-dom'
import { AuthModal } from '../components/AuthModal'

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-amber-400', emoji: '⏳' },
  CONFIRMED: { label: 'Confirmado', color: 'text-blue-400', emoji: '✅' },
  PREPARING: { label: 'Preparando', color: 'text-purple-400', emoji: '👨‍🍳' },
  READY: { label: 'Listo', color: 'text-green-400', emoji: '🎉' },
  DELIVERED: { label: 'Entregado', color: 'text-green-400', emoji: '✅' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-400', emoji: '❌' },
}

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }

export function TrackOrderPage() {
  const { customer, setAuth, logout } = useAuthStore()
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [name, setName] = useState(customer?.name ?? '')
  const [step, setStep] = useState<'identify' | 'orders'>(customer ? 'orders' : 'identify')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['track-orders', customer?.phone],
    queryFn: () => storeApi.trackOrders(customer!.phone),
    enabled: !!customer,
    refetchInterval: 10000,
  })

  const orders = data?.data.data ?? []

  const handleIdentify = () => {
    if (!phone.trim() || phone.length < 9) return
    if (!name.trim()) return
    setAuth({ id: '', name: name.trim(), phone: phone.trim(), email: null }, '')
    setStep('orders')
  }

  if (step === 'identify' || !customer) {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex h-16 w-16 bg-green-500/10 border border-green-500/20 rounded-full items-center justify-center mb-4">
            <User className="h-8 w-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-black mb-2">Mis pedidos</h1>
          <p className="text-gray-900/50 text-sm">Ingresa tu teléfono y nombre para ver tus pedidos</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 space-y-4">
          <div>
            <label className="block text-sm text-gray-900/60 mb-2">Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-gray-50 border border-gray-200 focus:border-green-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-sm text-gray-900/60 mb-2">Número de WhatsApp</label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-sm text-gray-400">+51</span>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="987 654 321" type="tel"
                className="w-full bg-gray-50 border border-gray-200 focus:border-green-400 rounded-xl pl-12 pr-4 py-3 text-sm outline-none transition-colors" />
            </div>
          </div>
          <button onClick={handleIdentify}
            disabled={!name.trim() || phone.length < 9}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
            <Search className="h-4 w-4" />Ver mis pedidos
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Header with customer info */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black">Hola, {customer.name}! 👋</h1>
          <p className="text-gray-400 text-sm mt-1">{customer.phone} · {orders.length} pedido(s)</p>
        </div>
        <button onClick={() => { logout(); setStep('identify') }}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-900 text-sm transition-colors px-3 py-2 rounded-xl hover:bg-gray-50">
          <LogOut className="h-4 w-4" />Salir
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <div className="h-8 w-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Cargando pedidos...</p>
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-16 w-16 mx-auto mb-4 text-gray-900/10" />
          <p className="text-gray-400 mb-6">No tienes pedidos aún</p>
          <Link to="/" className="bg-green-500 text-black font-bold px-6 py-3 rounded-full text-sm">
            Hacer mi primer pedido
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {orders.map(order => {
          const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING
          return (
            <Link key={order.id} to={`/pedido/${order.orderNumber}`}
              className="block bg-white hover:bg-gray-100 border border-gray-100 hover:border-gray-200 rounded-2xl p-5 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black text-lg">{order.orderNumber}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${status.color}`}>{status.emoji} {status.label}</span>
                  <ChevronRight className="h-4 w-4 text-gray-900/20 group-hover:text-gray-900/50 transition-colors" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  <span>{order.items.length} producto(s)</span>
                  <span className="mx-2">·</span>
                  <span>{order.deliveryType === 'DELIVERY' ? '🚚 Delivery' : '🏪 Recojo'}</span>
                  <span className="mx-2">·</span>
                  <span>{PAYMENT_LABELS[order.paymentMethod]}</span>
                </div>
                <span className="text-green-400 font-black">S/ {Number(order.total).toFixed(2)}</span>
              </div>
              {order.paymentMethod !== 'CASH' && order.paymentStatus === 'PENDING' && (
                <div className="mt-3 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                  ⚠️ Pago pendiente de verificación — envía tu comprobante por WhatsApp
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </main>
  )
}
