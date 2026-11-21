import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, ChevronUp, CloudRain, Package, RefreshCw, WifiOff } from 'lucide-react'
import { fetchAvailableOrders, fetchMyOrders, claimOrder, claimOrders, releaseOrder } from '../api'
import { fetchViaAlert } from '../lib/weather'
import { resolveRoute, estimarSeparados, VELOCIDAD_MOTO_KMH } from '../lib/routing'
import { useRiderLocation } from '../hooks/useRiderLocation'
import { useAuthStore } from '../authStore'
import { RouteMap } from '../components/RouteMap'
import { AppHeader, HeaderTabs } from '../components/AppHeader'
import { RoadStrip } from '../components/RoadStrip'
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

type Tab = 'disponibles' | 'mis' | 'mapa'
type Orden = 'cercania' | 'pago' | 'urgencia'
type Pago = 'todos' | 'efectivo' | 'online'

const ORDEN_OPTIONS: { key: Orden; label: string }[] = [
  { key: 'cercania', label: 'Más cerca' },
  { key: 'pago', label: 'Mejor pago' },
  { key: 'urgencia', label: 'Más urgente' },
]

const ESTADO_EN_CURSO: Record<string, string> = { ASIGNADO: 'Por recoger', RECOGIDO: 'Recogido', EN_CAMINO: 'En camino' }

const fmtDist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)
const hace = (min: number) => (min < 1 ? 'recién' : `hace ${min} min`)

export function PedidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<Tab>('disponibles')
  const [orden, setOrden] = useState<Orden>('cercania')
  const [pago, setPago] = useState<Pago>('todos')
  const [abierto, setAbierto] = useState<string | null>(null)
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

  // El mapa trabaja sobre la última lista elegida (Disponibles o En curso).
  const [base, setBase] = useState<'disponibles' | 'mis'>('disponibles')
  const lista = tab === 'mapa' ? base : tab
  const vista = tab === 'mapa' ? 'mapa' : 'lista'
  const orders = lista === 'disponibles' ? disponibles : misPedidos
  const isLoading = lista === 'disponibles' ? loadingDisponibles : loadingMisPedidos

  // Aviso de vía específico de moto — se apaga solo (null) si la API falla
  // o si no hay nada que avisar; nunca bloquea ni interrumpe al repartidor.
  const { data: viaAlert } = useQuery({
    queryKey: ['via-alert'],
    queryFn: fetchViaAlert,
    staleTime: 1000 * 60 * 15,
    retry: false,
  })

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
      toast.success(`Tomaste ${o.numero}.`, {
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
    if (t !== 'mapa') setBase(t)
    setTab(t)
    setSeleccionados(new Set())
    setAbierto(null)
  }

  const enCurso = (misPedidos ?? []).length

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <HeaderTabs<Tab>
          value={tab}
          onChange={cambiarTab}
          tabs={[
            ['disponibles', `Disponibles${disponibles ? ` · ${disponibles.length}` : ''}`],
            ['mis', `En curso${enCurso ? ` · ${enCurso}` : ''}`],
            ['mapa', 'Mapa'],
          ]}
        />
      </AppHeader>

      {!online && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-card">
          <WifiOff size={18} className="flex-none text-ink-soft" />
          <div className="text-sm">
            <div className="font-semibold">Sin conexión. Reintentando…</div>
            <div className="text-ink-soft">Datos de las {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '–'}</div>
          </div>
        </div>
      )}

      {viaAlert && (
        <div className={cn('mx-4 mt-3 flex items-center gap-3 rounded-2xl px-4 py-3', viaAlert.nivel === 'alerta' ? 'bg-warn-soft text-warn' : 'bg-card shadow-card')}>
          <CloudRain size={18} className="flex-none" />
          <span className="text-sm font-medium leading-snug">{viaAlert.mensaje}</span>
        </div>
      )}

      {vista === 'lista' && (
        <div className="no-scrollbar flex flex-none gap-1 overflow-x-auto px-4 pt-3">
          {ORDEN_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => setOrden(key)}
              className={cn('h-8 flex-none rounded-full px-3 text-[13px]', orden === key ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
              {label}
            </button>
          ))}
          <span className="mx-1 my-2 w-px flex-none bg-line" />
          <button onClick={() => setPago(pago === 'efectivo' ? 'todos' : 'efectivo')}
            className={cn('h-8 flex-none rounded-full px-3 text-[13px]', pago === 'efectivo' ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
            Cobro en efectivo
          </button>
          <button onClick={() => setPago(pago === 'online' ? 'todos' : 'online')}
            className={cn('h-8 flex-none rounded-full px-3 text-[13px]', pago === 'online' ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
            Ya pagado
          </button>
        </div>
      )}

      {vista === 'mapa' && (
        <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-5 pt-3">
          <div className="flex gap-1">
            {(['disponibles', 'mis'] as const).map((b) => (
              <button key={b} onClick={() => { setBase(b); setSeleccionados(new Set()) }}
                className={cn('h-8 rounded-full px-3 text-[13px]', base === b ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
                {b === 'disponibles' ? 'Disponibles' : 'En curso'}
              </button>
            ))}
          </div>
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
          <p className="text-[13px] leading-snug text-ink-soft">
            Toca los pedidos que quieras llevar juntos. Te armamos la ruta y el orden más rápido.
          </p>

          {seleccionados.size > 0 && routeLoading && (
            <div className="flex items-center justify-center gap-2 rounded-[20px] bg-card p-4 text-sm text-ink-soft shadow-card">
              <RefreshCw size={16} className="animate-spin" /> Calculando ruta…
            </div>
          )}

          {seleccionados.size > 0 && routeInfo && routeInfo.ruta.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold">Ruta sugerida</div>
                <div className="text-sm tabular-nums text-ink-soft">
                  {routeInfo.totalKm.toFixed(1)} km · {Math.round(routeInfo.totalMin)} min{!routeInfo.esReal && ' · estimado'}
                </div>
              </div>
              {separados && (
                <div className="text-[13px] text-ink-soft">
                  Por separado serían {separados.km.toFixed(1)} km. Juntos ahorras {Math.max(0, separados.km - routeInfo.totalKm).toFixed(1)} km.
                </div>
              )}
              <ol className="flex flex-col">
                {routeInfo.ruta.map((o, i) => {
                  const leg = routeInfo.legs[i]
                  if (!leg) return null
                  const etaMin = routeInfo.legs.slice(0, i + 1).reduce((acc, l) => acc + l.duracionMin, 0)
                  const eta = new Date(Date.now() + etaMin * 60000)
                  return (
                    <li key={o.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{o.direccion}</div>
                        <div className="text-[13px] tabular-nums text-ink-soft">
                          {leg.distanciaKm.toFixed(1)} km · llegas {eta.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <span className="num flex-none text-[15px] font-semibold">S/ {o.tarifaReparto.toFixed(2)}</span>
                    </li>
                  )
                })}
              </ol>
              {base === 'disponibles' ? (
                <HoldClaimButton
                  className="h-[52px] w-full text-base"
                  disabled={claiming}
                  onConfirm={confirmClaimBatch}
                  label={routeInfo.ruta.length === 1 ? 'Tomar este pedido' : `Tomar estos ${routeInfo.ruta.length} pedidos`}
                />
              ) : (
                <button onClick={() => navigate(`/pedidos/${routeInfo.ruta[0].id}`)} className="h-[52px] w-full rounded-[14px] bg-blue text-base font-semibold text-white">
                  Empezar por aquí
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {vista === 'lista' && (
        <div className={cn('no-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-5 pt-3', !online && 'opacity-70')}>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
                <div className="h-3 w-28 animate-shimmer rounded bg-line" />
                <div className="h-5 w-52 animate-shimmer rounded bg-line" />
                <div className="h-3 w-full animate-shimmer rounded bg-line" />
              </div>
            ))
          ) : visibles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <Package size={40} strokeWidth={1.5} className="text-ink-ghost" />
              <div className="num text-lg font-semibold">
                {orders && orders.length > 0 ? 'Ningún pedido con este filtro' : tab === 'disponibles' ? 'Sin pedidos por ahora' : 'No tienes pedidos en curso'}
              </div>
              <div className="text-sm leading-snug text-ink-soft">
                {orders && orders.length > 0 ? 'Quita el filtro de pago para ver todos.' : tab === 'disponibles' ? 'Te avisamos apenas caiga uno nuevo.' : 'Toma uno en Disponibles.'}
              </div>
            </div>
          ) : (
            visibles.map((o) => {
              const min = Math.max(1, Math.round((o.distanciaKm / VELOCIDAD_MOTO_KMH) * 60))
              const open = abierto === o.id
              return (
                <article key={o.id} className="animate-enter-up rounded-[20px] bg-card px-4 py-3.5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-ink-faint">
                        {tab === 'mis'
                          ? <span className="font-semibold text-blue">{ESTADO_EN_CURSO[o.status] ?? o.status}</span>
                          : o.isNew && <span className="font-semibold text-blue">Nuevo</span>}
                        {(tab === 'mis' || o.isNew) && ' · '}{o.numero} · {hace(o.esperaMin)}
                      </div>
                      <h3 className="num mt-0.5 text-lg font-semibold leading-tight">{o.direccion}</h3>
                    </div>
                    <div className="flex-none text-right">
                      <div className="text-xs text-ink-faint">Ganas</div>
                      <div className="num text-[22px] font-semibold leading-none">S/ {o.tarifaReparto.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="mt-3"><RoadStrip texto={`${fmtDist(o.distanciaKm)} · ${min} min`} /></div>

                  {open && (
                    <dl className="mt-3 border-t border-line text-sm">
                      {o.referencia && <div className="flex justify-between gap-4 border-b border-line py-2.5"><dt className="text-ink-soft">Referencia</dt><dd className="text-right">{o.referencia}</dd></div>}
                      <div className="flex justify-between gap-4 border-b border-line py-2.5"><dt className="text-ink-soft">Paquete</dt><dd className="text-right"><PaqueteBadge paquete={o.paquete} /></dd></div>
                      <div className="flex justify-between gap-4 border-b border-line py-2.5">
                        <dt className="flex-none text-ink-soft">Productos</dt>
                        <dd className="text-right">{o.items.map((it) => `${it.nombre} ×${it.cantidad}`).join(', ')}</dd>
                      </div>
                      <div className="flex justify-between gap-4 py-2.5">
                        <dt className="text-ink-soft">{o.contraEntrega ? 'Cobrar al cliente' : 'Pago'}</dt>
                        <dd className="text-right font-semibold tabular-nums">{o.contraEntrega ? `S/ ${o.monto.toFixed(2)} · ${o.metodoPago}` : `Ya pagado · ${o.metodoPago}`}</dd>
                      </div>
                      <button onClick={() => navigate(`/pedidos/${o.id}`)} className="flex w-full items-center gap-1 pb-1 text-sm font-medium text-blue">
                        Ver pedido completo y mapa <ChevronRight size={16} />
                      </button>
                    </dl>
                  )}

                  <div className="mt-2.5 flex items-center justify-between">
                    <button onClick={() => setAbierto(open ? null : o.id)} aria-expanded={open}
                      className="-ml-1 flex h-10 items-center gap-1 px-1 text-sm font-medium text-ink-soft">
                      {open ? 'Ocultar' : 'Ver detalle'} {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {tab === 'disponibles' ? (
                      <HoldClaimButton onConfirm={() => holdClaim(o)} disabled={tomandoIds.has(o.id)} label="Tomar" />
                    ) : (
                      <button onClick={() => navigate(`/pedidos/${o.id}`)} className="flex h-[42px] items-center rounded-xl bg-blue px-5 text-[15px] font-semibold text-white">
                        Continuar
                      </button>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
