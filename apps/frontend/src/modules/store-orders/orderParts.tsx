// Piezas de Pedidos online: tipos, textos, aviso sonoro, datos del paquete
// y la ventana para confirmar un pedido (genera la venta).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, Clock, Package, Truck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, Field, Modal, fieldCls } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, cn } from '@/lib/utils'

export interface StoreOrder {
  id: string; orderNumber: string; customerName: string; customerPhone: string
  deliveryType: string; address: string | null; district: string | null
  status: string; paymentMethod: string; paymentStatus: string
  subtotal: number; deliveryCost: number; total: number; createdAt: string; notes: string | null
  saleId: string | null
  latitude: number | null; longitude: number | null
  riderId: string | null; deliveryStatus: string | null; rider: { id: string; nombre: string } | null
  packageTamano: string; packageTipo: string; packagePesoKg: number; packageFragil: boolean
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; subtotal: number; unitsPerSale?: number; options?: string | null }>
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  ASIGNADO: 'Asignado, camino a recoger', RECOGIDO: 'Recogido', EN_CAMINO: 'En camino', ENTREGADO: 'Entregado',
}

export const STATUS_CONFIG: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' | 'muted'; icon: React.ElementType }> = {
  PENDING: { label: 'Pendiente', tone: 'warn', icon: Clock },
  CONFIRMED: { label: 'Confirmado', tone: 'neutral', icon: CheckCircle },
  PREPARING: { label: 'Preparando', tone: 'neutral', icon: Package },
  READY: { label: 'Listo', tone: 'ok', icon: CheckCircle },
  DELIVERED: { label: 'Entregado', tone: 'ok', icon: Truck },
  CANCELLED: { label: 'Cancelado', tone: 'bad', icon: XCircle },
}

export const NEXT_STATUS: Record<string, string> = {
  CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED',
}

export const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo', YAPE_CONTRAENTREGA: 'Yape contra entrega', CARD_CONTRAENTREGA: 'Tarjeta contra entrega (POS)' }
// Se cobran recién al entregar: nunca quedan "pago pendiente de verificar"
// como sí pasa con un Yape/Plin pagado por adelantado.
export const PAYS_ON_DELIVERY = new Set(['CASH', 'YAPE_CONTRAENTREGA', 'CARD_CONTRAENTREGA'])

// Notification system - requires explicit user activation
export let audioUnlocked = false
let audioCtx: AudioContext | null = null

export function beep() {
  if (!audioUnlocked || !audioCtx) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const times = [0, 0.2, 0.4]
    times.forEach(t => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      osc.connect(gain); gain.connect(audioCtx!.destination)
      osc.frequency.value = 880; osc.type = 'sine'
      gain.gain.setValueAtTime(0.5, audioCtx!.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + t + 0.15)
      osc.start(audioCtx!.currentTime + t)
      osc.stop(audioCtx!.currentTime + t + 0.15)
    })
  } catch { /* ignore */ }
}

export function activateNotifications(): boolean {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new AC()
    audioUnlocked = true
    // Test beep
    beep()
    // Request browser notifications
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission()
    }
    return true
  } catch { return false }
}

export function showBrowserNotif(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', requireInteraction: true })
  }
}

export function PackageEditor({ order }: { order: StoreOrder }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: Partial<{ packageTamano: string; packageTipo: string; packagePesoKg: number; packageFragil: boolean }>) =>
      api.patch(`/store/admin/orders/${order.id}/paquete`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['store-orders'] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="rounded-ctl border border-line bg-surface p-3">
      <p className="mb-2 text-meta font-medium text-ink-muted">Paquete para el biker (para que organice su mochila)</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tamaño" value={order.packageTamano} onChange={(e) => mutation.mutate({ packageTamano: e.target.value })} className={cn(fieldCls, 'h-8 w-auto')}>
          <option value="chico">Chico</option>
          <option value="mediano">Mediano</option>
          <option value="grande">Grande</option>
        </select>
        <select aria-label="Tipo" value={order.packageTipo} onChange={(e) => mutation.mutate({ packageTipo: e.target.value })} className={cn(fieldCls, 'h-8 w-auto')}>
          <option value="bolsa">Bolsa</option>
          <option value="caja">Caja</option>
          <option value="bulto">Bulto</option>
        </select>
        <input aria-label="Peso en kg" type="number" step="0.1" min="0" value={order.packagePesoKg}
          onChange={(e) => mutation.mutate({ packagePesoKg: parseFloat(e.target.value) || 0 })}
          className={cn(fieldCls, 'h-8 w-24 text-right tabular-nums')} />
        <label className="flex items-center gap-1.5 text-table text-ink">
          <input type="checkbox" checked={order.packageFragil} onChange={(e) => mutation.mutate({ packageFragil: e.target.checked })}
            className="size-4 accent-[hsl(var(--brand))]" />
          Frágil
        </label>
      </div>
    </div>
  )
}

interface CashSession { id: string; cashRegister: { name: string } }

export function ConfirmOrderModal({ order, onClose, onConfirmed }: {
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
      const { saleNumber, stockWarnings } = res.data.data as { saleNumber: string; stockWarnings?: string[] }
      toast.success(order.status === 'PENDING' ? `Pedido confirmado. Venta ${saleNumber} generada.` : `Venta ${saleNumber} generada.`)
      // El sistema no tenía stock suficiente: se ajustó solo, pero hay que
      // revisar el físico (p. ej. dos clientes pidieron la última unidad).
      for (const w of stockWarnings ?? []) toast.warning(`Stock: ${w}`, { duration: 15000 })
      onConfirmed(saleNumber)
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={order.status === 'PENDING' ? `Confirmar pedido ${order.orderNumber}` : `Generar venta del pedido ${order.orderNumber}`}
      description="Esto creará un ticket de venta en el ERP, descontará stock y sumará a la caja."
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" loading={mutation.isPending} disabled={!selectedSession || openSessions.length === 0} onClick={() => mutation.mutate()}>
          <CheckCircle />{order.status === 'PENDING' ? 'Confirmar y generar venta' : 'Generar venta'}
        </Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-ctl bg-surface-2 p-3 text-table">
          <p className="font-medium text-ink">{order.customerName} · {order.customerPhone}</p>
          <p className="text-ink-muted">{order.deliveryType === 'DELIVERY' ? `Delivery · ${order.address}` : 'Recojo en tienda'}</p>
          <p className="text-ink-muted">{PAYMENT_LABELS[order.paymentMethod]}</p>
          <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(order.total)}</span>
          </div>
        </div>
        {openSessions.length === 0 ? (
          <p className="flex items-center gap-2 rounded-ctl bg-surface-2 p-3 text-table text-bad-ink">
            <AlertTriangle className="size-4 shrink-0" />No hay cajas abiertas. Abre una caja primero en el módulo Caja.
          </p>
        ) : (
          <Field label="¿En qué caja se registra?" required>
            <select className={fieldCls} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="">Selecciona una caja...</option>
              {openSessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  )
}
