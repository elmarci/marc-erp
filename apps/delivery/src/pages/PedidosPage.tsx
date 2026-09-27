import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Banknote, Bell, CheckCircle2, Clock, CloudRain, List, MapIcon, Navigation, Package, RefreshCw, Wallet } from 'lucide-react'
import { fetchAvailableOrders, fetchMyOrders, claimOrder, claimOrders } from '../mockApi'
import { fetchViaAlert } from '../lib/weather'
import { resolveRoute, estimarSeparados } from '../lib/routing'
import { useRiderLocation } from '../hooks/useRiderLocation'
import { RouteMap } from '../components/RouteMap'
import { PrimaryButton } from '../components/PrimaryButton'
import { ConfirmSheet } from '../components/ConfirmSheet'
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

export function PedidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<Tab>('disponibles')
  const [orden, setOrden] = useState<Orden>('cercania')
  const [pago, setPago] = useState<Pago>('todos')
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [claimingOrder, setClaimingOrder] = useState<DeliveryOrder | null>(null)
  const [claiming, setClaiming] = useState(false)
  const riderPos = useRiderLocation()

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

  const confirmClaim = async () => {
    if (!claimingOrder) return
    setClaiming(true)
    try {
      await claimOrder(claimingOrder.id)
      invalidateOrderLists()
      toast.success('Pedido tomado — ya es tuyo.')
      navigate(`/pedidos/${claimingOrder.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo tomar el pedido')
    } finally {
      setClaiming(false)
      setClaimingOrder(null)
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
        toast.success(tomados.length === 1 ? 'Pedido tomado.' : `Tomaste ${tomados.length} pedidos.`)
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
  // cliente que solo pasa por sus manos camino a la tienda). No se resta
  // gasolina ni ningún otro costo — calcular la rentabilidad real depende
  // de más variables de las que esta app puede saber con certeza, así que
  // solo se muestra el monto real que se va a ganar, sin adornarlo.
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
      <div className="flex items-center justify-between px-6 pb-3 pt-6">
        <div className="font-display text-2xl font-extrabold">Pedidos</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-paper-surface px-3 py-1.5">
            <div className="h-2 w-2 rounded-full bg-brand-green-500" />
            <span className="text-[13px] font-bold">En servicio</span>
          </div>
          <button
            onClick={() => setVista(vista === 'lista' ? 'mapa' : 'lista')}
            aria-label={vista === 'lista' ? 'Ver mapa' : 'Ver lista de pedidos'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-surface"
          >
            {vista === 'lista' ? <MapIcon size={17} /> : <List size={17} />}
          </button>
        </div>
      </div>

      <div className="flex gap-2 px-5 pb-2">
        <button
          onClick={() => cambiarTab('disponibles')}
          className={cn(
            'flex-1 rounded-full py-2.5 text-[13px] font-extrabold transition-colors',
            tab === 'disponibles' ? 'bg-brand-green-700 text-white' : 'bg-paper-surface text-paper-ink-soft',
          )}
        >
          Disponibles{disponibles && disponibles.length > 0 ? ` (${disponibles.length})` : ''}
        </button>
        <button
          onClick={() => cambiarTab('mis')}
          className={cn(
            'flex-1 rounded-full py-2.5 text-[13px] font-extrabold transition-colors',
            tab === 'mis' ? 'bg-brand-green-700 text-white' : 'bg-paper-surface text-paper-ink-soft',
          )}
        >
          Mis pedidos{misPedidos && misPedidos.length > 0 ? ` (${misPedidos.length})` : ''}
        </button>
      </div>

      {vista === 'lista' && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
          {ORDEN_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setOrden(key)}
              className={cn(
                'flex-shrink-0 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors',
                orden === key ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
              )}
            >
              {label}
            </button>
          ))}
          <div className="mx-1 w-px flex-shrink-0 bg-paper-line" />
          <button
            onClick={() => setPago(pago === 'efectivo' ? 'todos' : 'efectivo')}
            className={cn(
              'flex flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors',
              pago === 'efectivo' ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
            )}
          >
            <Banknote size={14} />
            Efectivo
          </button>
          <button
            onClick={() => setPago(pago === 'online' ? 'todos' : 'online')}
            className={cn(
              'flex flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors',
              pago === 'online' ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
            )}
          >
            <CheckCircle2 size={14} />
            Ya pagado
          </button>
        </div>
      )}

      {!online && (
        <div className="mx-5 mt-2 flex items-center gap-2.5 rounded-2xl border border-brand-achiote-100 bg-brand-achiote-50 px-3.5 py-3">
          <RefreshCw size={18} className="flex-shrink-0 animate-spin text-brand-achiote-500" />
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
            viaAlert.nivel === 'alerta' ? 'border-brand-magenta-100 bg-brand-magenta-50' : 'border-brand-achiote-100 bg-brand-achiote-50',
          )}
        >
          <CloudRain size={18} className={cn('flex-shrink-0', viaAlert.nivel === 'alerta' ? 'text-brand-magenta-500' : 'text-brand-achiote-500')} />
          <span className="text-[13px] font-extrabold leading-snug">{viaAlert.mensaje}</span>
        </div>
      )}

      {vista === 'mapa' && (
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5 pt-3.5">
          <RouteMap
            riderPos={riderPos}
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
            <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-brand-green-100 bg-brand-green-50 p-[18px]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold uppercase tracking-wide text-brand-green-700">
                  Ruta sugerida · {routeInfo.totalKm.toFixed(1)} km · ~{Math.round(routeInfo.totalMin)} min
                </div>
                {!routeInfo.esReal && (
                  <span className="flex-shrink-0 rounded-full bg-brand-achiote-50 px-2 py-0.5 text-[10px] font-extrabold text-brand-achiote-600">
                    Estimado
                  </span>
                )}
              </div>

              {separados && (
                <div className="text-[11px] font-semibold text-brand-green-700">
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
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-green-700 text-xs font-extrabold text-white">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold">
                          <span className="text-paper-ink-soft">{o.numero}</span> · {o.direccion}
                        </div>
                        <div className="text-[11px] font-semibold text-paper-ink-soft">
                          {leg.distanciaKm.toFixed(1)} km · {Math.round(leg.duracionMin)} min · llegas ~
                          {eta.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs font-extrabold text-brand-green-700">S/ {o.tarifaReparto.toFixed(2)}</div>
                    </div>
                  )
                })}
              </div>

              {tab === 'disponibles' ? (
                <PrimaryButton className="w-full" disabled={claiming} onClick={confirmClaimBatch}>
                  {claiming ? 'Tomando…' : routeInfo.ruta.length === 1 ? 'Tomar este pedido' : `Tomar estos ${routeInfo.ruta.length} pedidos`}
                </PrimaryButton>
              ) : (
                <PrimaryButton className="w-full" onClick={() => navigate(`/pedidos/${routeInfo.ruta[0].id}`)}>
                  Empezar por aquí
                </PrimaryButton>
              )}
            </div>
          )}
        </div>
      )}

      {vista === 'lista' && (
        <div className={cn('no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-5 pt-3.5', !online && 'opacity-70')}>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3.5 rounded-[20px] border-[1.5px] border-paper-line p-[18px]">
                <div className="flex justify-between">
                  <div className="h-[18px] w-[180px] animate-shimmer rounded-lg bg-paper-surface" />
                  <div className="h-[14px] w-11 animate-shimmer rounded-lg bg-paper-surface" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-6 w-[100px] animate-shimmer rounded-full bg-paper-surface" />
                  <div className="h-[22px] w-[70px] animate-shimmer rounded-lg bg-paper-surface" />
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
              {visibles.map((o) => (
                <button
                  key={o.id}
                  onClick={() => (tab === 'disponibles' ? setClaimingOrder(o) : navigate(`/pedidos/${o.id}`))}
                  className={cn(
                    'relative block animate-enter-up rounded-[20px] border-[1.5px] bg-white p-[18px] text-left shadow-sm transition-transform active:scale-[0.98]',
                    o.isNew ? 'border-brand-magenta-100' : 'border-paper-line',
                  )}
                >
                  {o.isNew && (
                    <div className="absolute -top-2.5 right-4 rounded-full bg-brand-magenta-500 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
                      NUEVO
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wide text-paper-ink-soft">{o.numero}</div>
                      <div className="text-[17px] font-extrabold leading-snug">{o.direccion}</div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 pt-0.5">
                      <Navigation size={14} className="text-paper-ink-soft" />
                      <span className="text-[13px] font-bold text-paper-ink-soft">{o.distanciaKm} km</span>
                    </div>
                  </div>
                  <div className="h-2.5" />
                  <div className="flex items-center justify-between">
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1.5',
                        o.esperaMin >= 14 ? 'bg-brand-achiote-50' : 'bg-brand-green-50',
                      )}
                    >
                      <Clock size={13} className={o.esperaMin >= 14 ? 'text-brand-achiote-500' : 'text-brand-green-600'} />
                      <span className={cn('text-xs font-extrabold', o.esperaMin >= 14 ? 'text-brand-achiote-500' : 'text-brand-green-600')}>
                        Esperando {o.esperaMin} min
                      </span>
                    </div>
                    {o.contraEntrega ? (
                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-paper-ink-soft">Cobrar</div>
                        <div className="font-display text-xl font-extrabold">S/ {o.monto.toFixed(2)}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full bg-brand-green-50 px-3 py-1.5">
                        <CheckCircle2 size={13} className="text-brand-green-600" />
                        <span className="text-xs font-extrabold text-brand-green-600">Pagado online</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-dashed border-paper-line pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <Wallet size={13} className="text-brand-green-600" />
                      <span className="text-xs font-bold text-paper-ink-soft">
                        Tarifa: <span className="font-extrabold text-brand-green-600">S/ {o.tarifaReparto.toFixed(2)}</span>
                      </span>
                    </div>
                    {tab === 'disponibles' && (
                      <span className="text-xs font-extrabold text-brand-green-700">Tomar pedido →</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {claimingOrder && (
        <ConfirmSheet
          title="¿Tomar este pedido?"
          description={`${claimingOrder.direccion} · ${claimingOrder.distanciaKm} km · te pagan S/ ${claimingOrder.tarifaReparto.toFixed(2)} por el viaje.`}
          confirmLabel={claiming ? 'Tomando…' : 'Tomar pedido'}
          onConfirm={confirmClaim}
          onCancel={() => setClaimingOrder(null)}
        />
      )}
    </div>
  )
}
