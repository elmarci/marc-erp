import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageCircle, Navigation, Package, Phone, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { fetchOrder, setOrderStatus, claimOrder, releaseOrder } from '../api'
import type { OrderStatus } from '../types'
import { PrimaryButton } from '../components/PrimaryButton'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { HoldClaimButton } from '../components/HoldClaimButton'
import { PaqueteBadge } from '../components/PaqueteBadge'
import { VoiceCommandButton } from '../components/VoiceCommandButton'
import { useAuthStore } from '../authStore'
import { cn } from '../lib/cn'

const STEP_INDEX: Record<OrderStatus, number> = { DISPONIBLE: 0, ASIGNADO: 0, RECOGIDO: 1, EN_CAMINO: 2, ENTREGADO: 3 }
const PILL_LABEL: Record<OrderStatus, string> = {
  DISPONIBLE: 'Disponible', ASIGNADO: 'Por recoger', RECOGIDO: 'Recogido', EN_CAMINO: 'En camino', ENTREGADO: 'Entregado',
}

const TRANSITIONS: Record<Exclude<OrderStatus, 'ENTREGADO'>, {
  next: OrderStatus
  cta: string
  confirmTitle: string
  confirmDesc: string
  frasesVoz: string[]
}> = {
  // Solo por si alguien llega acá con un link directo a un pedido todavía
  // sin captar — el camino normal es tomarlo desde la lista de Disponibles.
  DISPONIBLE: {
    next: 'ASIGNADO',
    cta: 'Tomar pedido',
    confirmTitle: '¿Tomar este pedido?',
    confirmDesc: 'Se asigna a tu cuenta y pasa a "Mis pedidos".',
    frasesVoz: [],
  },
  ASIGNADO: {
    next: 'RECOGIDO',
    cta: 'Marcar como recogido',
    confirmTitle: '¿Confirmas que recogiste el pedido?',
    confirmDesc: 'Esto avisa a la tienda que ya tienes los productos contigo.',
    frasesVoz: ['ya recogí', 'recogido', 'siguiente entrega'],
  },
  RECOGIDO: {
    next: 'EN_CAMINO',
    cta: 'Marcar en camino',
    confirmTitle: '¿Vas en camino hacia el cliente?',
    confirmDesc: 'El cliente verá que estás en ruta hacia su dirección.',
    frasesVoz: ['en camino', 'voy en camino', 'siguiente entrega'],
  },
  EN_CAMINO: {
    next: 'ENTREGADO',
    cta: 'Confirmar entrega',
    confirmTitle: '¿Confirmas que entregaste el pedido?',
    confirmDesc: 'Esta acción cierra el pedido y registra el cobro.',
    frasesVoz: ['ya llegué', 'confirmar entrega', 'entregado'],
  },
}

export function PedidoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
  })
  const comandosVozActivos = useAuthStore((s) => s.comandosVozActivos)

  if (isLoading || !order) {
    return <div className="flex h-full items-center justify-center text-paper-ink-soft">Cargando…</div>
  }

  const stepIndex = STEP_INDEX[order.status]
  const transition = order.status === 'ENTREGADO' ? null : TRANSITIONS[order.status]

  const confirmAdvance = async () => {
    if (!transition || !id) return
    setConfirming(false)
    const previousStatus = order.status
    setSending(true)
    try {
      if (previousStatus === 'DISPONIBLE') {
        await claimOrder(id)
      } else {
        await setOrderStatus(id, transition.next)
      }
      await queryClient.invalidateQueries({ queryKey: ['order', id] })
      await queryClient.invalidateQueries({ queryKey: ['orders-disponibles'] })
      await queryClient.invalidateQueries({ queryKey: ['orders-mios'] })

      if (previousStatus === 'DISPONIBLE') {
        toast.success('Pedido tomado — ya es tuyo.', {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              await releaseOrder(id)
              queryClient.invalidateQueries({ queryKey: ['order', id] })
              queryClient.invalidateQueries({ queryKey: ['orders-disponibles'] })
              queryClient.invalidateQueries({ queryKey: ['orders-mios'] })
            },
          },
        })
        return
      }

      if (transition.next === 'ENTREGADO') {
        navigate(`/pedidos/${id}/entregado`)
        return
      }

      // Fix P1 (crítica de diseño): además de la confirmación previa, se deja
      // una ventana de 5s para deshacer — un tap confirmado por error (ej.
      // el celular rebotó dos veces) todavía se puede revertir sin llamar a
      // la tienda.
      toast(`Pedido marcado como "${PILL_LABEL[transition.next]}"`, {
        duration: 5000,
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await setOrderStatus(id, previousStatus)
            queryClient.invalidateQueries({ queryKey: ['order', id] })
            queryClient.invalidateQueries({ queryKey: ['orders-disponibles'] })
            queryClient.invalidateQueries({ queryKey: ['orders-mios'] })
          },
        },
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <Link to="/pedidos" aria-label="Volver a pedidos" className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-surface transition-transform active:scale-95">
            <ArrowLeft size={20} strokeWidth={2.3} />
          </Link>
          <span className="text-[13px] font-bold text-paper-ink-soft">Pedido {order.numero}</span>
          <div className="font-display rounded-full bg-brand-blue-900/40 px-3.5 py-1.5 text-xs font-extrabold text-accent-blue">
            {PILL_LABEL[order.status].toUpperCase()}
          </div>
        </div>
        <div className="mt-4 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full', i < stepIndex ? 'bg-accent-green' : 'bg-paper-line')} />
          ))}
        </div>
      </div>

      <div className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-2">
          <div className="text-[19px] font-extrabold leading-snug">{order.direccion}</div>
          <div className="text-sm text-paper-ink-soft">{order.referencia}</div>
        </div>

        <a
          href={`https://waze.com/ul?q=${encodeURIComponent(order.direccion)}&navigate=yes`}
          target="_blank"
          rel="noreferrer"
          className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-brand-blue-500 text-base font-extrabold text-white transition-transform active:scale-[0.98]"
        >
          <Navigation size={20} />
          Abrir en Waze o Maps
        </a>

        <div className="flex items-center justify-between rounded-[20px] bg-paper-surface p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="font-display flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-paper-raised text-[15px] font-bold">
              {order.clienteNombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-extrabold">{order.clienteNombre}</div>
              <div className="text-xs font-semibold text-paper-ink-soft">Cliente</div>
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-2.5">
            <a href={`tel:${order.clienteTelefono}`} aria-label={`Llamar a ${order.clienteNombre}`} className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-700 transition-transform active:scale-95">
              <Phone size={20} className="text-white" />
            </a>
            <a href={`https://wa.me/51${order.clienteTelefono}`} aria-label={`WhatsApp a ${order.clienteNombre}`} className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-500 transition-transform active:scale-95">
              <MessageCircle size={20} className="text-white" />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">
              Productos ({order.items.length})
            </div>
            <PaqueteBadge paquete={order.paquete} compact />
          </div>
          <div className="flex flex-col overflow-hidden rounded-[20px] border-[1.5px] border-paper-line">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 border-b border-paper-line px-4 py-3.5 last:border-b-0">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] bg-paper-raised">
                  <Package size={16} className="text-paper-ink-soft" />
                </div>
                <div className="flex-1 text-sm font-bold">{it.nombre}</div>
                <div className="text-sm font-extrabold text-paper-ink-soft">×{it.cantidad}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[20px] bg-paper-surface p-[18px]">
          <div>
            <div className="text-xs font-bold text-paper-ink-soft">
              {order.contraEntrega ? 'Cobrar contra-entrega' : 'Ya pagado'}
            </div>
            <div className="font-display text-[28px] font-extrabold">S/ {order.monto.toFixed(2)}</div>
          </div>
          <div className="rounded-full bg-paper-raised px-3.5 py-2 text-xs font-extrabold">
            {order.metodoPago}
          </div>
        </div>

        {/* Distinta de "Cobrar contra-entrega" a propósito: esa es plata del
            cliente que solo pasa por sus manos camino a la tienda; esto es
            lo que la empresa le paga a él por hacer el viaje. Se muestra tal
            cual, sin restar gasolina ni ningún otro costo — calcular la
            rentabilidad real depende de más variables de las que se pueden
            saber con certeza, así que no se aparenta una precisión que no
            existe. */}
        <div className="flex items-center justify-between rounded-[20px] border-[1.5px] border-brand-green-700/50 bg-brand-green-900/25 p-[18px]">
          <div className="font-display flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-accent-green">
            <Wallet size={14} />
            Tarifa de reparto
          </div>
          <span className="font-display text-2xl font-extrabold text-accent-green">S/ {order.tarifaReparto.toFixed(2)}</span>
        </div>
      </div>

      {transition && (
        <div className="border-t border-paper-line px-5 pt-3.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
          {order.status === 'DISPONIBLE' ? (
            <HoldClaimButton className="w-full py-4 text-center text-base" disabled={sending} onConfirm={confirmAdvance} label="TOMAR PEDIDO" />
          ) : (
            <PrimaryButton className="w-full" disabled={sending} onClick={() => setConfirming(true)}>
              {sending ? 'Guardando…' : transition.cta}
            </PrimaryButton>
          )}
        </div>
      )}

      {confirming && transition && (
        <ConfirmSheet
          title={transition.confirmTitle}
          description={transition.confirmDesc}
          confirmLabel={transition.cta}
          onConfirm={confirmAdvance}
          onCancel={() => setConfirming(false)}
        />
      )}

      {transition && transition.frasesVoz.length > 0 && comandosVozActivos && !sending && (
        <VoiceCommandButton comandos={[{ frases: transition.frasesVoz, accion: confirmAdvance }]} />
      )}
    </div>
  )
}
