import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, CheckCircle, XCircle, Clock, Truck, Package } from 'lucide-react'
import { toast } from 'sonner'
import { io } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'

interface StoreOrder {
  id: string; orderNumber: string; customerName: string; customerPhone: string
  deliveryType: string; address: string | null; district: string | null
  status: string; paymentMethod: string; paymentStatus: string
  subtotal: number; deliveryCost: number; total: number; createdAt: string; notes: string | null
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; subtotal: number }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pendiente', color: 'secondary', icon: Clock },
  CONFIRMED: { label: 'Confirmado', color: 'default', icon: CheckCircle },
  PREPARING: { label: 'Preparando', color: 'default', icon: Package },
  READY: { label: 'Listo', color: 'success', icon: CheckCircle },
  DELIVERED: { label: 'Entregado', color: 'success', icon: Truck },
  CANCELLED: { label: 'Cancelado', color: 'destructive', icon: XCircle },
}

const NEXT_STATUS: Record<string, string> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED',
}

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }

export function StoreOrdersPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Tiempo real: notificación cuando llega pedido nuevo
  useEffect(() => {
    const API_URL = import.meta.env['VITE_API_URL']?.replace('/api/v1', '') ?? 'http://localhost:3001'
    const socket = io(API_URL, { transports: ['websocket', 'polling'] })
    socket.on('store:new-order', (order: { orderNumber: string; customerName: string; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ['store-orders'] })
      toast.success(`🛒 Nuevo pedido ${order.orderNumber} de ${order.customerName} — S/ ${order.total.toFixed(2)}`, {
        duration: 8000,
        action: { label: 'Ver', onClick: () => setStatusFilter('') },
      })
    })
    return () => { socket.disconnect() }
  }, [queryClient])

  const { data, isLoading } = useQuery({
    queryKey: ['store-orders', statusFilter, page],
    queryFn: async () => (await api.get<{ data: StoreOrder[]; pagination: { total: number; totalPages: number } }>(
      `/store/admin/orders?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`
    )).data,
    refetchInterval: 30000,
  })

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
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Pedidos recibidos desde la tienda online</p>
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

              return (
                <div key={order.id}>
                  <div className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{order.orderNumber}</span>
                        <Badge variant={cfg.color as never} className="text-xs">
                          <StatusIcon className="mr-1 h-3 w-3" />{cfg.label}
                        </Badge>
                        {order.paymentStatus === 'PENDING' && order.paymentMethod !== 'CASH' && (
                          <Badge variant="destructive" className="text-xs">Pago pendiente</Badge>
                        )}
                        {order.paymentStatus === 'VERIFIED' && (
                          <Badge variant="success" className="text-xs">Pago verificado</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {order.customerName} · {order.customerPhone} · {formatDateTime(order.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.deliveryType === 'DELIVERY' ? `🚚 Delivery${order.district ? ` - ${order.district}` : ''}` : '🏪 Recojo en tienda'} ·
                        {PAYMENT_LABELS[order.paymentMethod]}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{formatCurrency(order.total)}</p>
                      <p className="text-xs text-muted-foreground">{order.items.length} producto(s)</p>
                    </div>
                  </div>

                  {expandedId === order.id && (
                    <div className="bg-muted/20 px-6 py-4 space-y-4">
                      {/* Items */}
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Productos</p>
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
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">Dirección de entrega</p>
                          <p className="text-sm">{order.address}, {order.district}</p>
                        </div>
                      )}

                      {order.notes && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-1">Notas</p>
                          <p className="text-sm text-muted-foreground">{order.notes}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        {nextCfg && nextStatus && (
                          <Button size="sm" onClick={() => updateMutation.mutate({ id: order.id, status: nextStatus })}
                            loading={updateMutation.isPending}>
                            Marcar como: {nextCfg.label}
                          </Button>
                        )}
                        {order.paymentMethod !== 'CASH' && order.paymentStatus === 'PENDING' && (
                          <Button size="sm" variant="outline"
                            onClick={() => updateMutation.mutate({ id: order.id, paymentStatus: 'VERIFIED' })}>
                            ✓ Verificar pago
                          </Button>
                        )}
                        {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
                          <Button size="sm" variant="destructive"
                            onClick={() => { if (confirm('¿Cancelar este pedido?')) updateMutation.mutate({ id: order.id, status: 'CANCELLED' }) }}>
                            Cancelar pedido
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
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
