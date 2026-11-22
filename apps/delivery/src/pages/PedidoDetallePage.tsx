import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageCircle, Navigation, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { fetchOrder, setOrderStatus, claimOrder, releaseOrder } from '../api'
import type { OrderStatus } from '../types'
import { PrimaryButton } from '../components/PrimaryButton'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { HoldClaimButton } from '../components/HoldClaimButton'
import { PaqueteBadge } from '../components/PaqueteBadge'
import { RouteMap } from '../components/RouteMap'
import { resolveRoute } from '../lib/routing'
import { useRiderLocation } from '../hooks/useRiderLocation'
import { VoiceCommandButton } from '../components/VoiceCommandButton'
import { useAuthStore } from '../authStore'
import { cn } from '../lib/cn'
import { EntregaChip } from '../components/TripCard'
import { entregaInfo } from '../lib/formato'

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
    confirmDesc: 'Se asigna a tu cuenta y pasa a "En curso".',
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
  const iniciales = useAuthStore((s) => s.iniciales)
  const riderPos = useRiderLocation()
  const riderKey = `${riderPos.lat.toFixed(3)},${riderPos.lng.toFixed(3)}`
  const { data: ruta } = useQuery({
    queryKey: ['route-one', id, riderKey],
    queryFn: () => resolveRoute(riderPos, [order!]),
    enabled: !!order && order.status !== 'ENTREGADO',
    staleTime: 20000,
  })

  if (isLoading || !order) {
    return <div className="flex h-full items-center justify-center text-ink-soft">Cargando…</div>
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
        toast.success('Pedido tomado.', {
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

  const STEPS = ['Tomado', 'Recogido', 'En camino', 'Entregado']
  const ent = entregaInfo(order.entrega)
  const minutos = ruta ? Math.round(ruta.totalMin) : null

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-none">
        <RouteMap
          riderPos={riderPos}
          riderIniciales={iniciales}
          orders={[order]}
          selected={new Set([order.id])}
          ordenVisita={[order.id]}
          routeGeometry={ruta?.geometry ?? []}
          onToggle={() => {}}
          height={220}
          className="marc-map"
        />
        <Link to="/pedidos" aria-label="Volver a pedidos"
          className="absolute left-4 z-[500] flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-card"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>
          <ArrowLeft size={20} />
        </Link>
      </div>

      <div className="no-scrollbar relative z-[600] -mt-5 flex flex-1 flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-bg px-4 pb-4 pt-4">
        <div>
          <div className="flex gap-1">
            {STEPS.map((_, i) => <i key={i} className={cn('h-[3px] flex-1 rounded-full', i <= stepIndex && order.status !== 'DISPONIBLE' ? 'bg-ink' : 'bg-line')} />)}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-ink-faint">
            {STEPS.map((s, i) => <span key={s} className={cn(i === stepIndex && order.status !== 'DISPONIBLE' && 'font-semibold text-ink')}>{s}</span>)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <EntregaChip texto={ent.texto} urgencia={ent.urgencia} />
          <span className="text-[13px] tabular-nums text-ink-faint">{order.numero} · {order.distanciaKm.toFixed(1)} km{minutos !== null ? ` · ${minutos} min` : ''}</span>
        </div>

        {/* Lo que decide el viaje, de un vistazo: lo que ganas y lo que cobras. */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[20px] bg-card px-4 py-3 shadow-card">
            <div className="text-[13px] text-ink-soft">Ganas</div>
            <div className="num text-[28px] font-semibold leading-tight">S/ {order.tarifaReparto.toFixed(2)}</div>
          </div>
          <div className={cn('rounded-[20px] px-4 py-3', order.contraEntrega ? 'bg-night text-white' : 'bg-card shadow-card')}>
            <div className={cn('text-[13px]', order.contraEntrega ? 'text-white/70' : 'text-ink-soft')}>{order.contraEntrega ? `Cobras · ${order.metodoPago}` : 'Pago'}</div>
            <div className="num text-[28px] font-semibold leading-tight">{order.contraEntrega ? `S/ ${order.monto.toFixed(2)}` : 'Ya pagado'}</div>
          </div>
        </div>

        <div className="grid grid-cols-[14px_1fr] gap-x-3">
          <i className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink" />
          <div className="text-sm text-ink-soft">Tiendas Marc{order.status !== 'DISPONIBLE' && order.status !== 'ASIGNADO' ? ' · recogido' : ''}</div>
          <i className="mx-auto my-1 h-5 w-0.5 bg-line" />
          <div />
          <i className="mt-2 h-2.5 w-2.5 rounded-full bg-ink" />
          <div>
            <h1 className="num text-[21px] font-semibold leading-tight">{order.direccion}</h1>
            {order.referencia && <p className="text-sm text-ink-soft">{order.referencia}</p>}
          </div>
        </div>

        <a href={`https://waze.com/ul?ll=${order.lat},${order.lng}&navigate=yes`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 text-[15px] font-medium text-blue">
          <Navigation size={17} /> Abrir en Waze o Maps
        </a>

        <section className="rounded-[20px] bg-card px-4 shadow-card">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{order.clienteNombre}</div>
              <div className="text-[13px] text-ink-soft">Cliente</div>
            </div>
            <div className="flex flex-none gap-2">
              <a href={`tel:${order.clienteTelefono}`} aria-label={`Llamar a ${order.clienteNombre}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-blue"><Phone size={19} /></a>
              <a href={`https://wa.me/51${order.clienteTelefono}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${order.clienteNombre}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-blue"><MessageCircle size={19} /></a>
            </div>
          </div>
          <div className="flex justify-between gap-4 border-t border-line py-3 text-sm"><span className="text-ink-soft">Paquete</span><span className="text-right"><PaqueteBadge paquete={order.paquete} /></span></div>
          <div className="border-t border-line py-3 text-sm">
            <div className="text-ink-soft">Productos ({order.items.length})</div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {order.items.map((it, idx) => (
                <li key={idx} className="flex justify-between gap-3"><span>{it.nombre}</span><span className="tabular-nums text-ink-soft">×{it.cantidad}</span></li>
              ))}
            </ul>
          </div>
          {order.recibe && order.recibe !== 'el mismo cliente' && (
            <div className="flex justify-between gap-4 border-t border-line py-3 text-sm"><span className="text-ink-soft">Recibe</span><span className="text-right font-medium">{order.recibe}</span></div>
          )}
          {order.nota && (
            <div className="border-t border-line py-3 text-sm"><span className="text-ink-soft">Nota del cliente</span><p className="mt-0.5 font-medium">{order.nota}</p></div>
          )}
        </section>
      </div>

      {transition && (
        <div className="relative z-[600] border-t border-line bg-bg px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
          {order.status === 'DISPONIBLE' ? (
            <HoldClaimButton className="h-[52px] w-full text-base" disabled={sending} onConfirm={confirmAdvance} label="Tomar pedido" />
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
