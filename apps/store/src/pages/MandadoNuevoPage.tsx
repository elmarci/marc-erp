import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Bike, Check, ChevronRight, FileText, LocateFixed, Minus, Package, Pill, Plus,
  ShoppingBasket, Trash2, UtensilsCrossed, Wine, Zap, CalendarClock, ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '../authStore'
import { BRAND_NAME, money, whatsappLink } from '../lib/storeInfo'
import {
  CATEGORIAS, coordsFromMapsLink, mandadoLink, mandadosApi, readMandados, rememberMandado,
  type Categoria, ESTADO_LABEL,
} from '../lib/mandados'

// "Te lo traemos" — el cliente pide que un repartidor de Marc le compre o
// recoja algo y lanza su oferta por el servicio. Vive dentro de la tienda
// (mismo link, misma cuenta): opción B elegida por el dueño, 2026-11-21.

const ICONS: Record<Categoria, typeof Pill> = {
  COMIDA: UtensilsCrossed, MEDICAMENTOS: Pill, ABARROTES: ShoppingBasket, LICORES: Wine, DOCUMENTOS: FileText, OTROS: Package,
}

type Linea = { key: number; descripcion: string; cantidad: number; precio: string }
const CONTACT_KEY = 'marc-checkout-contact' // mismo que el checkout
function savedContact(): { name?: string; phone?: string } {
  try { return JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}') } catch { return {} }
}

let seq = 1
const nuevaLinea = (descripcion = ''): Linea => ({ key: seq++, descripcion, cantidad: 1, precio: '' })
const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }

export function MandadoNuevoPage() {
  const navigate = useNavigate()
  const customer = useAuthStore((s) => s.customer)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()])
  const [dondeComprar, setDondeComprar] = useState('')
  const [recojoDireccion, setRecojoDireccion] = useState('')
  const [queEs, setQueEs] = useState('')
  const [direccion, setDireccion] = useState('')
  const [referencia, setReferencia] = useState('')
  const [mapsLink, setMapsLink] = useState('')
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [cuando, setCuando] = useState<'YA' | 'PROGRAMADO'>('YA')
  const [programado, setProgramado] = useState('')
  const [oferta, setOferta] = useState<number | null>(null)
  const [tope, setTope] = useState('')
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'YAPE'>('EFECTIVO')
  const [nombre, setNombre] = useState(customer?.name ?? savedContact().name ?? '')
  const [telefono, setTelefono] = useState(customer?.phone ?? savedContact().phone ?? '')
  const [nota, setNota] = useState('')
  const [mayorDeEdad, setMayorDeEdad] = useState(false)
  const [ventaLibre, setVentaLibre] = useState(false)

  const conCompra = categoria !== 'DOCUMENTOS'
  const cat = CATEGORIAS.find((c) => c.key === categoria)
  const fromLink = mapsLink ? coordsFromMapsLink(mapsLink) : null
  const destino = gps ?? fromLink

  // Disponibilidad y oferta sugerida en vivo (cambia con la ubicación).
  const { data: cot } = useQuery({
    queryKey: ['mandado-cotizar', conCompra, destino?.lat.toFixed(4), destino?.lng.toFixed(4)],
    queryFn: () => mandadosApi.cotizar({ conCompra, entregaLat: destino?.lat, entregaLng: destino?.lng }),
    refetchInterval: 30000,
  })
  useEffect(() => { if (cot && oferta === null) setOferta(cot.sugerida) }, [cot, oferta])

  const validas = lineas.filter((l) => l.descripcion.trim())
  const estimado = useMemo(() => validas.reduce((s, l) => s + (num(l.precio) ?? 0) * l.cantidad, 0), [validas])
  const todosConPrecio = validas.length > 0 && validas.every((l) => num(l.precio) != null)
  // Tope sugerido = lo estimado + 20 % de colchón, redondeado a S/ 5.
  const topeSugerido = estimado > 0 ? Math.min(cot?.maxAdelanto ?? 150, Math.ceil((estimado * 1.2) / 5) * 5) : null

  const setLinea = (key: number, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const compartirUbicacion = () => {
    if (!navigator.geolocation) { toast.error('Tu navegador no permite compartir ubicación.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false) },
      () => { setLocating(false); toast.error('No pudimos leer tu ubicación. Escribe la dirección o pega un link de Google Maps.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const nivelOferta = oferta == null || !cot ? null
    : oferta < cot.sugerida - 0.5 ? { t: 'Baja: puede que nadie la tome rápido', c: 'text-brand-achiote-600' }
    : oferta > cot.sugerida + 0.5 ? { t: 'Atractiva: la tomarán más rápido', c: 'text-brand-green-600' }
    : { t: 'Justa para la distancia', c: 'text-brand-blue-600' }

  const mutation = useMutation({
    mutationFn: () => mandadosApi.crear({
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim(),
      categoria: categoria!,
      conCompra,
      recojoNombre: conCompra ? dondeComprar.trim() || undefined : undefined,
      recojoDireccion: !conCompra ? recojoDireccion.trim() : undefined,
      entregaDireccion: direccion.trim() || (destino ? 'Ubicación compartida (GPS)' : ''),
      entregaReferencia: referencia.trim() || undefined,
      entregaLat: destino?.lat,
      entregaLng: destino?.lng,
      entregaMapsLink: mapsLink.trim() || undefined,
      programadoPara: cuando === 'PROGRAMADO' && programado ? new Date(programado).toISOString() : undefined,
      nota: [!conCompra && queEs.trim() ? `Qué es: ${queEs.trim()}` : '', nota.trim()].filter(Boolean).join(' · ') || undefined,
      ofertaCliente: oferta!,
      presupuestoMax: conCompra ? num(tope) ?? undefined : undefined,
      metodoPago,
      items: conCompra
        ? validas.map((l) => ({ descripcion: l.descripcion.trim(), cantidad: l.cantidad, precioEstimado: num(l.precio) ?? undefined }))
        : [],
      mayorDeEdad: categoria === 'LICORES' ? mayorDeEdad : undefined,
      ventaLibre: categoria === 'MEDICAMENTOS' ? ventaLibre : undefined,
    }),
    onSuccess: (m) => {
      rememberMandado(m.codigo, m.accessKey)
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: nombre.trim(), phone: telefono.trim() })) } catch { /* ignore */ }
      navigate(mandadoLink(m.codigo, m.accessKey), { replace: true })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
      toast.error(msg ?? 'No se pudo enviar. Revisa tu conexión e intenta otra vez.')
    },
  })

  const faltante = !categoria ? 'Elige qué necesitas'
    : conCompra && validas.length === 0 ? 'Agrega al menos una cosa a tu lista'
    : !conCompra && !recojoDireccion.trim() ? 'Indica de dónde recogemos'
    : !direccion.trim() && !destino ? 'Indica dónde lo entregamos'
    : cuando === 'PROGRAMADO' && !programado ? 'Elige fecha y hora'
    : categoria === 'LICORES' && !mayorDeEdad ? 'Confirma que eres mayor de edad'
    : categoria === 'MEDICAMENTOS' && !ventaLibre ? 'Confirma que son de venta libre'
    : nombre.trim().length < 2 ? 'Escribe tu nombre'
    : !/^9\d{8}$/.test(telefono.replace(/\D/g, '').slice(-9)) ? 'Escribe tu celular (9 dígitos)'
    : oferta == null ? 'Calculando oferta…'
    : null

  const waTexto = () => {
    const l = conCompra ? validas.map((x) => `• ${x.cantidad} × ${x.descripcion}${num(x.precio) ? ` (~${money(num(x.precio)!)})` : ''}`).join('\n') : `Recoger: ${recojoDireccion}`
    return `Hola ${BRAND_NAME}, quiero un mandado (${cat?.label ?? ''}):\n${l}\nEntregar en: ${direccion || mapsLink || 'mi ubicación'}\nOfrezco: ${oferta ? money(oferta) : ''} por el servicio.`
  }

  const recientes = readMandados()
  const { data: mios } = useQuery({ queryKey: ['mandados-mios'], queryFn: mandadosApi.mios, enabled: !!isLoggedIn })
  const activos = (mios ?? []).filter((m) => !['ENTREGADO', 'CANCELADO'].includes(m.estado))

  const card = 'bg-white rounded-2xl shadow-card p-4'
  const label = 'block text-[15px] font-semibold text-paper-ink mb-1.5'
  const input = 'w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none'
  const step = (n: number, title: string, sub?: string) => (
    <div className="flex items-start gap-2.5 mb-3.5">
      <span className="h-7 w-7 rounded-full bg-brand-blue-600 text-white text-sm font-extrabold flex items-center justify-center shrink-0" aria-hidden="true">{n}</span>
      <div>
        <h2 className="text-[17px] font-extrabold text-paper-ink leading-7">{title}</h2>
        {sub && <p className="text-[13px] text-paper-ink-soft leading-snug">{sub}</p>}
      </div>
    </div>
  )
  const pick = (active: boolean) => `rounded-xl border-2 ${active ? 'border-brand-blue-600 bg-brand-blue-50' : 'border-paper-line bg-white'}`

  return (
    <main className="max-w-2xl mx-auto px-4 pt-2 pb-44 md:pb-32">
      <Link to="/" className="inline-flex items-center gap-1 h-11 text-sm font-bold text-brand-blue-600">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Inicio
      </Link>

      {/* Cabecera: qué es y si hay repartidores ahora mismo. */}
      <header className="relative overflow-hidden rounded-3xl bg-brand-blue-700 text-white px-5 pt-5 pb-6 mb-4">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-brand-blue-500/50" />
        <div aria-hidden="true" className="absolute right-6 bottom-4 h-[3px] w-28 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.45)_0_14px,transparent_14px_24px)]" />
        <p className="relative text-[13px] font-bold uppercase tracking-wider text-brand-blue-100">Nuevo · Te lo traemos</p>
        <h1 className="relative mt-1 text-[28px] leading-[1.1] font-extrabold">Lo que necesites de Manchay, en tu puerta</h1>
        <p className="relative mt-2 text-[15px] text-brand-blue-100 leading-snug">
          Tú haces la lista y pones tu oferta. Un repartidor de Marc compra con su dinero y le pagas al recibir.
        </p>
        <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 h-9 text-[14px] font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${cot && cot.disponibles > 0 ? 'bg-[#8BE04E] shadow-[0_0_0_4px_rgba(139,224,78,.25)]' : 'bg-white/50'}`} />
          {!cot ? 'Viendo quién está en línea…'
            : cot.disponibles > 0 ? `${cot.disponibles} ${cot.disponibles === 1 ? 'repartidor' : 'repartidores'} en línea · llega en ~${cot.etaMin} min`
            : 'Ahora no hay repartidores en línea · puedes programarlo'}
        </div>
      </header>

      {(activos.length > 0 || recientes.length > 0) && (
        <section className="mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-paper-ink-soft mb-2">Tus solicitudes</h2>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {(activos.length > 0 ? activos.map((m) => ({ codigo: m.codigo, k: m.accessKey, estado: ESTADO_LABEL[m.estado] })) : recientes.slice(0, 4).map((r) => ({ ...r, estado: 'Ver estado' }))).map((m) => (
              <Link key={m.codigo} to={mandadoLink(m.codigo, m.k)} className="shrink-0 bg-white rounded-xl shadow-card px-3.5 py-2.5 flex items-center gap-2">
                <Bike className="h-5 w-5 text-brand-blue-600" aria-hidden="true" />
                <span className="text-sm"><b className="text-paper-ink">{m.codigo}</b><span className="block text-paper-ink-soft text-[13px]">{m.estado}</span></span>
                <ChevronRight className="h-4 w-4 text-paper-ink-ghost" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {/* 1. Qué */}
        <section className={card} aria-label="Qué necesitas">
          {step(1, '¿Qué necesitas?')}
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {CATEGORIAS.map((c) => {
              const Icon = ICONS[c.key]
              const active = categoria === c.key
              return (
                <button key={c.key} type="button" role="radio" aria-checked={active} onClick={() => setCategoria(c.key)}
                  className={`${pick(active)} min-h-[92px] p-2.5 flex flex-col items-center justify-center gap-1 text-center transition-colors`}>
                  <Icon className={`h-7 w-7 ${active ? 'text-brand-blue-600' : 'text-paper-ink'}`} strokeWidth={1.8} aria-hidden="true" />
                  <span className="font-bold text-paper-ink text-[14px] leading-tight">{c.label}</span>
                  <span className="text-[12px] text-paper-ink-soft leading-tight">{c.hint}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 2. Lista o recojo */}
        {categoria && conCompra && (
          <section className={card} aria-label="Tu lista">
            {step(2, 'Tu lista', 'Precio aproximado por unidad: opcional, ayuda al repartidor a saber cuánto llevar.')}
            <div className="space-y-2.5">
              {lineas.map((l, i) => (
                <div key={l.key} className="rounded-xl border border-paper-line p-2.5">
                  <div className="flex items-center gap-2">
                    <input value={l.descripcion} onChange={(e) => setLinea(l.key, { descripcion: e.target.value })}
                      aria-label={`Producto ${i + 1}`} placeholder={cat?.ejemplos[i % (cat.ejemplos.length || 1)] ?? 'Qué traemos'}
                      className="flex-1 min-w-0 h-11 bg-transparent px-1.5 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label="Quitar" className="h-10 w-10 flex items-center justify-center rounded-lg text-paper-ink-soft hover:bg-paper-surface">
                        <Trash2 className="h-[18px] w-[18px]" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex items-center rounded-lg bg-paper-surface">
                      <button type="button" aria-label="Menos" onClick={() => setLinea(l.key, { cantidad: Math.max(1, l.cantidad - 1) })} className="h-10 w-10 flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                      <span className="w-8 text-center font-bold tabular-nums">{l.cantidad}</span>
                      <button type="button" aria-label="Más" onClick={() => setLinea(l.key, { cantidad: Math.min(99, l.cantidad + 1) })} className="h-10 w-10 flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                    </div>
                    <label className="flex-1 flex items-center h-10 rounded-lg bg-paper-surface px-2.5 gap-1 text-paper-ink-soft">
                      <span className="text-sm">S/</span>
                      <input inputMode="decimal" value={l.precio} onChange={(e) => setLinea(l.key, { precio: e.target.value.replace(/[^\d.,]/g, '') })}
                        placeholder="c/u aprox." aria-label="Precio aproximado por unidad"
                        className="w-full bg-transparent text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none tabular-nums" />
                    </label>
                    {num(l.precio) && <span className="w-[72px] text-right text-sm font-bold tabular-nums text-paper-ink">{money(num(l.precio)! * l.cantidad)}</span>}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}
                className="w-full h-11 rounded-xl border-2 border-dashed border-paper-line flex items-center justify-center gap-1.5 text-[15px] font-bold text-brand-blue-600">
                <Plus className="h-4 w-4" />Agregar otra cosa
              </button>
              {estimado > 0 && (
                <div className="flex items-baseline justify-between px-1 pt-1">
                  <span className="text-sm text-paper-ink-soft">Compra aproximada{todosConPrecio ? '' : ' (sin los que no tienen precio)'}</span>
                  <span className="text-lg font-extrabold tabular-nums text-paper-ink">{money(estimado)}</span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="md-donde" className={label}>¿Dónde lo compramos? <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
              <input id="md-donde" value={dondeComprar} onChange={(e) => setDondeComprar(e.target.value)} className={input}
                placeholder={categoria === 'MEDICAMENTOS' ? 'Ej.: Inkafarma de la Av. Manchay' : categoria === 'COMIDA' ? 'Ej.: Pollería El Rancho, Portada' : 'Donde encuentres, o el lugar que prefieras'} />
            </div>
            {categoria === 'MEDICAMENTOS' && (
              <label className="mt-3 flex items-start gap-3 rounded-xl bg-paper-surface p-3 text-sm leading-snug">
                <input type="checkbox" checked={ventaLibre} onChange={(e) => setVentaLibre(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-blue-600" />
                Son medicinas de venta libre, o tengo la receta para mostrarla al repartidor.
              </label>
            )}
            {categoria === 'LICORES' && (
              <label className="mt-3 flex items-start gap-3 rounded-xl bg-paper-surface p-3 text-sm leading-snug">
                <input type="checkbox" checked={mayorDeEdad} onChange={(e) => setMayorDeEdad(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-blue-600" />
                Soy mayor de 18 años. Al entregar, el repartidor puede pedir tu DNI.
              </label>
            )}
          </section>
        )}

        {categoria === 'DOCUMENTOS' && (
          <section className={card} aria-label="Qué recogemos">
            {step(2, '¿Qué recogemos y dónde?')}
            <div className="space-y-3.5">
              <div>
                <label htmlFor="md-que" className={label}>¿Qué es?</label>
                <input id="md-que" value={queEs} onChange={(e) => setQueEs(e.target.value)} className={input} placeholder="Ej.: un sobre de documentos, unas llaves" />
              </div>
              <div>
                <label htmlFor="md-recojo" className={label}>Dirección de recojo</label>
                <input id="md-recojo" value={recojoDireccion} onChange={(e) => setRecojoDireccion(e.target.value)} className={input} placeholder="Mz, Lt, calle, y a quién preguntar" />
              </div>
            </div>
          </section>
        )}

        {/* 3. Dónde */}
        {categoria && (
          <section className={card} aria-label="Dónde lo entregamos">
            {step(3, '¿Dónde lo entregamos?', 'Si ya estás ahí, comparte tu ubicación. Si no, escribe la dirección o pega un link de Google Maps.')}
            <button type="button" onClick={compartirUbicacion}
              className={`${pick(!!gps)} w-full p-3.5 flex items-center gap-3 text-left`}>
              <LocateFixed className={`h-6 w-6 ${gps ? 'text-brand-blue-600' : 'text-paper-ink'}`} aria-hidden="true" />
              <span className="flex-1">
                <span className="block font-bold text-paper-ink">{gps ? 'Ubicación compartida' : locating ? 'Buscando tu ubicación…' : 'Estoy en el punto de entrega'}</span>
                <span className="block text-[13px] text-paper-ink-soft">{gps ? 'El repartidor llegará directo con GPS' : 'Usar mi ubicación actual'}</span>
              </span>
              {gps && <Check className="h-5 w-5 text-brand-blue-600" aria-hidden="true" />}
            </button>
            <div className="mt-3.5 space-y-3.5">
              <div>
                <label htmlFor="md-dir" className={label}>Dirección escrita</label>
                <input id="md-dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={input} autoComplete="street-address" placeholder="Mz A Lt 5, calle o avenida, zona" />
              </div>
              <div>
                <label htmlFor="md-ref" className={label}>Referencia <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
                <input id="md-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} className={input} placeholder="Puerta verde, frente al parque" />
              </div>
              {!gps && (
                <div>
                  <label htmlFor="md-maps" className={label}>Link de Google Maps <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
                  <input id="md-maps" value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} className={input} inputMode="url" placeholder="Pega aquí el link de la ubicación" />
                  {mapsLink && <p className={`mt-1.5 text-[13px] ${fromLink ? 'text-brand-green-600' : 'text-paper-ink-soft'}`}>{fromLink ? 'Ubicación leída del link ✓' : 'El repartidor abrirá tu link para llegar.'}</p>}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4. Cuándo */}
        {categoria && (
          <section className={card} aria-label="Cuándo">
            {step(4, '¿Para cuándo?')}
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setCuando('YA')} className={`${pick(cuando === 'YA')} p-3 flex items-center gap-2.5`}>
                <Zap className="h-5 w-5 text-brand-blue-600" aria-hidden="true" /><span className="font-bold text-paper-ink text-[15px]">Lo antes posible</span>
              </button>
              <button type="button" onClick={() => setCuando('PROGRAMADO')} className={`${pick(cuando === 'PROGRAMADO')} p-3 flex items-center gap-2.5`}>
                <CalendarClock className="h-5 w-5 text-brand-blue-600" aria-hidden="true" /><span className="font-bold text-paper-ink text-[15px]">Programar</span>
              </button>
            </div>
            {cuando === 'PROGRAMADO' && (
              <input type="datetime-local" value={programado} onChange={(e) => setProgramado(e.target.value)} aria-label="Fecha y hora"
                min={new Date(Date.now() + 30 * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                className={`${input} mt-3`} />
            )}
          </section>
        )}

        {/* 5. La oferta (la puja) */}
        {categoria && (
          <section className={card} aria-label="Tu oferta">
            {step(5, 'Tu oferta por el servicio', cot?.km != null ? `Sugerimos ${money(cot.sugerida)} por ~${cot.km} km de recorrido.` : `Sugerimos ${money(cot?.sugerida ?? 0)}. Comparte tu ubicación para afinarla.`)}
            <div className="flex items-center justify-between gap-3">
              <button type="button" aria-label="Bajar S/ 0.50" onClick={() => setOferta((o) => Math.max(1, (o ?? 0) - 0.5))}
                className="h-14 w-14 rounded-2xl bg-paper-surface flex items-center justify-center active:scale-95 transition-transform"><Minus className="h-6 w-6" /></button>
              <div className="text-center">
                <div className="text-[44px] leading-none font-extrabold tabular-nums tracking-tight text-paper-ink">{oferta != null ? money(oferta) : '—'}</div>
                {nivelOferta && <div className={`mt-1.5 text-[13px] font-bold ${nivelOferta.c}`}>{nivelOferta.t}</div>}
              </div>
              <button type="button" aria-label="Subir S/ 0.50" onClick={() => setOferta((o) => Math.min(200, (o ?? 0) + 0.5))}
                className="h-14 w-14 rounded-2xl bg-brand-blue-600 text-white flex items-center justify-center active:scale-95 transition-transform"><Plus className="h-6 w-6" /></button>
            </div>
            {cot && (
              <div className="mt-3 flex justify-center gap-2">
                {[cot.sugerida, cot.sugerida + 1, cot.sugerida + 2].map((v) => (
                  <button key={v} type="button" onClick={() => setOferta(v)}
                    className={`h-9 px-3.5 rounded-full text-sm font-bold tabular-nums ${oferta === v ? 'bg-paper-ink text-white' : 'bg-paper-surface text-paper-ink'}`}>
                    {money(v)}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 text-[13px] text-paper-ink-soft leading-snug text-center">
              Los repartidores pueden aceptarla o mandarte una contraoferta. Tú eliges.
            </p>

            {conCompra && (
              <div className="mt-4 rounded-xl bg-paper-surface p-3.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-brand-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-[15px] font-bold text-paper-ink leading-snug">Precios garantizados</p>
                    <p className="text-[13px] text-paper-ink-soft leading-snug">
                      Antes de pagar, el repartidor te manda el precio real de cada cosa y una foto de la boleta.
                      Si el total no pasa tu tope, compra sin esperar.
                    </p>
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 h-12 rounded-xl bg-white border border-paper-line px-3.5">
                  <span className="text-sm text-paper-ink-soft whitespace-nowrap">Compra sin preguntarme hasta S/</span>
                  <input inputMode="decimal" value={tope} onChange={(e) => setTope(e.target.value.replace(/[^\d.,]/g, ''))}
                    placeholder={topeSugerido ? String(topeSugerido) : '—'} aria-label="Tope de compra"
                    className="w-full bg-transparent text-base font-bold text-paper-ink outline-none tabular-nums" />
                </label>
                {topeSugerido && !tope && (
                  <button type="button" onClick={() => setTope(String(topeSugerido))} className="mt-1.5 text-[13px] font-bold text-brand-blue-600">
                    Usar {money(topeSugerido)} (tu estimado + 20 %)
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {(['EFECTIVO', 'YAPE'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMetodoPago(m)} className={`${pick(metodoPago === m)} h-12 flex items-center justify-center gap-2 font-bold text-[15px] text-paper-ink`}>
                  {m === 'YAPE' && <img src="/yape.png" alt="" className="h-5 w-5 rounded" />}
                  {m === 'EFECTIVO' ? 'Efectivo al recibir' : 'Yape al recibir'}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 6. Contacto */}
        {categoria && (
          <section className={card} aria-label="Tus datos">
            {step(6, 'Tus datos')}
            <div className="grid sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="md-nombre" className={label}>Nombre</label>
                <input id="md-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="md-tel" className={label}>Celular</label>
                <input id="md-tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={input} inputMode="tel" autoComplete="tel" placeholder="9XX XXX XXX" />
              </div>
            </div>
            <div className="mt-3.5">
              <label htmlFor="md-nota" className={label}>Algo más <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
              <textarea id="md-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={300}
                className="w-full bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 py-3 text-base text-paper-ink outline-none resize-none"
                placeholder="Ej.: si no hay pollo, que sea chaufa" />
            </div>
          </section>
        )}

        {categoria && (
          <a href={whatsappLink(waTexto())} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-11 text-[15px] font-bold text-[#128C4B]">
            ¿Prefieres pedirlo por WhatsApp? Envíanos esta lista
          </a>
        )}
      </div>

      {/* Barra fija: resumen y botón. Encima de la barra de pestañas en celular. */}
      {categoria && (
        <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 bg-white/95 backdrop-blur border-t border-paper-line pb-[env(safe-area-inset-bottom)] md:pb-0">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-paper-ink-soft leading-tight">
                {conCompra && estimado > 0 ? `Compra ~${money(estimado)} + servicio` : 'Servicio'}
              </p>
              <p className="text-xl font-extrabold tabular-nums text-paper-ink leading-tight">
                {oferta != null ? money((conCompra ? estimado : 0) + oferta) : '—'}
              </p>
            </div>
            <button type="button" disabled={!!faltante || mutation.isPending} onClick={() => mutation.mutate()}
              className="h-[52px] px-5 rounded-2xl bg-brand-green-600 disabled:bg-paper-line disabled:text-paper-ink-soft text-white font-extrabold text-[16px] flex items-center gap-2 shadow-float disabled:shadow-none active:scale-[.98] transition-transform max-w-[62%]">
              <span className="truncate">{mutation.isPending ? 'Enviando…' : faltante ?? 'Lanzar solicitud'}</span>
              {!faltante && !mutation.isPending && <ChevronRight className="h-5 w-5 shrink-0" />}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
