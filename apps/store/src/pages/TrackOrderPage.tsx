import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Search, LogOut, User, ChevronRight, RefreshCw } from 'lucide-react'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'
import { Link } from 'react-router-dom'
import { AuthModal } from '../components/AuthModal'
import { useCartStore } from '../cartStore'
import { toast } from 'sonner'

const STATUS: Record<string, { label: string; color: string; emoji: string }> = {
  PENDING:   { label: 'Pendiente',   color: 'text-amber-400',  emoji: '⏳' },
  CONFIRMED: { label: 'Confirmado',  color: 'text-blue-400',   emoji: '✅' },
  PREPARING: { label: 'Preparando',  color: 'text-purple-400', emoji: '👨‍🍳' },
  READY:     { label: 'Listo',       color: 'text-green-400',  emoji: '🎉' },
  DELIVERED: { label: 'Entregado',   color: 'text-green-400',  emoji: '✅' },
  CANCELLED: { label: 'Cancelado',   color: 'text-red-400',    emoji: '❌' },
}
const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }

export function TrackOrderPage() {
  const { customer, isLoggedIn, logout } = useAuthStore()
  const { addItem, openCart } = useCartStore()
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [submitted, setSubmitted] = useState(isLoggedIn && customer ? customer.phone : '')
  const [showAuth, setShowAuth] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['track-orders', submitted],
    queryFn: () => storeApi.trackOrders(submitted),
    enabled: !!submitted,
    refetchInterval: 15000,
  })

  const orders = data?.data.data ?? []

  const repeatOrder = (order: typeof orders[0]) => {
    order.items.forEach(item => {
      addItem({
        id: item.id, // not product id but ok for display
        name: item.name,
        salePrice: Number(item.unitPrice),
        currentStock: 99,
        imageUrl: null,
        barcode: null,
        description: null,
        category: { id: '', name: '' },
      })
    })
    openCart()
    toast.success('Productos del pedido agregados al carrito')
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <Package className="h-12 w-12 mx-auto mb-4 text-green-400" />
        <h1 className="text-2xl font-black mb-1">Mis pedidos</h1>
        {isLoggedIn && customer ? (
          <div className="flex items-center justify-center gap-3 mt-2">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center text-black text-xs font-bold">
                {customer.name[0].toUpperCase()}
              </div>
              {customer.name} · {customer.phone}
            </div>
            <button onClick={logout} className="text-xs text-white/30 hover:text-red-400 flex items-center gap-1 transition-colors">
              <LogOut className="h-3 w-3" />Salir
            </button>
          </div>
        ) : (
          <p className="text-white/50 text-sm">Ingresa tu teléfono para ver tus pedidos</p>
        )}
      </div>

      {/* Si no está logueado, mostrar opción de registro + búsqueda por teléfono */}
      {!isLoggedIn && (
        <div className="space-y-4 mb-8">
          <button onClick={() => setShowAuth(true)}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl transition-colors">
            <User className="h-4 w-4" />Ingresar para ver todos mis pedidos
          </button>
          <div className="flex items-center gap-3 text-xs text-white/20">
            <div className="flex-1 h-px bg-white/10" />o busca por teléfono<div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex gap-3">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Ej: 987654321"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors"
              onKeyDown={e => e.key === 'Enter' && setSubmitted(phone)} />
            <button onClick={() => setSubmitted(phone)}
              className="bg-green-500 hover:bg-green-400 text-black font-bold px-5 rounded-xl transition-colors">
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Lista de pedidos */}
      {isLoading && (
        <div className="text-center py-8 text-white/40">
          <div className="h-8 w-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Buscando pedidos...
        </div>
      )}

      {submitted && !isLoading && orders.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No se encontraron pedidos</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map(order => {
          const status = STATUS[order.status] ?? STATUS.PENDING
          return (
            <div key={order.id} className="bg-zinc-900 rounded-2xl overflow-hidden border border-white/5">
              <Link to={`/pedido/${order.orderNumber}`} className="block p-4 hover:bg-zinc-800 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-lg">{order.orderNumber}</p>
                    <p className="text-xs text-white/30">{new Date(order.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${status.color}`}>{status.emoji} {status.label}</span>
                    <ChevronRight className="h-4 w-4 text-white/20" />
                  </div>
                </div>
                <div className="space-y-0.5 mb-3">
                  {order.items.slice(0, 3).map((item, i) => (
                    <p key={i} className="text-sm text-white/50">• {item.name} ×{item.quantity}</p>
                  ))}
                  {order.items.length > 3 && <p className="text-xs text-white/30">+{order.items.length - 3} más</p>}
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-sm text-white/40">
                    {order.deliveryType === 'DELIVERY' ? '🚚 Delivery' : '🏪 Recojo'} · {PAYMENT_LABELS[order.paymentMethod]}
                  </span>
                  <span className="text-green-400 font-bold">S/ {Number(order.total).toFixed(2)}</span>
                </div>
              </Link>
              {/* Repetir pedido */}
              <div className="px-4 pb-3 border-t border-white/5">
                <button onClick={() => repeatOrder(order)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/40 hover:text-green-400 transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" />Repetir este pedido
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  )
}
