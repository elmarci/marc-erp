import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, CheckCircle2, Package, PackageCheck, Bike, Home, XCircle, ChevronRight, ChevronDown, MessageCircle, Star } from 'lucide-react'
import { Ico } from '../components/Ico'
import { storeApi, type OrderTracking, type StoreOrder, type TrackingStage } from '../api'
import { io } from 'socket.io-client'
import { whatsappLink } from '../lib/storeInfo'
import { thumb } from '../lib/thumb'

// El mapa (Leaflet) pesa ~45 KB: solo se descarga cuando el pedido ya va en
// camino, nunca en el resto de la tienda.
const TrackingMap = lazy(() => import('../components/tracking/TrackingMap'))
type RouteInfo = { km: number; min: number }

const API_BASE = import.meta.env['VITE_API_URL']?.replace('/api/v1', '') ?? 'http://localhost:3001'

const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo', YAPE_CONTRAENTREGA: 'Yape contra entrega', CARD_CONTRAENTREGA: 'Tarjeta al recibir' }
const PAYMENT_ICONS: Record<string, string> = { YAPE: '/yape.png', PLIN: '/plin.png', CASH: '/cash.png', YAPE_CONTRAENTREGA: '/yape.png', CARD_CONTRAENTREGA: '/card.svg' }
// Métodos que se cobran ANTES de entregar y por eso necesitan verificación de
// comprobante — CASH y YAPE_CONTRAENTREGA se cobran recién al entregar, así
// que nunca quedan "pendientes de pago" en este sentido.
const PAYS_UPFRONT = new Set(['YAPE', 'PLIN'])

const ORDER: TrackingStage[] = ['RECIBIDO', 'CONFIRMADO', 'PREPARANDO', 'LISTO', 'EN_CAMINO', 'ENTREGADO']
const rank = (s: TrackingStage) => ORDER.indexOf(s)

const hhmm = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Lima' }).replace(/\s?([ap])\.?\s?m\.?/i, ' $1m')
  : null
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Respaldo para un backend que todavía no manda `tracking` (pedido viejo en
// caché o API sin actualizar): se arma lo mínimo desde el estado.
function fallbackTracking(o: StoreOrder): OrderTracking {
  const map: Record<string, TrackingStage> = { PENDING: 'RECIBIDO', CONFIRMED: 'CONFIRMADO', PREPARING: 'PREPARANDO', READY: 'LISTO', DELIVERED: 'ENTREGADO', CANCELLED: 'CANCELADO' }
  return {
    stage: map[o.status] ?? 'RECIBIDO', express: false, schedule: null, receiver: null, etaMinutes: null, kmLeft: null,
    store: { lat: -12.102235, lng: -76.874449 }, destination: null, riderLocation: null, rider: null,
    times: { recibido: o.createdAt, asignado: null, recogido: null, enCamino: null, entregado: null },
  }
}

type Hero = { Icon: typeof Clock; title: string; sub: string; tone: 'blue' | 'green' | 'red' }

// Íconos propios de Tiendas Marc por etapa (public/icons, hechos por el dueño).
const STAGE_ICON: Partial<Record<TrackingStage, string>> = {
  RECIBIDO: '/icons/seg-recibido.svg', CONFIRMADO: '/icons/seg-confirmado.svg', PREPARANDO: '/icons/seg-preparando.svg',
  LISTO: '/icons/seg-listo.svg', EN_CAMINO: '/icons/seg-moto.svg', ENTREGADO: '/icons/seg-entregado.svg',
}

function heroFor(t: OrderTracking, o: StoreOrder, isDelivery: boolean, needsPayment: boolean): Hero {
  const rider = t.rider?.nombre
  switch (t.stage) {
    case 'CANCELADO': return { Icon: XCircle, title: 'Pedido cancelado', sub: 'Si tienes dudas, escríbenos por WhatsApp.', tone: 'red' }
    case 'ENTREGADO': return { Icon: Home, title: isDelivery ? '¡Pedido entregado!' : '¡Pedido recogido!', sub: `Gracias por comprar en Tiendas Marc${t.times.entregado ? ` · ${hhmm(t.times.entregado)}` : ''}.`, tone: 'green' }
    case 'EN_CAMINO': return o.deliveryStatus === 'RECOGIDO'
      ? { Icon: Bike, title: 'Tu pedido salió de la tienda', sub: `${rider ?? 'Tu repartidor'} ya lo tiene y está por salir.`, tone: 'blue' }
      : { Icon: Bike, title: 'Tu pedido va en camino', sub: `${rider ?? 'Tu repartidor'} se dirige a tu dirección.`, tone: 'blue' }
    case 'LISTO': return isDelivery
      ? { Icon: PackageCheck, title: 'Tu pedido está listo', sub: rider ? `${rider} lo recoge en un momento.` : 'Estamos asignando a tu repartidor.', tone: 'blue' }
      : { Icon: PackageCheck, title: 'Listo para recoger', sub: 'Acércate a la tienda con tu número de pedido.', tone: 'blue' }
    case 'PREPARANDO': return { Icon: Package, title: 'Estamos preparando tu pedido', sub: 'Elegimos tus productos uno por uno.', tone: 'blue' }
    case 'CONFIRMADO': return { Icon: CheckCircle2, title: 'Pedido confirmado', sub: 'En breve empezamos a prepararlo.', tone: 'blue' }
    default: return needsPayment
      ? { Icon: Clock, title: 'Falta verificar tu pago', sub: 'Envíanos tu comprobante y lo confirmamos.', tone: 'blue' }
      : { Icon: Clock, title: 'Recibimos tu pedido', sub: 'En unos minutos lo confirmamos.', tone: 'blue' }
  }
}

// Cuenta "hace X s" sin volver a pedir datos.
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`
}

export function OrderConfirmPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  // Clave del enlace: sin ella solo se ve el avance, sin datos personales.
  const [searchParams] = useSearchParams()
  const accessKey = searchParams.get('k')
  const queryClient = useQueryClient()
  const now = useNow(5000)
  // Ruta por calles que calcula el mapa (OSRM): mejora el tiempo y la distancia.
  const [route, setRoute] = useState<RouteInfo | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderNumber, accessKey],
    queryFn: () => storeApi.getOrder(orderNumber!, accessKey),
    enabled: !!orderNumber,
    // En camino se refresca seguido (el repartidor manda su GPS cada 15 s);
    // terminado ya no hace falta.
    refetchInterval: (q) => {
      const st = q.state.data?.data.data.tracking?.stage
      return st === 'ENTREGADO' || st === 'CANCELADO' ? false : st === 'EN_CAMINO' ? 10000 : 15000
    },
  })

  // Cambios de estado al instante (el staff o el repartidor avanzan el pedido).
  useEffect(() => {
    if (!orderNumber) return
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socket.on(`store:order-updated:${orderNumber}`, () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderNumber] })
    })
    return () => { socket.disconnect() }
  }, [orderNumber, queryClient])

  const order = data?.data.data

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 border-2 border-brand-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-paper-ink-soft">Cargando tu pedido…</p>
      </div>
    </div>
  )

  if (!order) return (
    <div className="text-center py-20 px-4">
      <p className="text-paper-ink-soft mb-4">Pedido no encontrado</p>
      <Link to="/" className="text-brand-blue-600 font-bold">Volver a la tienda</Link>
    </div>
  )

  const t = order.tracking ?? fallbackTracking(order)
  const isDelivery = order.deliveryType === 'DELIVERY'
  const isCancelled = t.stage === 'CANCELADO'
  const needsPayment = PAYS_UPFRONT.has(order.paymentMethod) && order.paymentStatus === 'PENDING'
  const whatsappMsg = `Hola! Mi pedido es *${order.orderNumber}* — quiero enviar el comprobante de pago por ${PAYMENT_LABELS[order.paymentMethod]}.`
  const hero = heroFor(t, order, isDelivery, needsPayment)
  const r = rank(t.stage)

  // La comisión de tarjeta no viene en un campo propio: es lo que queda del
  // total al quitar productos y envío (y sumar lo canjeado con puntos).
  const cardCommission = Math.max(0, Math.round((Number(order.total) - Number(order.subtotal) - Number(order.deliveryCost) + Number(order.pointsDiscountAmount ?? 0)) * 100) / 100)

  // Tiempo de llegada: por calles si el mapa ya trazó la ruta; si no, el
  // estimado en línea recta que manda el servidor.
  const eta = route ? Math.max(1, Math.ceil(route.min)) + (order.deliveryStatus === 'RECOGIDO' ? 3 : 0) : t.etaMinutes
  const kmLeft = route ? Math.round(route.km * 10) / 10 : t.kmLeft

  // Avance por etapas: un ícono por etapa y una sola etiqueta (la actual),
  // así nada queda desalineado por palabras largas o cortas.
  const STEPS: { stage: TrackingStage; icon: string; label: string }[] = [
    { stage: 'CONFIRMADO', icon: 'seg-confirmado', label: 'Confirmado' },
    { stage: 'PREPARANDO', icon: 'seg-preparando', label: 'Preparando' },
    { stage: 'LISTO', icon: 'seg-listo', label: isDelivery ? 'Listo para salir' : 'Listo para recoger' },
    ...(isDelivery ? [{ stage: 'EN_CAMINO' as TrackingStage, icon: 'seg-moto', label: 'En camino' }] : []),
    { stage: 'ENTREGADO', icon: 'seg-entregado', label: isDelivery ? 'Entregado' : 'Recogido' },
  ]
  const curIdx = Math.max(-1, STEPS.findIndex(st => st.stage === t.stage))
  const nextStep = STEPS[curIdx + 1]

  // Línea de tiempo: lo que ya pasó con su hora, el paso actual resaltado y lo
  // que falta en gris.
  type Step = { key: string; label: string; done: boolean; time: string | null; note?: string }
  const steps: Step[] = [
    { key: 'rec', label: 'Pedido recibido', done: true, time: hhmm(t.times.recibido) },
    { key: 'conf', label: needsPayment && r < 1 ? 'Pago verificado y pedido confirmado' : 'Pedido confirmado', done: r >= 1, time: null },
    { key: 'prep', label: 'Preparando tu pedido', done: r >= 2, time: null },
    ...(isDelivery ? [{ key: 'rider', label: t.rider ? `Repartidor asignado: ${t.rider.nombre}` : 'Repartidor asignado', done: !!t.rider, time: hhmm(t.times.asignado) }] : []),
    { key: 'listo', label: isDelivery ? 'Listo para salir' : 'Listo para recoger', done: r >= 3, time: null },
    ...(isDelivery ? [{ key: 'camino', label: 'En camino a tu dirección', done: r >= 4 && order.deliveryStatus !== 'RECOGIDO', time: hhmm(t.times.enCamino ?? t.times.recogido) }] : []),
    { key: 'fin', label: isDelivery ? 'Entregado' : 'Recogido en tienda', done: r >= 5, time: hhmm(t.times.entregado) },
  ]
  const current = steps.findIndex(s => !s.done)

  const showMap = isDelivery && t.stage === 'EN_CAMINO' && (t.destination || t.riderLocation)
  const helpMsg = `Hola, consulto por mi pedido *${order.orderNumber}*${t.rider ? ` (repartidor ${t.rider.nombre})` : ''}.`

  const card = 'bg-white rounded-2xl shadow-card'
  const section = 'text-[13px] font-bold uppercase tracking-wide text-paper-ink-soft'

  return (
    <main className="max-w-xl mx-auto px-4 pt-4 pb-10 space-y-3">
      <div className="flex items-center justify-between">
        <Link to="/mis-pedidos" className="text-sm font-bold text-brand-blue-600 h-11 flex items-center">← Mis pedidos</Link>
        <span className="text-sm font-bold text-paper-ink tabular-nums">{order.orderNumber}</span>
      </div>

      {order.limited && (
        <p className="bg-brand-blue-50 text-brand-blue-800 text-sm leading-snug rounded-xl px-3.5 py-2.5">
          Por tu seguridad, aquí solo se ve el avance. Para ver la dirección y la ubicación del repartidor, abre el enlace que recibiste al hacer el pedido o inicia sesión.
        </p>
      )}

      {/* Mapa en vivo arriba, como en las apps de delivery: solo mientras va en camino */}
      {showMap && (
        <section className={`${card} overflow-hidden`}>
          <Suspense fallback={<div className="h-[300px] bg-paper-surface animate-pulse" />}>
            <TrackingMap store={t.store} destination={t.destination} rider={t.riderLocation} onRoute={setRoute} />
          </Suspense>
          <div className="px-4 py-2.5 flex items-center gap-2 text-[13px] text-paper-ink-soft">
            <span className={`h-2 w-2 rounded-full shrink-0 ${t.riderLocation ? 'bg-brand-green-500 animate-pulse' : 'bg-paper-line'}`} />
            {t.riderLocation
              ? <>Ubicación del repartidor en vivo · {ago(t.riderLocation.at, now)}</>
              : <>Ubicación del repartidor no disponible por ahora</>}
          </div>
        </section>
      )}

      {/* Estado principal + tiempo de llegada */}
      <section className={`${card} p-4`} aria-live="polite">
        <div className="flex items-start gap-3">
          {STAGE_ICON[t.stage] ? (
            <img src={STAGE_ICON[t.stage]} alt="" width={56} height={56} className="h-14 w-14 shrink-0 object-contain" />
          ) : (
            <span className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
              hero.tone === 'red' ? 'bg-brand-magenta-50 text-brand-magenta-600' : hero.tone === 'green' ? 'bg-brand-green-100 text-brand-green-700' : 'bg-brand-blue-50 text-brand-blue-600'}`}>
              <hero.Icon className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold text-paper-ink leading-snug">{hero.title}</h1>
            <p className="text-sm text-paper-ink-soft leading-snug mt-0.5">{hero.sub}</p>
          </div>
        </div>

        {!isCancelled && isDelivery && t.stage !== 'ENTREGADO' && (
          <div className="mt-3.5 rounded-xl bg-paper-surface px-3.5 py-3 flex items-center gap-3">
            {t.stage === 'EN_CAMINO' && eta != null ? (
              <>
                <span className="text-[28px] leading-none font-extrabold text-brand-blue-700 tabular-nums">{eta}<span className="text-base ml-0.5">min</span></span>
                <span className="text-sm text-paper-ink-soft leading-snug">
                  Llegada aprox. <b className="text-paper-ink">{hhmm(new Date(Date.now() + eta * 60000).toISOString())}</b>
                  {kmLeft != null && <><br />a {kmLeft.toFixed(1)} km de tu casa</>}
                </span>
              </>
            ) : t.express ? (
              <>
                <Ico name="chk-express" className="h-8 w-8" />
                <span className="text-sm text-paper-ink-soft leading-snug"><b className="text-paper-ink">Express:</b> sale apenas esté listo. Llega aprox. en 20 a 30 min.</span>
              </>
            ) : t.schedule ? (
              <>
                <Ico name="aviso-horario" className="h-8 w-8" />
                <span className="text-sm text-paper-ink-soft leading-snug"><b className="text-paper-ink">Entrega programada:</b> {t.schedule}</span>
              </>
            ) : (
              <>
                <Ico name="aviso-horario" className="h-8 w-8" />
                <span className="text-sm text-paper-ink-soft leading-snug">Te mostramos el tiempo de llegada cuando salga de la tienda.</span>
              </>
            )}
          </div>
        )}

        {!isCancelled && (
          <div className="mt-4">
            <ol className="flex items-center" aria-hidden="true">
              {STEPS.map((st, i) => {
                const done = i < curIdx || t.stage === 'ENTREGADO'
                const isCur = i === curIdx && t.stage !== 'ENTREGADO'
                return (
                  <li key={st.stage} className={`flex items-center ${i === 0 ? '' : 'flex-1'}`}>
                    {i > 0 && <span className={`h-[3px] flex-1 mx-1 rounded-full ${i <= curIdx ? 'bg-brand-blue-600' : 'bg-paper-line'}`} />}
                    <span className={`relative h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      isCur ? 'bg-white ring-2 ring-brand-blue-600' : done ? 'bg-brand-blue-50 ring-1 ring-brand-blue-200' : 'bg-paper-surface'}`}>
                      {isCur && <span className="absolute inset-0 rounded-full ring-4 ring-brand-blue-200 animate-pulse" />}
                      <Ico name={st.icon} className={`h-7 w-7 ${done || isCur ? '' : 'opacity-35 grayscale'}`} />
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="mt-2.5 flex items-center justify-between gap-2 text-[13px]">
              <span className="text-paper-ink">
                {t.stage === 'RECIBIDO'
                  ? <>Por confirmar</>
                  : <>Paso {Math.min(curIdx + 1, STEPS.length)} de {STEPS.length} · <b>{STEPS[Math.max(0, curIdx)].label}</b></>}
              </span>
              {nextStep && t.stage !== 'ENTREGADO' && <span className="text-paper-ink-soft truncate">Sigue: {nextStep.label.toLowerCase()}</span>}
            </p>
          </div>
        )}
      </section>


      {/* Pago pendiente (Yape/Plin): va arriba de todo lo demás */}
      {needsPayment && !isCancelled && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          <h3 className="font-bold text-lg mb-3 text-paper-ink flex items-center gap-2">
            <img src={PAYMENT_ICONS[order.paymentMethod]} alt="" className="h-7 w-7 rounded-lg object-contain" />
            Realiza tu pago por {PAYMENT_LABELS[order.paymentMethod]}
          </h3>
          {order.paymentMethod === 'YAPE' ? (
            <div className="bg-paper-surface rounded-xl p-4 mb-4 border border-paper-line flex flex-col items-center text-center gap-2">
              <img src="/yape-qr.png" alt="QR de Yape para pagar" className="w-40 rounded-xl border border-paper-line" />
              <p className="text-paper-ink-soft text-sm">Monto a pagar:</p>
              <p className="text-3xl font-extrabold text-paper-ink">S/ {Number(order.total).toFixed(2)}</p>
            </div>
          ) : (
            <div className="bg-paper-surface rounded-xl p-4 mb-4 border border-paper-line">
              <p className="text-paper-ink-soft text-sm mb-1">Monto a pagar:</p>
              <p className="text-3xl font-extrabold text-paper-ink">S/ {Number(order.total).toFixed(2)}</p>
              <p className="text-paper-ink-soft text-sm mt-2">Enviar al número:</p>
              <p className="text-2xl font-extrabold text-brand-blue-700">930 555 831</p>
            </div>
          )}
          <a href={whatsappLink(whatsappMsg)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#25D366] text-[#0B3B1E] font-bold py-4 rounded-xl hover:opacity-90 transition-opacity">
            <MessageCircle className="h-5 w-5" />
            Enviar comprobante por WhatsApp
          </a>
          <p className="text-xs text-paper-ink-ghost text-center mt-3">
            Tu pedido se confirmará cuando verifiquemos el pago
          </p>
        </div>
      )}


      {/* Repartidor asignado */}
      {isDelivery && !isCancelled && t.stage !== 'ENTREGADO' && (
        <section className={`${card} p-4`}>
          <h2 className={section}>Tu repartidor</h2>
          {t.rider ? (
            <div className="mt-2.5 flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-brand-blue-600 text-white font-extrabold flex items-center justify-center shrink-0">{t.rider.iniciales}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-paper-ink leading-tight flex items-center gap-1.5">
                  {t.rider.nombre}
                  {t.rider.calificacion != null && (
                    <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-paper-ink-soft">
                      <Star className="h-3.5 w-3.5 fill-brand-sun-400 text-brand-sun-500" aria-hidden="true" />{t.rider.calificacion.toFixed(1)}
                    </span>
                  )}
                </p>
                <p className="text-[13px] text-paper-ink-soft leading-snug truncate">
                  {[t.rider.moto ?? 'Moto', t.rider.placa].filter(Boolean).join(' · ')}
                </p>
              </div>
              <a href={whatsappLink(helpMsg)} target="_blank" rel="noopener noreferrer" aria-label="Escribir a la tienda por WhatsApp"
                className="h-11 w-11 rounded-full bg-[#25D366] text-[#0B3B1E] flex items-center justify-center shrink-0">
                <MessageCircle className="h-5 w-5" />
              </a>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-paper-surface flex items-center justify-center shrink-0">
                <Ico name="pin-moto" className="h-7 w-7 opacity-60" />
              </span>
              <p className="text-sm text-paper-ink-soft leading-snug">Aún no tiene repartidor. Aquí verás quién lo lleva apenas se asigne.</p>
            </div>
          )}
        </section>
      )}

      {/* Seguimiento paso a paso */}
      {!isCancelled && (
        <section className={`${card} p-4`}>
          <h2 className={section}>Seguimiento</h2>
          <ol className="mt-3">
            {steps.map((s, i) => {
              const isCurrent = i === current
              const last = i === steps.length - 1
              return (
                <li key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                      s.done ? 'bg-brand-blue-600' : isCurrent ? 'bg-white border-2 border-brand-blue-600' : 'bg-white border-2 border-paper-line'}`}>
                      {s.done ? <CheckCircle2 className="h-4 w-4 text-white" aria-hidden="true" />
                        : isCurrent ? <span className="h-2 w-2 rounded-full bg-brand-blue-600 animate-pulse" /> : null}
                    </span>
                    {!last && <span className={`w-0.5 flex-1 min-h-[18px] ${s.done ? 'bg-brand-blue-600' : 'bg-paper-line'}`} />}
                  </div>
                  <div className={`flex-1 flex justify-between gap-2 ${last ? '' : 'pb-3.5'}`}>
                    <p className={`text-sm leading-6 ${s.done ? 'text-paper-ink font-semibold' : isCurrent ? 'text-brand-blue-700 font-bold' : 'text-paper-ink-soft'}`}>
                      {s.label}
                      {isCurrent && <span className="sr-only"> (en curso)</span>}
                    </p>
                    {s.time && s.done && <span className="text-[13px] text-paper-ink-soft tabular-nums leading-6 shrink-0">{s.time}</span>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* Datos de entrega */}
      {!order.limited && <section className={`${card} p-4 space-y-2.5`}>
        <h2 className={section}>{isDelivery ? 'Entrega' : 'Recojo'}</h2>
        <p className="flex gap-2.5 text-sm text-paper-ink leading-snug">
          <Ico name="chk-ubicacion" className="h-6 w-6 -mt-0.5" />
          <span>{isDelivery ? <>{order.address}{order.district ? `, ${order.district}` : ''}{order.reference && <span className="block text-paper-ink-soft">{order.reference}</span>}</> : 'Tiendas Marc — Av. Manchay, Pachacamac'}</span>
        </p>
        {isDelivery && (t.schedule || t.express) && (
          <p className="flex gap-2.5 text-sm text-paper-ink leading-snug">
            <Ico name="aviso-horario" className="h-6 w-6 -mt-0.5" />
            <span>{t.express ? 'Express, lo antes posible' : cap(t.schedule!)}</span>
          </p>
        )}
        <p className="flex gap-2.5 text-sm text-paper-ink leading-snug">
          <Ico name="nav-cuenta-relleno" className="h-6 w-6 -mt-0.5" />
          <span>Recibe: {t.receiver && t.receiver !== 'el mismo cliente' ? t.receiver : `${order.customerName} · ${order.customerPhone}`}</span>
        </p>
        <p className="flex gap-2.5 text-sm text-paper-ink leading-snug items-center">
          <img src={PAYMENT_ICONS[order.paymentMethod]} alt="" className="h-[18px] w-[18px] rounded object-contain shrink-0" />
          <span>{PAYMENT_LABELS[order.paymentMethod]} · {order.paymentStatus === 'VERIFIED' ? 'pago verificado' : !PAYS_UPFRONT.has(order.paymentMethod) ? 'pagas al recibir' : 'pendiente de verificación'}</span>
        </p>
      </section>}

      {/* Detalle / ticket, plegado para no alargar la pantalla */}
      <details className={`${card} group overflow-hidden`}>
        <summary className="list-none cursor-pointer px-4 h-14 flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-bold text-paper-ink">Detalle del pedido · {order.items.length} producto{order.items.length === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-paper-ink tabular-nums">
            S/ {Number(order.total).toFixed(2)}
            <ChevronDown className="h-4 w-4 text-paper-ink-soft transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
      <div className="border-t border-paper-line overflow-hidden">
        <div className="h-2 shrink-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(32,30,29,.18) 1.5px, transparent 1.5px)', backgroundSize: '10px 10px', backgroundPosition: 'center' }} />
        <div className="p-5">
        <div className="flex flex-col items-center text-center mb-4">
          <div className="h-11 w-11 rounded-full border-2 border-brand-blue-600 flex items-center justify-center mb-2">
            <span className="text-xs font-display font-semibold text-brand-blue-600">MARC</span>
          </div>
          <h3 className="font-display font-semibold text-paper-ink">Tu ticket</h3>
          <p className="text-xs tracking-[.08em] uppercase text-paper-ink-ghost font-mono">Pachacamac · {order.orderNumber}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono min-w-[420px]">
            <thead>
              <tr className="border-b-2 border-paper-ink text-paper-ink-ghost uppercase tracking-wide text-xs">
                <th className="text-left font-semibold pb-2">Cant.</th>
                <th className="text-left font-semibold pb-2">Unid.</th>
                <th className="text-left font-semibold pb-2">Producto</th>
                <th className="text-right font-semibold pb-2">P.Unit</th>
                <th className="text-right font-semibold pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map(item => {
                const unit = Number.isInteger(Number(item.quantity)) ? 'und' : 'kg'
                return (
                  <tr key={item.id} className="border-b border-dashed border-paper-line">
                    <td className="py-2 text-paper-ink-soft align-middle tabular-nums">{Number(item.quantity)}</td>
                    <td className="py-2 text-paper-ink-soft align-middle">{unit}</td>
                    <td className="py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-paper-surface shrink-0 overflow-hidden flex items-center justify-center">
                          {item.imageUrl
                            ? <img src={thumb(item.imageUrl, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            : <Package className="h-3 w-3 text-paper-ink-ghost" />}
                        </div>
                        <span className="text-paper-ink font-semibold truncate max-w-[140px]">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right text-paper-ink-soft tabular-nums">{Number(item.unitPrice).toFixed(2)}</td>
                    <td className="py-2 text-right text-paper-ink font-semibold tabular-nums">{Number(item.subtotal).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-paper-line mt-3 pt-3 space-y-2 text-sm">
          <div className="flex justify-between text-paper-ink-soft">
            <span>Subtotal</span><span className="tabular-nums">S/ {Number(order.subtotal).toFixed(2)}</span>
          </div>
          {Number(order.deliveryCost) > 0 && (
            <div className="flex justify-between text-sm text-paper-ink-soft mt-1">
              <span>Envío</span><span className="tabular-nums">S/ {Number(order.deliveryCost).toFixed(2)}</span>
            </div>
          )}
          {order.paymentMethod === 'CARD_CONTRAENTREGA' && cardCommission > 0 && (
            <div className="flex justify-between text-sm text-paper-ink-soft mt-1">
              <span>Comisión por tarjeta</span><span className="tabular-nums">S/ {cardCommission.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-display font-semibold text-base text-paper-ink">
            <span>TOTAL</span>
            <span className="text-brand-blue-700 tabular-nums">S/ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-paper-line mt-3 pt-3 space-y-1.5 text-sm text-paper-ink-soft">
          {!order.limited && <p>👤 {order.customerName} · {order.customerPhone}</p>}
          <p>{order.deliveryType === 'DELIVERY' ? `🚚 Delivery${order.address ? ` — ${order.address}, ${order.district}` : ''}` : '🏪 Recojo en tienda — Av. Manchay, Pachacamac'}</p>
          <p className="flex items-center gap-1.5">
            <img src={PAYMENT_ICONS[order.paymentMethod]} alt="" className="h-4 w-4 rounded object-contain" />
            {PAYMENT_LABELS[order.paymentMethod]} — {order.paymentStatus === 'VERIFIED' ? '✅ Pago verificado' : !PAYS_UPFRONT.has(order.paymentMethod) ? 'Al recibir' : '⏳ Pendiente de verificación'}
          </p>
        </div>
        </div>
      </div>
      </details>

      <section className={`${card} p-4 flex items-center justify-between gap-3`}>
        <div>
          <p className="font-bold text-sm text-paper-ink">¿Necesitas ayuda?</p>
          <p className="text-[13px] text-paper-ink-soft mt-0.5">Escríbenos con tu número de pedido</p>
        </div>
        <a href={whatsappLink(helpMsg)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#25D366] text-[#0B3B1E] font-bold px-4 h-11 rounded-xl text-sm shrink-0">
          <MessageCircle className="h-4 w-4" />WhatsApp
        </a>
      </section>

      <div className="flex gap-2.5 pt-1">
        <Link to="/" className="flex-1 bg-white shadow-card font-bold h-12 rounded-xl text-sm flex items-center justify-center text-paper-ink">
          Seguir comprando
        </Link>
        <Link to="/mis-pedidos" className="flex-1 bg-brand-blue-600 text-white font-bold h-12 rounded-xl text-sm flex items-center justify-center gap-1">
          Mis pedidos <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  )
}
