import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, CloudRain, Layers, Package, RefreshCw, WifiOff } from 'lucide-react'
import { fetchAvailableOrders, fetchMyOrders, claimOrder, claimOrders, releaseOrder, apiErrorMessage } from '../api'
import { fetchViaAlert } from '../lib/weather'
import { resolveRoute, estimarSeparados } from '../lib/routing'
import { useRiderLocation } from '../hooks/useRiderLocation'
import { useAuthStore } from '../authStore'
import { RouteMap } from '../components/RouteMap'
import { AppHeader, HeaderTabs } from '../components/AppHeader'
import { HoldClaimButton } from '../components/HoldClaimButton'
import { EntregaChip, TripCard } from '../components/TripCard'
import { entregaInfo, fmtDist, grupoEntrega, minutosMoto, soles } from '../lib/formato'
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
type Orden = 'hora' | 'cercania' | 'pago'

const ORDEN_OPTIONS: { key: Orden; label: string }[] = [
  { key: 'hora', label: 'Por hora' },
  { key: 'cercania', label: 'Más cerca' },
  { key: 'pago', label: 'Mejor pago' },
]

const ESTADO_EN_CURSO: Record<string, string> = { ASIGNADO: 'Recoger en tienda', RECOGIDO: 'Recogido', EN_CAMINO: 'En camino' }
const hace = (min: number) => (min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`)

export function PedidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [tab, setTab] = useState<Tab>('disponibles')
  const [orden, setOrden] = useState<Orden>('hora')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [claiming, setClaiming] = useState(false)
  const [tomandoIds, setTomandoIds] = useState<Set<string>>(new Set())
  const riderPos = useRiderLocation()
  const iniciales = useAuthStore((s) => s.iniciales)

  const { data: disponibles, isLoading: loadingDisponibles, dataUpdatedAt } = useQuery({
    queryKey: ['orders-disponibles'], queryFn: fetchAvailableOrders, refetchInterval: 15000,
  })
  const { data: misPedidos, isLoading: loadingMisPedidos } = useQuery({
    queryKey: ['orders-mios'], queryFn: fetchMyOrders, refetchInterval: 15000,
  })

  const [base, setBase] = useState<'disponibles' | 'mis'>('disponibles')
  const lista = tab === 'mapa' ? base : tab
  const vista = tab === 'mapa' ? 'mapa' : 'lista'
  const orders = lista === 'disponibles' ? disponibles : misPedidos
  const isLoading = lista === 'disponibles' ? loadingDisponibles : loadingMisPedidos

  const { data: viaAlert } = useQuery({ queryKey: ['via-alert'], queryFn: fetchViaAlert, staleTime: 1000 * 60 * 15, retry: false })

  const elegidos = useMemo(() => (orders ?? []).filter((o) => seleccionados.has(o.id)), [orders, seleccionados])
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

  const holdClaim = async (o: DeliveryOrder) => {
    if (tomandoIds.has(o.id)) return
    setTomandoIds((prev) => new Set(prev).add(o.id))
    try {
      await claimOrder(o.id)
      invalidateOrderLists()
      toast.success(`Tomaste ${o.numero}.`, {
        duration: 5000,
        action: { label: 'Deshacer', onClick: async () => { await releaseOrder(o.id); invalidateOrderLists() } },
      })
      navigate(`/pedidos/${o.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo tomar el pedido'))
    } finally {
      setTomandoIds((prev) => { const next = new Set(prev); next.delete(o.id); return next })
    }
  }

  // Tomar varios a la vez: desde el mapa o un grupo de programados de la
  // misma franja (consolidar en una sola salida).
  const claimBatch = async (ids: string[], primeroId?: string) => {
    setClaiming(true)
    try {
      const { tomados, fallidos } = await claimOrders(ids)
      invalidateOrderLists()
      if (fallidos.length > 0) toast.error(fallidos.length === 1 ? 'Ese pedido ya lo tomó otro repartidor' : `${fallidos.length} pedidos ya los tomó otro repartidor`)
      if (tomados.length > 0) {
        toast.success(tomados.length === 1 ? 'Pedido tomado.' : `Tomaste ${tomados.length} pedidos.`, {
          duration: 5000,
          action: { label: 'Deshacer', onClick: async () => { await Promise.all(tomados.map((o) => releaseOrder(o.id))); invalidateOrderLists() } },
        })
        setSeleccionados(new Set())
        if (primeroId) navigate(`/pedidos/${primeroId}`)
        else { setTab('mis'); setBase('mis') }
      }
    } finally {
      setClaiming(false)
    }
  }

  const visibles = useMemo(() => {
    const list = [...(orders ?? [])]
    list.sort((a, b) => {
      if (orden === 'cercania') return a.distanciaKm - b.distanciaKm
      if (orden === 'pago') return b.tarifaReparto - a.tarifaReparto
      return (entregaInfo(a.entrega).at?.getTime() ?? 0) - (entregaInfo(b.entrega).at?.getTime() ?? 0)
    })
    return list
  }, [orders, orden])

  // En Disponibles y "Por hora" se agrupa por franja de entrega: los
  // programados del mismo turno se ven juntos para llevarlos en una salida.
  const grupos = useMemo(() => {
    if (tab !== 'disponibles' || orden !== 'hora') return [{ key: 'todo', titulo: '', items: visibles }]
    const map = new Map<string, { key: string; titulo: string; items: DeliveryOrder[] }>()
    for (const o of visibles) {
      const g = grupoEntrega(o)
      if (!map.has(g.key)) map.set(g.key, { ...g, items: [] })
      map.get(g.key)!.items.push(o)
    }
    return [...map.values()]
  }, [visibles, tab, orden])

  const cambiarTab = (t: Tab) => {
    if (t !== 'mapa') setBase(t)
    setTab(t)
    setSeleccionados(new Set())
  }

  const enCurso = misPedidos ?? []
  const siguiente = enCurso[0]

  const card = (o: DeliveryOrder) => {
    const ent = entregaInfo(o.entrega)
    const mio = tab === 'mis'
    return (
      <TripCard
        key={o.id}
        onOpen={() => navigate(`/pedidos/${o.id}`)}
        chip={mio
          ? <span className="inline-flex h-7 items-center rounded-full bg-blue px-2.5 text-[13px] font-semibold text-white">{ESTADO_EN_CURSO[o.status] ?? o.status}</span>
          : <EntregaChip texto={ent.texto} urgencia={ent.urgencia} />}
        meta={`${o.numero} · ${mio && o.entrega.tipo === 'PROGRAMADO' ? ent.texto : hace(o.esperaMin)}`}
        tag={o.isNew && !mio ? <span className="font-semibold text-blue">Nuevo</span> : undefined}
        monto={o.tarifaReparto}
        destino={o.direccion || 'Sin dirección escrita'}
        distancia={`${fmtDist(o.distanciaKm)} · ${minutosMoto(o.distanciaKm)} min`}
        pie={o.contraEntrega
          ? <>Cobras <b className="text-ink">{soles(o.monto)}</b> · {o.metodoPago}</>
          : <>Ya pagado · {o.items.length} {o.items.length === 1 ? 'producto' : 'productos'}</>}
        accion={mio
          ? <button onClick={() => navigate(`/pedidos/${o.id}`)} className="flex h-12 items-center gap-1.5 rounded-2xl bg-blue px-5 text-[16px] font-semibold text-white">Seguir <ArrowRight size={18} /></button>
          : <HoldClaimButton className="h-12 rounded-2xl px-6 text-[16px]" onConfirm={() => holdClaim(o)} disabled={tomandoIds.has(o.id)} label="Tomar" />}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <HeaderTabs<Tab>
          value={tab}
          onChange={cambiarTab}
          tabs={[
            ['disponibles', `Disponibles${disponibles ? ` · ${disponibles.length}` : ''}`],
            ['mis', `En curso${enCurso.length ? ` · ${enCurso.length}` : ''}`],
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

      {vista === 'mapa' && (
        <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-5 pt-3">
          <div className="flex gap-1">
            {(['disponibles', 'mis'] as const).map((b) => (
              <button key={b} onClick={() => { setBase(b); setSeleccionados(new Set()) }}
                className={cn('h-9 rounded-full px-3.5 text-[14px]', base === b ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
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
            onToggle={(id) => setSeleccionados((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })}
          />
          <p className="text-[14px] leading-snug text-ink-soft">Toca los pedidos que quieras llevar juntos. Te armamos la ruta más rápida.</p>

          {seleccionados.size > 0 && routeLoading && (
            <div className="flex items-center justify-center gap-2 rounded-[20px] bg-card p-4 text-sm text-ink-soft shadow-card">
              <RefreshCw size={16} className="animate-spin" /> Calculando ruta…
            </div>
          )}

          {seleccionados.size > 0 && routeInfo && routeInfo.ruta.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[22px] bg-card p-4 shadow-card">
              <div className="flex items-baseline justify-between gap-2">
                <div className="num text-lg font-semibold">Ruta sugerida</div>
                <div className="text-sm tabular-nums text-ink-soft">{routeInfo.totalKm.toFixed(1)} km · {Math.round(routeInfo.totalMin)} min{!routeInfo.esReal && ' · estimado'}</div>
              </div>
              {separados && <div className="text-[13px] text-ink-soft">Juntos ahorras {Math.max(0, separados.km - routeInfo.totalKm).toFixed(1)} km.</div>}
              <ol className="flex flex-col">
                {routeInfo.ruta.map((o, i) => {
                  const leg = routeInfo.legs[i]
                  if (!leg) return null
                  const etaMin = routeInfo.legs.slice(0, i + 1).reduce((acc, l) => acc + l.duracionMin, 0)
                  return (
                    <li key={o.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{o.direccion}</div>
                        <div className="text-[13px] tabular-nums text-ink-soft">{leg.distanciaKm.toFixed(1)} km · llegas {new Date(Date.now() + etaMin * 60000).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}</div>
                      </div>
                      <span className="num flex-none text-[16px] font-semibold">{soles(o.tarifaReparto)}</span>
                    </li>
                  )
                })}
              </ol>
              {base === 'disponibles' ? (
                <HoldClaimButton className="h-14 w-full rounded-2xl text-[17px]" disabled={claiming}
                  onConfirm={() => claimBatch([...seleccionados], routeInfo.ruta[0]?.id)}
                  label={routeInfo.ruta.length === 1 ? 'Tomar este pedido' : `Tomar estos ${routeInfo.ruta.length} · ${soles(routeInfo.ruta.reduce((s, o) => s + o.tarifaReparto, 0))}`} />
              ) : (
                <button onClick={() => navigate(`/pedidos/${routeInfo.ruta[0].id}`)} className="h-14 w-full rounded-2xl bg-blue text-[17px] font-semibold text-white">Empezar por aquí</button>
              )}
            </div>
          )}
        </div>
      )}

      {vista === 'lista' && (
        <>
          <div className="no-scrollbar flex flex-none gap-1 overflow-x-auto px-4 pt-3">
            {ORDEN_OPTIONS.map(({ key, label }) => (
              <button key={key} onClick={() => setOrden(key)}
                className={cn('h-9 flex-none rounded-full px-3.5 text-[14px]', orden === key ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
                {label}
              </button>
            ))}
          </div>

          <div className={cn('no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3', !online && 'opacity-70')}>
            {/* Asistente: lo que sigue, siempre arriba mientras haya algo en curso. */}
            {tab === 'disponibles' && siguiente && (
              <button onClick={() => navigate(`/pedidos/${siguiente.id}`)}
                className="flex items-center gap-3 rounded-[22px] bg-night px-4 py-3.5 text-left text-white">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/10"><ArrowRight size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-white/70">Sigue con {enCurso.length > 1 ? `tus ${enCurso.length} viajes` : 'tu viaje'}</span>
                  <span className="num block truncate text-[17px] font-semibold">{ESTADO_EN_CURSO[siguiente.status]} · {siguiente.direccion}</span>
                </span>
              </button>
            )}

            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-[22px] bg-card p-4 shadow-card">
                  <div className="h-6 w-28 animate-shimmer rounded-full bg-line" />
                  <div className="h-8 w-32 animate-shimmer rounded bg-line" />
                  <div className="h-5 w-full animate-shimmer rounded bg-line" />
                </div>
              ))
            ) : visibles.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <Package size={44} strokeWidth={1.5} className="text-ink-ghost" />
                <div className="num text-xl font-semibold">{tab === 'disponibles' ? 'Sin pedidos por ahora' : 'No tienes pedidos en curso'}</div>
                <div className="text-[15px] leading-snug text-ink-soft">{tab === 'disponibles' ? 'Te avisamos apenas caiga uno. Revisa también Mandados.' : 'Toma uno en Disponibles.'}</div>
              </div>
            ) : (
              grupos.map((g) => {
                const varios = g.key !== 'ahora' && g.key !== 'todo' && g.items.length > 1
                return (
                  <section key={g.key} className="flex flex-col gap-2.5">
                    {g.titulo && (
                      <div className="flex items-center justify-between gap-2 px-1 pt-1">
                        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">{g.titulo} · {g.items.length}</h2>
                        {varios && (
                          <HoldClaimButton className="h-9 rounded-full px-3.5 text-[13px]" disabled={claiming}
                            onConfirm={() => claimBatch(g.items.map((o) => o.id))}
                            label={`Tomar los ${g.items.length} · ${soles(g.items.reduce((s, o) => s + o.tarifaReparto, 0))}`} />
                        )}
                      </div>
                    )}
                    {varios && <p className="-mt-1 flex items-center gap-1.5 px-1 text-[13px] text-ink-faint"><Layers size={14} />Misma franja: llévalos en una sola salida.</p>}
                    {g.items.map(card)}
                  </section>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
