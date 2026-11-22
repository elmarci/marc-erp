import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Bike, Check, MessageCircle, Phone, Plus, Receipt, Star, X } from 'lucide-react'
import { money } from '../lib/storeInfo'
import { API_ORIGIN, ESTADO_LABEL, mandadosApi, rememberMandado, type Mandado } from '../lib/mandados'

// Seguimiento de una solicitud "Te lo traemos": ofertas de repartidores,
// aprobación de precios, foto de la boleta y en qué va.

const PASOS_COMPRA = ['ABIERTO', 'ACORDADO', 'COTIZADO', 'COMPRADO', 'EN_CAMINO', 'ENTREGADO'] as const
const PASOS_RECOJO = ['ABIERTO', 'ACORDADO', 'COMPRADO', 'EN_CAMINO', 'ENTREGADO'] as const
const PASO_LABEL: Record<string, string> = {
  ABIERTO: 'Oferta', ACORDADO: 'Repartidor', COTIZADO: 'Precios', COMPRADO: 'Comprado', EN_CAMINO: 'En camino', ENTREGADO: 'Entregado',
}
const errMsg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ?? 'No se pudo. Intenta otra vez.'

export function MandadoPage() {
  const { codigo = '' } = useParams()
  const [params] = useSearchParams()
  const k = params.get('k')
  const qc = useQueryClient()
  const [verBoleta, setVerBoleta] = useState(false)

  const { data: m, isLoading, error } = useQuery({
    queryKey: ['mandado', codigo, k],
    queryFn: () => mandadosApi.ver(codigo, k),
    refetchInterval: (q) => (q.state.data && ['ENTREGADO', 'CANCELADO'].includes(q.state.data.estado) ? false : 5000),
  })
  useEffect(() => { if (m) rememberMandado(m.codigo, m.accessKey) }, [m])

  const set = (d: Mandado) => qc.setQueryData(['mandado', codigo, k], d)
  const kk = k ?? m?.accessKey ?? null
  const subir = useMutation({ mutationFn: (monto: number) => mandadosApi.subirOferta(codigo, kk, monto), onSuccess: (d) => { set(d); toast.success(`Oferta subida a ${money(d.ofertaCliente)}`) }, onError: (e) => toast.error(errMsg(e)) })
  const aceptar = useMutation({ mutationFn: (id: string) => mandadosApi.aceptarOferta(codigo, kk, id), onSuccess: (d) => { set(d); toast.success('¡Listo! Tu repartidor ya va.') }, onError: (e) => toast.error(errMsg(e)) })
  const aprobar = useMutation({ mutationFn: () => mandadosApi.aprobarCompra(codigo, kk), onSuccess: (d) => { set(d); toast.success('Aprobado. Ya está comprando.') }, onError: (e) => toast.error(errMsg(e)) })
  const cancelar = useMutation({ mutationFn: () => mandadosApi.cancelar(codigo, kk), onSuccess: (d) => { set(d); toast('Solicitud cancelada') }, onError: (e) => toast.error(errMsg(e)) })

  if (isLoading) return <div className="flex justify-center py-24"><div className="h-9 w-9 border-2 border-brand-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (error || !m) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-bold text-paper-ink">No encontramos esta solicitud</p>
        <p className="mt-1 text-paper-ink-soft">Ábrela desde el mismo celular con que la hiciste, o ingresa a tu cuenta.</p>
        <Link to="/te-lo-traemos" className="mt-5 inline-flex h-12 items-center px-5 rounded-xl bg-brand-blue-600 text-white font-bold">Nueva solicitud</Link>
      </main>
    )
  }

  const pasos = m.conCompra ? PASOS_COMPRA : PASOS_RECOJO
  const estadoPaso = m.estado === 'COMPRA_APROBADA' ? 'COTIZADO' : m.estado
  const idx = pasos.indexOf(estadoPaso as never)
  const cancelable = ['ABIERTO', 'ACORDADO', 'COTIZADO', 'COMPRA_APROBADA'].includes(m.estado)
  const card = 'bg-white rounded-2xl shadow-card p-4'
  const fmtHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <main className="max-w-2xl mx-auto px-4 pt-2 pb-32">
      <Link to="/te-lo-traemos" className="inline-flex items-center gap-1 h-11 text-sm font-bold text-brand-blue-600">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Te lo traemos
      </Link>

      <header className="rounded-3xl bg-brand-blue-700 text-white px-5 py-5 mb-4">
        <p className="text-[13px] font-bold uppercase tracking-wider text-brand-blue-100">{m.codigo}{m.programadoPara ? ` · para ${fmtHora(m.programadoPara)}` : ''}</p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold">{ESTADO_LABEL[m.estado]}</h1>
        {m.estado !== 'CANCELADO' && (
          <ol className="mt-4 flex gap-1" aria-label="Avance">
            {pasos.map((p, i) => (
              <li key={p} className="flex-1">
                <span className={`block h-1.5 rounded-full ${i <= idx ? 'bg-[#8BE04E]' : 'bg-white/20'}`} />
                <span className={`mt-1 block text-[11px] ${i === idx ? 'font-bold text-white' : 'text-brand-blue-100'}`}>{PASO_LABEL[p]}</span>
              </li>
            ))}
          </ol>
        )}
        {m.estado === 'CANCELADO' && m.motivoCancelacion && <p className="mt-1 text-brand-blue-100">{m.motivoCancelacion}</p>}
      </header>

      <div className="space-y-4">
        {/* Buscando: radar + ofertas recibidas + subir la oferta */}
        {m.estado === 'ABIERTO' && (
          <section className={card} aria-label="Ofertas">
            <div className="flex items-center gap-4">
              <span className="relative h-14 w-14 shrink-0">
                <span className="absolute inset-0 rounded-full bg-brand-blue-200 animate-ping" />
                <span className="relative h-14 w-14 rounded-full bg-brand-blue-600 text-white flex items-center justify-center"><Bike className="h-7 w-7" /></span>
              </span>
              <div className="flex-1">
                <p className="text-[15px] text-paper-ink-soft">Tu oferta</p>
                <p className="text-[32px] leading-none font-extrabold tabular-nums text-paper-ink">{money(m.ofertaCliente)}</p>
              </div>
              <button type="button" onClick={() => subir.mutate(m.ofertaCliente + 1)} disabled={subir.isPending}
                className="h-12 px-4 rounded-xl bg-paper-surface font-bold text-paper-ink flex items-center gap-1.5 active:scale-95 transition-transform">
                <Plus className="h-4 w-4" />S/ 1
              </button>
            </div>
            <p className="mt-3 text-[13px] text-paper-ink-soft leading-snug">
              Avisamos a los repartidores en línea. El primero que acepte tu oferta va de frente; si alguien te propone otro precio, aparece aquí.
            </p>

            {m.ofertas.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <h2 className="text-[13px] font-bold uppercase tracking-wide text-paper-ink-soft">Contraofertas</h2>
                {m.ofertas.map((o) => (
                  <div key={o.id} className="rounded-xl border-2 border-paper-line p-3 flex items-center gap-3">
                    <span className="h-11 w-11 rounded-full bg-brand-blue-50 text-brand-blue-700 font-extrabold flex items-center justify-center shrink-0">
                      {o.rider.nombre.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-paper-ink leading-tight">{o.rider.nombre}
                        {o.rider.calificacion != null && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[13px] text-paper-ink-soft"><Star className="h-3.5 w-3.5 fill-brand-sun-500 text-brand-sun-500" />{o.rider.calificacion.toFixed(1)}</span>}
                      </p>
                      <p className="text-[13px] text-paper-ink-soft">Llega en ~{o.etaMin} min{o.rider.moto ? ` · ${o.rider.moto}` : ''}</p>
                      {o.mensaje && <p className="text-[13px] text-paper-ink mt-0.5">“{o.mensaje}”</p>}
                    </div>
                    <button type="button" onClick={() => aceptar.mutate(o.id)} disabled={aceptar.isPending}
                      className="h-12 px-3.5 rounded-xl bg-brand-green-600 text-white font-extrabold tabular-nums active:scale-95 transition-transform">
                      {money(o.monto)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Precios reales por aprobar */}
        {m.conCompra && m.totalCompra != null && (
          <section className={`${card} ${m.estado === 'COTIZADO' ? 'ring-2 ring-brand-achiote-500' : ''}`} aria-label="Precios">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-extrabold text-paper-ink">Precios reales</h2>
              {m.boletaFoto && (
                <button type="button" onClick={() => setVerBoleta(true)} className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue-600">
                  <Receipt className="h-4 w-4" />Ver boleta
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-paper-ink-soft text-[12px] uppercase tracking-wide"><th className="text-left font-bold pb-1">Producto</th><th className="text-right font-bold pb-1">Tú</th><th className="text-right font-bold pb-1">Real</th></tr></thead>
              <tbody>
                {m.items.map((it) => (
                  <tr key={it.id} className="border-t border-paper-line">
                    <td className="py-2 pr-2 text-paper-ink">{it.cantidad} × {it.descripcion}</td>
                    <td className="py-2 text-right tabular-nums text-paper-ink-soft">{it.precioEstimado != null ? money(it.precioEstimado * it.cantidad) : '—'}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-paper-ink">{it.noHabia ? <span className="text-brand-achiote-600">No había</span> : it.precioReal != null ? money(it.precioReal * it.cantidad) : '—'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-paper-ink">
                  <td className="pt-2 font-extrabold text-paper-ink">Compra</td>
                  <td className="pt-2 text-right tabular-nums text-paper-ink-soft">{m.totalEstimado > 0 ? money(m.totalEstimado) : ''}</td>
                  <td className="pt-2 text-right tabular-nums font-extrabold text-paper-ink">{money(m.totalCompra)}</td>
                </tr>
              </tbody>
            </table>
            {m.estado === 'COTIZADO' && (
              <div className="mt-4">
                <p className="text-[13px] text-paper-ink-soft mb-2">Pasa tu tope de compra. Apruébalo para que el repartidor pague, o llámalo para cambiar algo.</p>
                <button type="button" onClick={() => aprobar.mutate()} disabled={aprobar.isPending}
                  className="w-full h-[52px] rounded-2xl bg-brand-green-600 text-white font-extrabold text-[16px] flex items-center justify-center gap-2 active:scale-[.98] transition-transform">
                  <Check className="h-5 w-5" />Aprobar {money(m.totalCompra)}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Repartidor */}
        {m.rider && (
          <section className={card} aria-label="Tu repartidor">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-brand-blue-600 text-white font-extrabold flex items-center justify-center">{m.rider.nombre.slice(0, 1)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-paper-ink">{m.rider.nombre}</p>
                <p className="text-[13px] text-paper-ink-soft">{[m.rider.moto, m.rider.placa].filter(Boolean).join(' · ') || 'Repartidor de Marc'}</p>
              </div>
              <a href={`tel:${m.rider.telefono}`} aria-label="Llamar" className="h-11 w-11 rounded-xl bg-brand-blue-50 text-brand-blue-600 flex items-center justify-center"><Phone className="h-5 w-5" /></a>
              <a href={`https://wa.me/51${m.rider.telefono}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="h-11 w-11 rounded-xl bg-brand-blue-50 text-brand-blue-600 flex items-center justify-center"><MessageCircle className="h-5 w-5" /></a>
            </div>
            {m.rider.ubicacion && (
              <a href={`https://www.google.com/maps?q=${m.rider.ubicacion.lat},${m.rider.ubicacion.lng}`} target="_blank" rel="noreferrer"
                className="mt-3 block text-center text-sm font-bold text-brand-blue-600">Ver dónde va ahora</a>
            )}
          </section>
        )}

        {/* Cuánto pagar */}
        <section className={card} aria-label="Resumen">
          <div className="flex justify-between text-sm py-1"><span className="text-paper-ink-soft">Compra</span><span className="tabular-nums text-paper-ink">{m.totalCompra != null ? money(m.totalCompra) : m.conCompra ? (m.totalEstimado > 0 ? `~${money(m.totalEstimado)}` : 'Por confirmar') : 'Sin compra'}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="text-paper-ink-soft">Servicio</span><span className="tabular-nums text-paper-ink">{money(m.tarifaAcordada ?? m.ofertaCliente)}{m.tarifaAcordada == null ? ' (tu oferta)' : ''}</span></div>
          <div className="flex justify-between items-baseline border-t border-paper-line mt-1.5 pt-2">
            <span className="font-extrabold text-paper-ink">Pagas al recibir · {m.metodoPago === 'YAPE' ? 'Yape' : 'Efectivo'}</span>
            <span className="text-xl font-extrabold tabular-nums text-paper-ink">{money(m.totalACobrar ?? ((m.totalCompra ?? m.totalEstimado) + m.ofertaCliente))}</span>
          </div>
          <div className="mt-3 text-[13px] text-paper-ink-soft leading-snug">
            Entrega: {m.entrega.direccion}{m.entrega.referencia ? ` (${m.entrega.referencia})` : ''}
          </div>
        </section>

        {cancelable && (
          <button type="button" onClick={() => { if (confirm('¿Cancelar esta solicitud?')) cancelar.mutate() }}
            className="w-full h-11 text-[15px] font-bold text-paper-ink-soft">Cancelar solicitud</button>
        )}
        {(m.estado === 'ENTREGADO' || m.estado === 'CANCELADO') && (
          <Link to="/te-lo-traemos" className="w-full h-[52px] rounded-2xl bg-brand-blue-600 text-white font-extrabold flex items-center justify-center">Pedir otra cosa</Link>
        )}
      </div>

      {verBoleta && m.boletaFoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setVerBoleta(false)}>
          <button type="button" aria-label="Cerrar" className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/15 text-white flex items-center justify-center"><X /></button>
          <img src={`${API_ORIGIN}${m.boletaFoto}`} alt="Boleta de la compra" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </main>
  )
}
