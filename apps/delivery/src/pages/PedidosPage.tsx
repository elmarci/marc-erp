import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Banknote, Bell, CheckCircle2, Clock, CloudRain, List, MapIcon, Package, RefreshCw, Wallet } from 'lucide-react'
import { fetchAvailableOrders, fetchMyOrders, claimOrder, claimOrders, releaseOrder } from '../api'
import { fetchViaAlert } from '../lib/weather'
import { resolveRoute, estimarSeparados, VELOCIDAD_MOTO_KMH } from '../lib/routing'
import { useRiderLocation } from '../hooks/useRiderLocation'
import { useAuthStore } from '../authStore'
import { RouteMap } from '../components/RouteMap'
import { TopBar } from '../components/TopBar'
import { HoldClaimButton } from '../components/HoldClaimButton'
import { PaqueteBadge } from '../components/PaqueteBadge'
import type { DeliveryOrder } from '../types'
import { cn } from '../lib/cn'

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

type Tab = 'disponibles' | 'mis'
type Orden = 'cercania' | 'pago' | 'urgencia'
type Pago = 'todos' | 'efectivo' | 'online'

const ORDEN_OPTIONS: { key: Orden; label: string }[] = [
  { key: 'cercania', label: 'Más cerca' },
  { key: 'pago', label: 'Mejor pago' },
  { key: 'urgencia', label: 'Más urgente' },
]

// Color de la pestaña triangular de cada ticket — una pista visual rápida,
// no solo decorativa: naranja = nuevo, azul = ya pagado, verde = el resto.
function tabColor(o: DeliveryOrder): string {
  if (o.isNew) return '#c9552a'
  if (!o.contraEntrega) return '#2460b4'
  return '#2f6c12'
}

export function PedidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<Tab>('disponibles')
  const [orden, setOrden] = useState<Orden>('cercania')
  const [pago, setPago] = useState<Pago>('todos')
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [claiming, setClaiming] = useState(false)
  const [tomandoIds, setTomandoIds] = useState<Set<string>>(new Set())
  const riderPos = useRiderLocation()
  const iniciales = useAuthStore((s) => s.iniciales)

  // Bolsa abierta: "Disponibles" es de cualquiera en servicio (primero que
  // toca, se lo lleva); "Mis pedidos" es lo que este repartidor ya captó y
  // sigue trabajando. Invalidar ambas listas siempre que algo cambie de una
  // a otra evita que un pedido aparezca duplicado o desincronizado.
  const { data: disponibles, isLoading: loadingDisponibles, dataUpdatedAt } = useQuery({
    queryKey: ['orders-disponibles'],
    queryFn: fetchAvailableOrders,
    refetchInterval: 15000,
  })
  const { data: misPedidos, isLoading: loadingMisPedidos } = useQuery({
    queryKey: ['orders-mios'],
    queryFn: fetchMyOrders,
    refetchInterval: 15000,
  })

  const orders = tab === 'disponibles' ? disponibles : misPedidos
  const isLoading = tab === 'disponibles' ? loadingDisponibles : loadingMisPedidos

  // Aviso de vía específico de moto — se apaga solo (null) si la API falla
  // o si no hay nada que avisar; nunca bloquea ni interrumpe al repartidor.
  const { data: viaAlert } = useQuery({
    queryKey: ['via-alert'],
    queryFn: fetchViaAlert,
    staleTime: 1000 * 60 * 15,
    retry: false,
  })

  const newCount = tab === 'disponibles' ? (disponibles ?? []).filter((o) => o.isNew).length : 0

  const elegidos = useMemo(() => (orders ?? []).filter((o) => seleccionados.has(o.id)), [orders, seleccionados])
  // Ronda la posición para no disparar una llamada de ruteo por cada tick de
  // GPS — solo cuando la selección cambia o el repartidor se movió ~100m+.
  const riderKey = `${riderPos.lat.toFixed(3)},${riderPos.lng.toFixed(3)}`
  const { data: routeInfo, isFetching: routeLoading } = useQuery({
    queryKey: ['route', elegidos.map((o) => o.id).sort().join(','), riderKey],
    queryFn: () => resolveRoute(riderPos, elegidos),
    enabled: elegidos.length > 0,
    staleTime: 20000,
  })
  const { data: separados } = useQuery({
    queryKey: ['separados', elegidos.map((o) => o.id).sort().join(','), riderKey],
    queryFn: () => estimarSeparados(riderPos, elegidos),
    enabled: elegidos.length > 1,
    staleTime: 20000,
  })

  const invalidateOrderLists = () => {
    queryClient.invalidateQueries({ queryKey: ['orders-disponibles'] })
    queryClient.invalidateQueries({ queryKey: ['orders-mios'] })
  }

  // El sello deja de ser decoración: mantener presionado (HoldClaimButton) es
  // ahora la propia acción de captura — sin diálogo antes, con "Deshacer" 5s
  // después. Reemplaza tanto el tap directo como el tap+ConfirmSheet previos.
  const holdClaim = async (o: DeliveryOrder) => {
    if (tomandoIds.has(o.id)) return
    setTomandoIds((prev) => new Set(prev).add(o.id))
    try {
      await claimOrder(o.id)
      invalidateOrderLists()
      toast.success(`${o.numero} tomado — ya es tuyo.`, {
        duration: 5000,
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await releaseOrder(o.id)
            invalidateOrderLists()
          },
        },
      })
      navigate(`/pedidos/${o.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo tomar el pedido')
    } finally {
      setTomandoIds((prev) => {
        const next = new Set(prev)
        next.delete(o.id)
        return next
      })
    }
  }

  const confirmClaimBatch = async () => {
    const ids = [...seleccionados]
    setClaiming(true)
    try {
      const { tomados, fallidos } = await claimOrders(ids)
      invalidateOrderLists()
      if (fallidos.length > 0) {
        toast.error(fallidos.length === 1 ? 'Ese pedido ya lo tomó otro repartidor' : `${fallidos.length} pedidos ya los tomó otro repartidor`)
      }
      if (tomados.length > 0) {
        toast.success(tomados.length === 1 ? 'Pedido tomado.' : `Tomaste ${tomados.length} pedidos.`, {
          duration: 5000,
          action: {
            label: 'Deshacer',
            onClick: async () => {
              await Promise.all(tomados.map((o) => releaseOrder(o.id)))
              invalidateOrderLists()
            },
          },
        })
        const primeroId = routeInfo?.ruta[0]?.id ?? tomados[0].id
        setSeleccionados(new Set())
        navigate(`/pedidos/${primeroId}`)
      }
    } finally {
      setClaiming(false)
    }
  }

  // Fix pedido del dueño: "mejores filtros, darles herramientas para
  // trabajar" — el repartidor decide con qué pedido conviene salir, no solo
  // recibe uno a ciegas. `pago` ordena/filtra por la tarifa real que le paga
  // la empresa (`tarifaReparto`), nunca por `monto` (eso es plata del
  // cliente que solo pasa por sus manos camino a la tienda).
  const visibles = useMemo(() => {
    let list = orders ?? []
    if (pago === 'efectivo') list = list.filter((o) => o.contraEntrega)
    if (pago === 'online') list = list.filter((o) => !o.contraEntrega)

    const ordenados = [...list]
    ordenados.sort((a, b) => {
      if (orden === 'cercania') return a.distanciaKm - b.distanciaKm
      if (orden === 'pago') return b.tarifaReparto - a.tarifaReparto
      return b.esperaMin - a.esperaMin
    })
    return ordenados
  }, [orders, pago, orden])

  const cambiarTab = (t: Tab) => {
    setTab(t)
    setSeleccionados(new Set())
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title="PEDIDOS" subtitle={`${disponibles?.length ?? 0} disponibles · Manchay`} />

      <div className="flex gap-2 px-5 pb-2">
        <button
          onClick={() => cambiarTab('disponibles')}
          className={cn(
            'font-display flex-1 rounded-xl py-2.5 text-[13px] font-extrabold transition-colors',
            tab === 'disponibles' ? 'bg-accent-green text-[#12250a]' : 'bg-paper-surface text-paper-ink-faint',
          )}
        >
          DISPONIBLES{disponibles && disponibles.length > 0 ? ` (${disponibles.length})` : ''}
        </button>
        <button
          onClick={() => cambiarTab('mis')}
          className={cn(
            'font-display flex-1 rounded-xl py-2.5 text-[13px] font-extrabold transition-colors',
            tab === 'mis' ? 'bg-accent-green text-[#12250a]' : 'bg-paper-surface text-paper-ink-faint',
          )}
        >
          MIS PEDIDOS{misPedidos && misPedidos.length > 0 ? ` (${misPedidos.length})` : ''}
        </button>
        <button
          onClick={() => setVista(vista === 'lista' ? 'mapa' : 'lista')}
          aria-label={vista === 'lista' ? 'Ver mapa' : 'Ver lista de pedidos'}
          className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl bg-paper-surface"
        >
          {vista === 'lista' ? <MapIcon size={16} className="text-paper-ink-soft" /> : <List size={16} className="text-paper-ink-soft" />}
        </button>
      </div>

      {vista === 'lista' && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
          {ORDEN_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOrden(key)}
              className={cn(
                'font-display flex-shrink-0 rounded-full px-3.5 py-2 text-[12px] font-extrabold tracking-wide transition-colors',
                orden === key ? 'bg-paper-ink text-paper-bg' : 'bg-paper-surface text-paper-ink-faint',
              )}
            >
              {label.toUpperCase()}
            </button>
          ))}
          <div className="mx-1 w-px flex-shrink-0 bg-paper-line" />
          <button
            onClick={() => setPago(pago === 'efectivo' ? 'todos' : 'efectivo')}
            className={cn(
              'font-display flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-extrabold tracking-wide transition-colors',
              pago === 'efectivo' ? 'bg-paper-ink text-paper-bg' : 'bg-paper-surface text-paper-ink-faint',
            )}
          >
            <Banknote size={13} />
            EFECTIVO
          </button>
          <button
            onClick={() => setPago(pago === 'online' ? 'todos' : 'online')}
            className={cn(
              'font-display flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-extrabold tracking-wide transition-colors',
              pago === 'online' ? 'bg-paper-ink text-paper-bg' : 'bg-paper-surface text-paper-ink-faint',
            )}
          >
            <CheckCircle2 size={13} />
            YA PAGADO
          </button>
        </div>
      )}

      {!online && (
        <div className="mx-5 mt-2 flex items-center gap-2.5 rounded-2xl border border-brand-achiote-700/40 bg-brand-achiote-900/30 px-3.5 py-3">
          <RefreshCw size={18} className="flex-shrink-0 animate-spin text-accent-achiote" />
          <div className="flex flex-col">
            <span className="text-[13px] font-extrabold">Sin conexión. Reintentando…</span>
            <span className="text-xs font-medium text-paper-ink-soft">
              Mostrando datos de {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : 'antes'}
            </span>
          </div>
        </div>
      )}

      {viaAlert && (
        <div
          className={cn(
            'mx-5 mt-2 flex items-center gap-2.5 rounded-2xl border px-3.5 py-3',
            viaAlert.nivel === 'alerta' ? 'border-brand-magenta-700/40 bg-brand-magenta-900/30' : 'border-brand-achiote-700/40 bg-brand-achiote-900/30',
          )}
        >
          <CloudRain size={18} className={cn('flex-shrink-0', viaAlert.nivel === 'alerta' ? 'text-brand-magenta-400' : 'text-accent-achiote')} />
          <span className="text-[13px] font-extrabold leading-snug">{viaAlert.mensaje}</span>
        </div>
      )}

      {vista === 'mapa' && (
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5 pt-3.5">
          <RouteMap
            riderPos={riderPos}
            riderIniciales={iniciales}
            orders={orders ?? []}
            selected={seleccionados}
            ordenVisita={routeInfo?.ruta.map((o) => o.id) ?? []}
            routeGeometry={routeInfo?.geometry ?? []}
            onToggle={(id) => {
              setSeleccionados((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
          />
          <div className="text-xs leading-snug text-paper-ink-soft">
            {tab === 'disponibles'
              ? 'Toca los pedidos que te convenga captar juntos — te armamos la ruta real y el orden más rápido para visitarlos.'
              : 'Toca los pedidos que quieras hacer juntos — te armamos la ruta real y el orden más rápido para visitarlos.'}
          </div>

          {seleccionados.size > 0 && routeLoading && (
            <div className="flex items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-paper-line p-[18px] text-sm font-bold text-paper-ink-soft">
              <RefreshCw size={16} className="animate-spin" />
              Calculando ruta…
            </div>
          )}

          {seleccionados.size > 0 && routeInfo && routeInfo.ruta.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-brand-green-700/50 bg-brand-green-900/25 p-[18px]">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-xs font-extrabold uppercase tracking-wide text-accent-green">
                  Ruta sugerida · {routeInfo.totalKm.toFixed(1)} km · ~{Math.round(routeInfo.totalMin)} min
                </div>
                {!routeInfo.esReal && (
                  <span className="flex-shrink-0 rounded-full bg-brand-achiote-900/40 px-2 py-0.5 text-[10px] font-extrabold text-accent-achiote">
                    Estimado
                  </span>
                )}
              </div>

              {separados && (
                <div className="text-[11px] font-semibold text-accent-green">
                  Separados serían ~{separados.km.toFixed(1)} km / {Math.round(separados.min)} min — juntos ahorras ~
                  {Math.max(0, separados.km - routeInfo.totalKm).toFixed(1)} km.
                </div>
              )}

              <div className="flex flex-col gap-3">
                {routeInfo.ruta.map((o, i) => {
                  const leg = routeInfo.legs[i]
                  if (!leg) return null
                  const etaMin = routeInfo.legs.slice(0, i + 1).reduce((s, l) => s + l.duracionMin, 0)
                  const eta = new Date(Date.now() + etaMin * 60000)
                  return (
                    <div key={o.id} className="flex items-center gap-2.5">
                      <div className="font-display flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-extrabold text-[#12250a]">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold">
                          <span className="text-paper-ink-faint">{o.numero}</span> · {o.direccion}
                        </div>
                        <div className="text-[11px] font-semibold text-paper-ink-faint">
                          {leg.distanciaKm.toFixed(1)} km · {Math.round(leg.duracionMin)} min · llegas ~
                          {eta.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="font-display flex-shrink-0 text-xs font-extrabold text-accent-green">S/ {o.tarifaReparto.toFixed(2)}</div>
                    </div>
                  )
                })}
              </div>

              {tab === 'disponibles' ? (
                <HoldClaimButton
                  className="w-full text-center"
                  disabled={claiming}
                  onConfirm={confirmClaimBatch}
                  label={routeInfo.ruta.length === 1 ? 'TOMAR ESTE PEDIDO' : `TOMAR ESTOS ${routeInfo.ruta.length} PEDIDOS`}
                />
              ) : (
                <button
                  onClick={() => navigate(`/pedidos/${routeInfo.ruta[0].id}`)}
                  className="font-display w-full rounded-xl bg-brand-green-700 py-3.5 text-[15px] font-extrabold text-white"
                >
                  EMPEZAR POR AQUÍ
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {vista === 'lista' && (
        <div className={cn('no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-1', !online && 'opacity-70')}>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3.5 rounded-[18px] bg-paper-surface p-[18px]">
                <div className="flex justify-between">
                  <div className="h-[18px] w-[180px] animate-shimmer rounded-lg bg-paper-raised" />
                  <div className="h-[14px] w-11 animate-shimmer rounded-lg bg-paper-raised" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-6 w-[100px] animate-shimmer rounded-full bg-paper-raised" />
                  <div className="h-[22px] w-[70px] animate-shimmer rounded-lg bg-paper-raised" />
                </div>
              </div>
            ))
          ) : visibles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-paper-surface">
                <Package size={44} strokeWidth={1.8} className="text-paper-ink-ghost" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="font-display text-[19px] font-extrabold">
                  {orders && orders.length > 0
                    ? 'Ningún pedido calza con este filtro'
                    : tab === 'disponibles' ? 'Sin pedidos en la bolsa por ahora' : 'No tienes pedidos en curso'}
                </div>
                <div className="text-sm leading-snug text-paper-ink-soft">
                  {orders && orders.length > 0
                    ? 'Prueba con "Todos" en el filtro de pago'
                    : tab === 'disponibles' ? 'Te avisaremos apenas caiga uno nuevo a la zona' : 'Ve a "Disponibles" para captar uno'}
                </div>
              </div>
            </div>
          ) : (
            <>
              {newCount > 0 && (
                <div className="flex animate-enter-up items-center gap-2 self-start rounded-full bg-brand-magenta-500 px-4 py-2.5">
                  <Bell size={16} className="text-white" />
                  <span className="text-[13px] font-extrabold text-white">
                    {newCount === 1 ? '1 pedido nuevo' : `${newCount} pedidos nuevos`}
                  </span>
                </div>
              )}
              {visibles.map((o) => {
                const minEstimado = Math.round((o.distanciaKm / VELOCIDAD_MOTO_KMH) * 60)
                const contenido = (
                  <>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-paper-ink-faint">
                      {o.numero}
                      {o.isNew && ' · NUEVO'}
                    </div>
                    <div className="mt-0.5 text-[18px] font-extrabold leading-snug text-paper-ink">{o.direccion}</div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <PaqueteBadge paquete={o.paquete} compact />
                      <div
                        className={cn(
                          'flex items-center gap-1 rounded-lg px-2.5 py-1',
                          o.esperaMin >= 14 ? 'bg-brand-achiote-900/40' : 'bg-paper-raised',
                        )}
                      >
                        <Clock size={11} className={o.esperaMin >= 14 ? 'text-accent-achiote' : 'text-paper-ink-soft'} />
                        <span className={cn('text-[11px] font-extrabold', o.esperaMin >= 14 ? 'text-accent-achiote' : 'text-paper-ink-soft')}>
                          {o.esperaMin} min
                        </span>
                      </div>
                      {o.contraEntrega ? (
                        <div className="flex items-center gap-1 rounded-lg bg-paper-raised px-2.5 py-1">
                          <Wallet size={11} className="text-paper-ink-soft" />
                          <span className="text-[11px] font-extrabold text-paper-ink-soft">COBRAR S/{o.monto.toFixed(0)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 rounded-lg bg-paper-raised px-2.5 py-1">
                          <CheckCircle2 size={11} className="text-accent-green" />
                          <span className="text-[11px] font-extrabold text-accent-green">PAGADO ONLINE</span>
                        </div>
                      )}
                    </div>
                    <div className="my-3.5 h-px bg-paper-line" />
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wide text-paper-ink-faint">
                          {o.distanciaKm} KM · ~{minEstimado} MIN
                        </div>
                        <div className="font-display text-[30px] font-extrabold leading-none text-accent-green">S/{o.tarifaReparto.toFixed(2)}</div>
                      </div>
                      {tab === 'disponibles' ? (
                        <HoldClaimButton onConfirm={() => holdClaim(o)} disabled={tomandoIds.has(o.id)} label="TOMAR" />
                      ) : (
                        <div className="font-display rounded-xl bg-brand-blue-500 px-5 py-3.5 text-[14px] font-extrabold text-white">VER →</div>
                      )}
                    </div>
                  </>
                )

                return (
                  <div key={o.id} className="relative animate-enter-up">
                    <div className="ticket-tab" style={{ borderColor: `transparent ${tabColor(o)} transparent transparent` }} />
                    {tab === 'mis' ? (
                      <button onClick={() => navigate(`/pedidos/${o.id}`)} className="ticket-cut w-full bg-paper-surface p-[18px] text-left">
                        {contenido}
                      </button>
                    ) : (
                      <div className="ticket-cut bg-paper-surface p-[18px]">{contenido}</div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
