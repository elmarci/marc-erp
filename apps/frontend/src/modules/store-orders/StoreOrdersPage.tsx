// Pedidos de la tienda online: lista con filtro por estado, aviso sonoro de
// pedidos nuevos, confirmar (genera la venta), avanzar estado, verificar
// pago, seguimiento del repartidor y cancelar.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Bike, CheckCircle, ChevronDown, ExternalLink, MapPin, MapPinned, Receipt, ShoppingBag, Store, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { Btn, EmptyState, PageHeader, Pagination, Segmented, StatusBadge, surfaceCls, useConfirm } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { RiderTrackingPanel } from './RiderTrackingPanel'
import {
  ConfirmOrderModal, DELIVERY_STATUS_LABELS, NEXT_STATUS, PAYMENT_LABELS, PAYS_ON_DELIVERY, PackageEditor, STATUS_CONFIG,
  activateNotifications, audioUnlocked, beep, showBrowserNotif, type StoreOrder,
} from './orderParts'

export function StoreOrdersPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [confirmingOrder, setConfirmingOrder] = useState<StoreOrder | null>(null)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [trackingOpenId, setTrackingOpenId] = useState<string | null>(null)

  const handleActivateNotifications = () => {
    const ok = activateNotifications()
    if (ok) {
      setNotifEnabled(true)
      toast.success('Notificaciones activadas. Recibirás sonido y alertas con cada pedido.')
    } else {
      toast.error('No se pudo activar. Intenta desde un navegador moderno.')
    }
  }

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
    socket.on('connect', () => socket.emit('join-staff', useAuthStore.getState().accessToken))

    socket.on('store:new-order', (order: { orderNumber: string; customerName: string; total: number; paymentMethod: string }) => {
      queryClient.invalidateQueries({ queryKey: ['store-orders'] })
      if (audioUnlocked) beep()
      showBrowserNotif(
        'Nuevo pedido online',
        `${order.orderNumber} · ${order.customerName} · S/ ${order.total.toFixed(2)} · ${PAYMENT_LABELS[order.paymentMethod]}`
      )
      toast.success(
        `Nuevo pedido: ${order.orderNumber} · ${order.customerName} · S/ ${order.total.toFixed(2)}`,
        { duration: 10000, action: { label: 'Ver', onClick: () => { setStatusFilter('PENDING'); setPage(1) } } }
      )
    })

    return () => { socket.disconnect() }
  }, [queryClient])

  const updateMutation = useMutation({
    mutationFn: ({ id, status, paymentStatus }: { id: string; status?: string; paymentStatus?: string }) =>
      api.patch(`/store/admin/orders/${id}/status`, { status, paymentStatus }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store-orders'] }); toast.success('Pedido actualizado.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const cancelOrder = async (order: StoreOrder) => {
    const r = await confirm({ title: `¿Cancelar el pedido ${order.orderNumber}?`, confirmLabel: 'Cancelar pedido' })
    if (r.ok) updateMutation.mutate({ id: order.id, status: 'CANCELLED' })
  }

  const orders = data?.data ?? []
  const pendingCount = orders.filter(o => o.status === 'PENDING').length

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title={<span className="flex items-center gap-2">Pedidos Online
        {pendingCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1.5 text-meta font-semibold text-white">{pendingCount}</span>}
      </span>} actions={notifEnabled
        ? <span className="inline-flex items-center gap-1.5 text-table text-ok-ink"><Bell className="size-4" />Notificaciones activas</span>
        : <Btn onClick={handleActivateNotifications}><BellOff />Activar notificaciones</Btn>}>
        <p className="text-table text-ink-muted">Pedidos de la tienda online · Confirmar genera venta y descuenta stock</p>
      </PageHeader>

      {!notifEnabled && (
        <div className="flex flex-wrap items-center gap-3 rounded-srf border border-line bg-surface p-3 shadow-[inset_3px_0_0_hsl(var(--warn))]">
          <Bell className="size-5 shrink-0 text-warn-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-table font-semibold text-ink">Activa las notificaciones para no perderte ningún pedido</p>
            <p className="text-meta text-ink-muted">Recibirás sonido y alerta del sistema operativo aunque tengas otra pestaña abierta</p>
          </div>
          <Btn size="sm" variant="primary" onClick={handleActivateNotifications}>Activar ahora</Btn>
        </div>
      )}

      <div className={cn('overflow-hidden', surfaceCls)}>
        <div className="border-b border-line p-2">
          <Segmented ariaLabel="Filtrar por estado" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={[['', 'Todos'], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label] as const)]} />
        </div>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div> : (
          <div className="divide-y divide-line">
            {orders.map(order => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING
              const nextStatus = NEXT_STATUS[order.status]
              const nextCfg = nextStatus ? STATUS_CONFIG[nextStatus] : null
              const isPending = order.status === 'PENDING'
              const open = expandedId === order.id

              return (
                <div key={order.id}>
                  <button type="button" aria-expanded={open}
                    className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                      isPending && 'shadow-[inset_3px_0_0_hsl(var(--warn))]')}
                    onClick={() => setExpandedId(open ? null : order.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-table font-semibold text-ink">{order.orderNumber}</span>
                        <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
                        {order.saleId && <StatusBadge tone="ok"><Receipt className="size-3" />Venta generada</StatusBadge>}
                        {order.paymentStatus === 'PENDING' && !PAYS_ON_DELIVERY.has(order.paymentMethod) && <StatusBadge tone="bad">Pago pendiente</StatusBadge>}
                        {order.rider && (
                          <StatusBadge tone="neutral"><Bike className="size-3" />{order.rider.nombre} · {DELIVERY_STATUS_LABELS[order.deliveryStatus ?? ''] ?? order.deliveryStatus}</StatusBadge>
                        )}
                      </div>
                      <p className="mt-0.5 text-table text-ink-muted">{order.customerName} · {order.customerPhone} · {formatDateTime(order.createdAt)}</p>
                      <p className="flex items-center gap-1 text-meta text-ink-muted">
                        {order.deliveryType === 'DELIVERY'
                          ? <><Truck className="size-3.5" />Delivery{order.district ? ` · ${order.district}` : ''}</>
                          : <><Store className="size-3.5" />Recojo</>}
                        {' · '}{PAYMENT_LABELS[order.paymentMethod]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-section font-semibold tabular-nums text-ink">{formatCurrency(order.total)}</p>
                      <p className="text-meta text-ink-muted">{order.items.length} prod.</p>
                      {order.items.some(i => i.options) && <p className="text-meta font-semibold text-warn-ink">Con opciones</p>}
                    </div>
                    <ChevronDown className={cn('size-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />
                  </button>

                  {open && (
                    <div className="flex flex-col gap-4 bg-surface-2 px-4 py-4 sm:px-6">
                      <div>
                        <p className="mb-2 text-meta font-medium text-ink-muted">Productos pedidos</p>
                        <div className="flex flex-col gap-1">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between gap-3 text-table">
                              <div className="min-w-0">
                                <span className="text-ink">{item.name} ×{Number(item.quantity)}</span>
                                {(item.unitsPerSale ?? 1) > 1 && (
                                  <span className="ml-1.5 text-meta text-ink-muted">({Number(item.quantity) * (item.unitsPerSale ?? 1)} und.)</span>
                                )}
                                {/* Opción elegida por el cliente: es dato de despacho, va resaltada. */}
                                {item.options && (
                                  <span className="mt-0.5 block w-fit rounded-[4px] bg-warn/15 px-1.5 py-0.5 text-meta font-semibold text-warn-ink">{item.options}</span>
                                )}
                              </div>
                              <span className="shrink-0 tabular-nums">{formatCurrency(item.subtotal)}</span>
                            </div>
                          ))}
                          <div className="mt-1 flex justify-between border-t border-line pt-1 text-table font-semibold">
                            <span>Total</span>
                            <span className="tabular-nums">{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </div>

                      {order.address && (
                        <p className="flex flex-wrap items-center gap-2 text-table text-ink-muted">
                          <MapPin className="size-4" />{order.address}, {order.district}
                          {order.latitude != null && order.longitude != null && (
                            <a href={`https://www.google.com/maps?q=${order.latitude},${order.longitude}`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-meta font-medium text-brand hover:underline">
                              <ExternalLink className="size-3" />Ver ubicación GPS del cliente
                            </a>
                          )}
                        </p>
                      )}
                      {order.notes && <p className="text-table italic text-ink-muted">"{order.notes}"</p>}

                      {order.deliveryType === 'DELIVERY' && !['DELIVERED', 'CANCELLED'].includes(order.status) && <PackageEditor order={order} />}

                      <div className="flex flex-wrap gap-2">
                        {isPending && (
                          <Btn size="sm" variant="primary" onClick={() => setConfirmingOrder(order)}><CheckCircle />Confirmar y generar venta</Btn>
                        )}
                        {/* El paso a DELIVERED lo cierra el biker desde su app una vez que hay un
                            repartidor asignado; el admin ya no lo puede pisar a mano. */}
                        {nextCfg && nextStatus && !isPending && !(nextStatus === 'DELIVERED' && order.riderId && order.deliveryStatus !== 'ENTREGADO') && (
                          <Btn size="sm" loading={updateMutation.isPending} onClick={() => updateMutation.mutate({ id: order.id, status: nextStatus })}>
                            Avanzar a: {nextCfg.label}
                          </Btn>
                        )}
                        {order.riderId && (
                          <Btn size="sm" onClick={() => setTrackingOpenId(trackingOpenId === order.id ? null : order.id)}>
                            <MapPinned />{trackingOpenId === order.id ? 'Ocultar seguimiento' : 'Ver seguimiento'}
                          </Btn>
                        )}
                        {!PAYS_ON_DELIVERY.has(order.paymentMethod) && order.paymentStatus === 'PENDING' && (
                          <Btn size="sm" onClick={() => updateMutation.mutate({ id: order.id, paymentStatus: 'VERIFIED' })}>
                            <CheckCircle />Verificar pago {PAYMENT_LABELS[order.paymentMethod]}
                          </Btn>
                        )}
                        {order.saleId && (
                          <Btn size="sm" variant="ghost" onClick={() => navigate(`/sales/${order.saleId}`)}><ExternalLink />Ver venta</Btn>
                        )}
                        {!['CANCELLED', 'DELIVERED'].includes(order.status) && (
                          <Btn size="sm" variant="danger" className="ml-auto" onClick={() => cancelOrder(order)}>Cancelar</Btn>
                        )}
                      </div>

                      {trackingOpenId === order.id && <RiderTrackingPanel orderId={order.id} />}
                    </div>
                  )}
                </div>
              )
            })}

            {orders.length === 0 && <EmptyState icon={ShoppingBag} title={`No hay pedidos online ${statusFilter ? 'con este estado' : 'aún'}`} />}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={20} onPage={setPage} />
        )}
      </div>

      {confirmingOrder && (
        <ConfirmOrderModal order={confirmingOrder} onClose={() => setConfirmingOrder(null)} onConfirmed={() => setConfirmingOrder(null)} />
      )}
    </div>
  )
}
