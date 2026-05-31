import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, CheckCircle, XCircle, Clock, Truck, Package, Receipt, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import { io } from 'socket.io-client'

interface StoreOrder {
  id: string; orderNumber: string; customerName: string; customerPhone: string
  deliveryType: string; address: string | null; district: string | null
  status: string; paymentMethod: string; paymentStatus: string
  subtotal: number; deliveryCost: number; total: number; createdAt: string; notes: string | null
  saleId: string | null
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; subtotal: number }>
}

interface CashSession { id: string; cashRegister: { name: string } }

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pendiente', variant: 'secondary', icon: Clock },
  CONFIRMED: { label: 'Confirmado', variant: 'default', icon: CheckCircle },
  PREPARING: { label: 'Preparando', variant: 'default', icon: Package },
  READY: { label: 'Listo', variant: 'success', icon: CheckCircle },
  DELIVERED: { label: 'Entregado', variant: 'success', icon: Truck },
  CANCELLED: { label: 'Cancelado', variant: 'destructive', icon: XCircle },
}

const NEXT_STATUS: Record<string, string> = {
  CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED',
}

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }
const PAYMENT_EMOJIS: Record<string, string> = { YAPE: '💜', PLIN: '💚', CASH: '💵' }

// Sound notification using Web Audio API
// AudioContext must be created/resumed after user gesture
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new AC()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
    return audioCtx
  } catch { return null }
}

// Call on first user interaction to unlock audio
function unlockAudio() {
  getAudioCtx()
  document.removeEventListener('click', unlockAudio)
  document.removeEventListener('keydown', unlockAudio)
}
document.addEventListener('click', unlockAudio, { once: true })
document.addEventListener('keydown', unlockAudio, { once: true })

function playNotificationSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const times = [0, 0.18, 0.36]
    times.forEach(t => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* ignore */ }
}

// Browser notification
function showBrowserNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body })
    })
  }
}

function ConfirmOrderModal({ order, onClose, onConfirmed }: {
  order: StoreOrder; onClose: () => void; onConfirmed: (saleNumber: string) => void
}) {
  const queryClient = useQueryClient()
  const [selectedSession, setSelectedSession] = useState('')

  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; sessions: CashSession[] }> }>('/cash/registers')).data.data,
  })

  const openSessions = (registers ?? []).flatMap(r =>
    r.sessions.map(s => ({ id: s.id, name: r.name }))
  )

  const mutation = useMutation({
    mutationFn: () => api.post(`/store/admin/orders/${order.id}/confirm`, { cashSessionId: selectedSession }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['store-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      const { saleNumber } = res.data.data
      toast.success(`✅ Pedido confirmado. Venta ${saleNumber} generada.`)
      onConfirmed(saleNumber)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl">
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold">Confirmar pedido {order.orderNumber}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Esto creará una venta en el ERP, descontará stock y sumará a la caja.
            </p>
          </div>

          {/* Order summary */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
            <p className="font-medium">{order.customerName} · {order.customerPhone}</p>
            <p className="text-muted-foreground">{order.deliveryType === 'DELIVERY' ? `🚚 Delivery — ${order.address}` : '🏪 Recojo en tienda'}</p>
            <p className="text-muted-foreground">{PAYMENT_EMOJIS[order.paymentMethod]} {PAYMENT_LABELS[order.paymentMethod]}</p>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-success">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Cash session selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              ¿En qué caja se registra? *
            </label>
            {openSessions.length === 0 ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">
                ⚠️ No hay cajas abiertas. Abre una caja primero en el módulo Caja.
              </div>
            ) : (
              <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Selecciona una caja...</option>
                {openSessions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="border-t p-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={mutation.isPending}
            disabled={!selectedSession || openSessions.length === 0}
            onClick={() => mutation.mutate()}>
            <CheckCircle className="mr-2 h-4 w-4" />Confirmar y generar venta
          </Button>
        </div>
      </div>
    </div>
  )
}

export function StoreOrdersPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [confirmingOrder, setConfirmingOrder] = useState<StoreOrder | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['store-orders', statusFilter, page],
    queryFn: async () => (await api.get<{ data: StoreOrder[]; pagination: { total: number; totalPages: number } }>(
      `/store/admin/orders?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`
    )).data,
    refetchInterval: 15000,
  })

  // WebSocket + sound notification
  useEffect(() => {
    const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001/api/v1'
    const API_URL = base.replace('/api/v1', '')
    const socket = io(API_URL, { transports: ['websocket', 'polling'] })

    socket.on('store:new-order', (order: { orderNumber: string; customerName: string; total: number; paymentMethod: string }) => {
      queryClient.invalidateQueries({ queryKey: ['store-orders'] })
      playNotificationSound()
      showBrowserNotification(
        '🛒 Nuevo pedido online',
        `${order.orderNumber} — ${order.customerName} — S/ ${order.total.toFixed(2)} — ${PAYMENT_LABELS[order.paymentMethod]}`
      )
      toast.success(
        `🛒 Nuevo pedido: ${order.orderNumber} — ${order.customerName} — S/ ${order.total.toFixed(2)}`,
        { duration: 10000, action: { label: 'Ver', onClick: () => { setStatusFilter('PENDING'); setPage(1) } } }
      )
    })

    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => { socket.disconnect() }
  }, [queryClient])

  const updateMutation = useMutation({
    mutationFn: ({ id, status, paymentStatus }: { id: string; status?: string; paymentStatus?: string }) =>
      api.patch(`/store/admin/orders/${id}/status`, { status, paymentStatus }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store-orders'] }); toast.success('Pedido actualizado.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const orders = data?.data ?? []
  const pendingCount = orders.filter(o => o.status === 'PENDING').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Pedidos Online
            {pendingCount > 0 && (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white text-xs font-bold animate-pulse">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Pedidos de la tienda online · Confirmar genera venta y descuenta stock</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[['', 'Todos'], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])].map(([val, label]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(1) }}
            className={cn('px-4 py-2 rounded-full text-sm font-medium transition-colors',
              statusFilter === val ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80')}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="divide-y">
            {orders.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING
              const StatusIcon = cfg.icon
              const nextStatus = NEXT_STATUS[order.status]
              const nextCfg = nextStatus ? STATUS_CONFIG[nextStatus] : null
              const isPending = order.status === 'PENDING'

              return (
                <div key={order.id}>
                  <div
                    className={cn('flex items-center gap-4 p-4 cursor-pointer transition-colors',
                      isPending ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-amber-500' : 'hover:bg-muted/30')}
                    onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{order.orderNumber}</span>
                        <Badge variant={cfg.variant as never} className="text-xs">
                          <StatusIcon className="mr-1 h-3 w-3" />{cfg.label}
                        </Badge>
                        {order.saleId && (
                          <span className="text-xs bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Receipt className="h-3 w-3" />Venta generada
                          </span>
                        )}
                        {order.paymentStatus === 'PENDING' && order.paymentMethod !== 'CASH' && (
                          <Badge variant="destructive" className="text-xs">Pago pendiente</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {order.customerName} · {order.customerPhone} · {formatDateTime(order.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.deliveryType === 'DELIVERY' ? `🚚 Delivery${order.district ? ` - ${order.district}` : ''}` : '🏪 Recojo'} ·
                        {PAYMENT_EMOJIS[order.paymentMethod]} {PAYMENT_LABELS[order.paymentMethod]}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{formatCurrency(order.total)}</p>
                      <p className="text-xs text-muted-foreground">{order.items.length} prod.</p>
                    </div>
                  </div>

                  {expandedId === order.id && (
                    <div className="bg-muted/20 px-6 py-4 space-y-4">
                      {/* Items */}
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Productos pedidos</p>
                        <div className="space-y-1">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{item.name} ×{item.quantity}</span>
                              <span>{formatCurrency(item.subtotal)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                            <span>Total</span>
                            <span className="text-success">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </div>

                      {order.address && (
                        <p className="text-sm text-muted-foreground">📍 {order.address}, {order.district}</p>
                      )}
                      {order.notes && (
                        <p className="text-sm text-muted-foreground italic">"{order.notes}"</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap pt-1">
                        {/* CONFIRM = create sale */}
                        {isPending && (
                          <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground"
                            onClick={() => setConfirmingOrder(order)}>
                            <CheckCircle className="mr-1.5 h-4 w-4" />Confirmar → Generar venta
                          </Button>
                        )}

                        {/* Progress order status (after confirmed) */}
                        {nextCfg && nextStatus && !isPending && (
                          <Button size="sm" variant="outline"
                            onClick={() => updateMutation.mutate({ id: order.id, status: nextStatus })}
                            loading={updateMutation.isPending}>
                            Avanzar a: {nextCfg.label}
                          </Button>
                        )}

                        {/* Verify payment */}
                        {order.paymentMethod !== 'CASH' && order.paymentStatus === 'PENDING' && (
                          <Button size="sm" variant="outline"
                            onClick={() => updateMutation.mutate({ id: order.id, paymentStatus: 'VERIFIED' })}>
                            ✓ Verificar pago {PAYMENT_LABELS[order.paymentMethod]}
                          </Button>
                        )}

                        {/* View sale */}
                        {order.saleId && (
                          <a href={`/sales/${order.saleId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted">
                            <ExternalLink className="h-3.5 w-3.5" />Ver venta
                          </a>
                        )}

                        {/* Cancel */}
                        {!['CANCELLED', 'DELIVERED'].includes(order.status) && (
                          <Button size="sm" variant="destructive" className="ml-auto"
                            onClick={() => { if (confirm('¿Cancelar este pedido?')) updateMutation.mutate({ id: order.id, status: 'CANCELLED' }) }}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {orders.length === 0 && (
              <div className="py-16 text-center">
                <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">No hay pedidos online {statusFilter ? 'con este estado' : 'aún'}</p>
              </div>
            )}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">{page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>

      {confirmingOrder && (
        <ConfirmOrderModal
          order={confirmingOrder}
          onClose={() => setConfirmingOrder(null)}
          onConfirmed={() => setConfirmingOrder(null)}
        />
      )}
    </div>
  )
}
