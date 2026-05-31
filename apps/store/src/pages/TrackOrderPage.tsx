import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Search, Clock } from 'lucide-react'
import { storeApi } from '../api'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'text-amber-400' },
  CONFIRMED: { label: 'Confirmado', color: 'text-blue-400' },
  PREPARING: { label: 'Preparando', color: 'text-purple-400' },
  READY: { label: 'Listo', color: 'text-green-400' },
  DELIVERED: { label: 'Entregado', color: 'text-green-400' },
  CANCELLED: { label: 'Cancelado', color: 'text-red-400' },
}

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }

export function TrackOrderPage() {
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['track-orders', submitted],
    queryFn: () => storeApi.trackOrders(submitted),
    enabled: !!submitted,
  })

  const orders = data?.data.data ?? []

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <Package className="h-12 w-12 mx-auto mb-4 text-green-400" />
        <h1 className="text-2xl font-black mb-2">Mis pedidos</h1>
        <p className="text-white/50">Ingresa tu teléfono para ver el estado de tus pedidos</p>
      </div>

      <div className="flex gap-3 mb-8">
        <input
          type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="Ej: 987654321"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors"
          onKeyDown={e => e.key === 'Enter' && setSubmitted(phone)}
        />
        <button onClick={() => setSubmitted(phone)}
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 rounded-xl transition-colors">
          <Search className="h-5 w-5" />
        </button>
      </div>

      {isLoading && <div className="text-center text-white/40 py-8">Buscando pedidos...</div>}

      {submitted && !isLoading && orders.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No se encontraron pedidos para este número</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map(order => {
          const status = STATUS_LABELS[order.status] ?? { label: order.status, color: 'text-white' }
          return (
            <div key={order.id} className="bg-zinc-900 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black text-lg">{order.orderNumber}</p>
                  <p className="text-xs text-white/30">{new Date(order.createdAt).toLocaleString('es-PE')}</p>
                </div>
                <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
              </div>
              <div className="space-y-1 mb-3">
                {order.items.map(item => (
                  <p key={item.id} className="text-sm text-white/60">• {item.name} ×{item.quantity}</p>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <div className="text-sm text-white/40">
                  {order.deliveryType === 'DELIVERY' ? '🚚 Delivery' : '🏪 Recojo'} ·
                  {PAYMENT_LABELS[order.paymentMethod]}
                </div>
                <span className="text-green-400 font-bold">S/ {Number(order.total).toFixed(2)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
