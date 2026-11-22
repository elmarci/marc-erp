import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Camera, Check, MessageCircle, Minus, Navigation, Phone, Plus, Store } from 'lucide-react'
import {
  aceptarMandado, apiErrorMessage, contraofertarMandado, enviarPrecios, fetchMandado, liberarMandado,
  mandadoEnCamino, mandadoEntregado, marcarComprado, retirarContraoferta, API_ORIGIN,
} from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { HoldClaimButton } from '../components/HoldClaimButton'
import { PrimaryButton } from '../components/PrimaryButton'
import { EntregaChip } from '../components/TripCard'
import { entregaInfo, fmtDist, navLink, soles } from '../lib/formato'
import { adelanto, CATEGORIA, ESTADO_RIDER } from '../lib/mandados'
import { cn } from '../lib/cn'
import type { Mandado } from '../types'

// Detalle de un mandado: un paso a la vez, con un solo botón grande abajo.
// ABIERTO → aceptar / contraofertar · ACORDADO → precios reales (o "ya lo
// recogí") · COTIZADO → esperar al cliente · COMPRA_APROBADA → foto de la
// boleta · COMPRADO → salir · EN_CAMINO → cobrar y entregar.

const PASOS_COMPRA = ['Acordado', 'Precios', 'Compra', 'En camino', 'Entregado']
const PASOS_RECOJO = ['Acordado', 'Recogido', 'En camino', 'Entregado']
function pasoIdx(m: Mandado) {
  const orden = m.conCompra
    ? ['ACORDADO', 'COTIZADO', 'COMPRA_APROBADA', 'COMPRADO', 'EN_CAMINO', 'ENTREGADO']
    : ['ACORDADO', 'COMPRADO', 'EN_CAMINO', 'ENTREGADO']
  const i = orden.indexOf(m.estado)
  if (!m.conCompra) return i
  return [0, 1, 2, 2, 3, 4][i] ?? -1
}
const num = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 && s.trim() !== '' ? n : null }

export function MandadoDetallePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [ofertaOpen, setOfertaOpen] = useState(false)
  const [confirmar, setConfirmar] = useState<null | 'liberar' | 'entregado' | 'camino'>(null)
  const [precios, setPrecios] = useState<Record<string, { precio: string; noHabia: boolean }>>({})
  const [boleta, setBoleta] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: m, isLoading, error } = useQuery({
    queryKey: ['mandado', id], queryFn: () => fetchMandado(id),
    refetchInterval: (q) => (q.state.data && ['ENTREGADO', 'CANCELADO'].includes(q.state.data.estado) ? false : 6000),
  })

  // Precarga el formulario de precios con lo que ya se mandó (si se corrige).
  useEffect(() => {
    if (!m) return
    setPrecios((prev) => {
      if (Object.keys(prev).length) return prev
      const init: Record<string, { precio: string; noHabia: boolean }> = {}
      for (const it of m.items) init[it.id] = { precio: it.precioReal != null ? String(it.precioReal) : '', noHabia: it.noHabia }
      return init
    })
  }, [m])

  if (isLoading) return <div className="flex h-full items-center justify-center text-ink-soft">Cargando…</div>
  if (error || !m) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="num text-xl font-semibold">{apiErrorMessage(error, 'No se encontró el mandado')}</div>
        <PrimaryButton className="w-full" onClick={() => navigate('/mandados')}>Volver a Mandados</PrimaryButton>
      </div>
    )
  }

  const run = async (fn: () => Promise<Mandado>, ok?: string) => {
    setBusy(true)
    try {
      const d = await fn()
      qc.setQueryData(['mandado', id], d)
      qc.invalidateQueries({ queryKey: ['mandados-disponibles'] })
      qc.invalidateQueries({ queryKey: ['mandados-mios'] })
      if (ok) toast.success(ok)
      return d
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cat = CATEGORIA[m.categoria]
  const Icon = cat.icon
  const ent = entregaInfo(m.programadoPara ? { tipo: 'PROGRAMADO', at: m.programadoPara } : { tipo: 'EXPRESS', at: m.createdAt })
  const ad = adelanto(m)
  const pasos = m.conCompra ? PASOS_COMPRA : PASOS_RECOJO
  const idx = pasoIdx(m)
  // Antes de comprar/recoger se navega al punto de compra; después, al cliente.
  const haciaCliente = ['COMPRADO', 'EN_CAMINO', 'ENTREGADO'].includes(m.estado)
  const nav = haciaCliente
    ? navLink({ ...m.entrega })
    : navLink({ lat: m.recojo?.lat, lng: m.recojo?.lng, direccion: m.recojo?.direccion ?? m.recojo?.nombre ?? null }) ?? navLink({ ...m.entrega })
  const totalPrecios = m.items.reduce((s, it) => {
    const p = precios[it.id]
    if (!p || p.noHabia) return s
    return s + (num(p.precio) ?? 0) * it.cantidad
  }, 0)
  const preciosCompletos = m.items.every((it) => precios[it.id]?.noHabia || num(precios[it.id]?.precio ?? '') != null)
  const editarPrecios = m.mio && m.conCompra && (m.estado === 'ACORDADO' || m.estado === 'COTIZADO')

  return (
    <div className="flex h-full flex-col">
      <header className="lane flex-none bg-night px-4 pb-7 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => navigate('/mandados')} aria-label="Volver" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><ArrowLeft size={20} /></button>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-medium"><Icon size={14} />{cat.label} · {m.codigo}</span>
          <span className="w-10" />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[13px] text-white/70">{m.tarifaAcordada != null ? 'Ganas' : 'El cliente ofrece'}</div>
            <div className="num text-[40px] font-semibold leading-none">{soles(m.tarifaAcordada ?? m.ofertaCliente)}</div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-white/70">{m.estado === 'EN_CAMINO' ? 'Cobras en total' : ad.texto}</div>
            <div className="num text-[24px] font-semibold leading-tight">
              {m.estado === 'EN_CAMINO' && m.totalACobrar != null ? soles(m.totalACobrar) : ad.monto != null && ad.monto > 0 ? soles(ad.monto) : '—'}
            </div>
          </div>
        </div>
        {m.mio && m.estado !== 'CANCELADO' && (
          <div className="mt-4">
            <div className="flex gap-1">{pasos.map((_, i) => <i key={i} className={cn('h-[3px] flex-1 rounded-full', i <= idx ? 'bg-lime-on' : 'bg-white/20')} />)}</div>
            <div className="mt-1.5 flex justify-between text-[11px] text-white/60">{pasos.map((p, i) => <span key={p} className={cn(i === idx && 'font-semibold text-white')}>{p}</span>)}</div>
          </div>
        )}
      </header>

      <div className="no-scrollbar -mt-3 flex flex-1 flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-bg px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          {m.mio
            ? <span className="inline-flex h-7 items-center rounded-full bg-blue px-2.5 text-[13px] font-semibold text-white">{ESTADO_RIDER[m.estado]}</span>
            : <EntregaChip texto={m.programadoPara ? ent.texto : 'Lo antes posible'} urgencia={ent.urgencia} />}
          {m.distanciaKm != null && <span className="text-[13px] tabular-nums text-ink-faint">{fmtDist(m.distanciaKm)} de recorrido</span>}
        </div>

        {m.estado === 'CANCELADO' && <div className="rounded-2xl bg-bad-soft px-4 py-3 text-[15px] font-medium text-bad">Cancelado. No compres nada.</div>}
        {m.estado === 'COTIZADO' && (
          <div className="rounded-2xl bg-warn-soft px-4 py-3 text-[15px] leading-snug text-warn">
            <b>Espera antes de pagar.</b> El total pasa el tope del cliente; le pedimos que apruebe {soles(m.totalCompra ?? 0)}. Si tarda, llámalo.
          </div>
        )}
        {m.estado === 'COMPRA_APROBADA' && (
          <div className="rounded-2xl bg-blue-soft px-4 py-3 text-[15px] leading-snug text-blue"><b>Compra aprobada.</b> Paga, toma foto de la boleta y sigue.</div>
        )}

        {/* Ruta: dónde comprar/recoger → dónde entregar */}
        <section className="rounded-[20px] bg-card px-4 py-3.5 shadow-card">
          <div className="grid grid-cols-[14px_1fr] gap-x-3">
            <i className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-ink" />
            <div>
              <div className="text-[13px] text-ink-soft">{m.conCompra ? 'Comprar en' : 'Recoger en'}</div>
              <div className="font-semibold leading-snug">{m.recojo?.nombre || m.recojo?.direccion || 'Donde encuentres (el más cercano)'}</div>
              {m.recojo?.nombre && m.recojo?.direccion && <div className="text-sm text-ink-soft">{m.recojo.direccion}</div>}
            </div>
            <i className="mx-auto my-1 h-6 w-0.5 bg-line" />
            <div />
            <i className="mt-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
            <div>
              <div className="text-[13px] text-ink-soft">Entregar a {m.clienteNombre}</div>
              <div className="num text-[19px] font-semibold leading-snug">{m.entrega.direccion}</div>
              {m.entrega.referencia && <div className="text-sm text-ink-soft">{m.entrega.referencia}</div>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {nav && (
              <a href={nav} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-soft text-[15px] font-semibold text-blue">
                <Navigation size={17} />Navegar
              </a>
            )}
            {m.mio && m.clienteTelefono && (
              <>
                <a href={`tel:${m.clienteTelefono}`} aria-label="Llamar al cliente" className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-blue"><Phone size={19} /></a>
                <a href={`https://wa.me/51${m.clienteTelefono}`} target="_blank" rel="noreferrer" aria-label="WhatsApp al cliente" className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-blue"><MessageCircle size={19} /></a>
              </>
            )}
          </div>
        </section>

        {/* Lista: precios del cliente y, cuando toca, los reales */}
        {m.conCompra && (
          <section className="rounded-[20px] bg-card px-4 shadow-card">
            <div className="flex items-center justify-between py-3">
              <h2 className="font-semibold">Lista ({m.items.length})</h2>
              {m.presupuestoMax != null && <span className="text-[13px] text-ink-soft">Tope sin preguntar: <b className="text-ink">{soles(m.presupuestoMax)}</b></span>}
            </div>
            <ul className="flex flex-col">
              {m.items.map((it) => {
                const p = precios[it.id] ?? { precio: '', noHabia: false }
                return (
                  <li key={it.id} className="border-t border-line py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[16px] font-medium leading-snug"><span className="num font-semibold">{it.cantidad} ×</span> {it.descripcion}</div>
                        <div className="text-[13px] text-ink-soft">
                          {it.precioEstimado != null ? `Cliente estima ${soles(it.precioEstimado)} c/u` : 'Sin precio estimado'}
                        </div>
                      </div>
                      {!editarPrecios && it.precioReal != null && <span className="num flex-none text-[16px] font-semibold">{soles(it.precioReal * it.cantidad)}</span>}
                      {!editarPrecios && it.noHabia && <span className="flex-none text-sm font-semibold text-warn">No había</span>}
                    </div>
                    {editarPrecios && (
                      <div className="mt-2 flex items-center gap-2">
                        <label className={cn('flex h-12 flex-1 items-center gap-1 rounded-xl border px-3', p.noHabia ? 'border-line bg-bg opacity-50' : 'border-line bg-card focus-within:border-blue')}>
                          <span className="text-ink-soft">S/</span>
                          <input inputMode="decimal" disabled={p.noHabia} value={p.precio} placeholder="precio c/u"
                            onChange={(e) => setPrecios((s) => ({ ...s, [it.id]: { ...p, precio: e.target.value.replace(/[^\d.,]/g, '') } }))}
                            className="num w-full bg-transparent text-[18px] font-semibold outline-none placeholder:text-[15px] placeholder:font-normal placeholder:text-ink-ghost" />
                        </label>
                        <button type="button" onClick={() => setPrecios((s) => ({ ...s, [it.id]: { ...p, noHabia: !p.noHabia } }))}
                          className={cn('h-12 rounded-xl px-3 text-[14px] font-semibold', p.noHabia ? 'bg-warn-soft text-warn' : 'bg-bg text-ink-soft')}>
                          No hay
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="flex items-baseline justify-between border-t-2 border-ink py-3">
              <span className="font-semibold">{editarPrecios ? 'Total real' : m.totalCompra != null ? 'Compra' : 'Estimado del cliente'}</span>
              <span className="num text-[22px] font-semibold">{soles(editarPrecios ? totalPrecios : m.totalCompra ?? m.totalEstimado)}</span>
            </div>
          </section>
        )}

        {m.nota && (
          <section className="rounded-[20px] bg-card px-4 py-3 text-[15px] shadow-card">
            <div className="text-[13px] text-ink-soft">Nota</div>
            <p className="mt-0.5 leading-snug">{m.nota}</p>
          </section>
        )}

        {m.boletaFoto && (
          <a href={`${API_ORIGIN}${m.boletaFoto}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-3 shadow-card">
            <img src={`${API_ORIGIN}${m.boletaFoto}`} alt="Boleta" className="h-14 w-14 rounded-xl object-cover" />
            <span className="text-[15px] font-medium">Boleta enviada al cliente</span>
          </a>
        )}

        {m.mio && m.estado === 'ACORDADO' && (
          <button onClick={() => setConfirmar('liberar')} className="h-11 text-[15px] font-medium text-ink-soft">No puedo hacerlo, soltar mandado</button>
        )}
      </div>

      {/* Acción principal: una sola, grande, según el paso */}
      <div className="flex-none border-t border-line bg-bg px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {m.estado === 'ABIERTO' && (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => setOfertaOpen(true)}
              className="h-14 flex-none rounded-2xl border border-line bg-card px-4 text-[15px] font-semibold">
              {m.miOferta ? `Mi oferta ${soles(m.miOferta.monto)}` : 'Otro precio'}
            </button>
            <HoldClaimButton className="h-14 flex-1 rounded-2xl text-[17px]" disabled={busy}
              onConfirm={() => run(() => aceptarMandado(m.id), '¡Es tuyo! Ve a comprar.')}
              label={`Aceptar ${soles(m.ofertaCliente)}`} />
          </div>
        )}
        {editarPrecios && (
          <PrimaryButton className="h-14 w-full text-[17px]" disabled={busy || !preciosCompletos}
            onClick={() => run(() => enviarPrecios(m.id, m.items.map((it) => ({ id: it.id, noHabia: precios[it.id]?.noHabia, precioReal: precios[it.id]?.noHabia ? undefined : num(precios[it.id]?.precio ?? '') ?? undefined }))))
              .then((d) => d && toast(d.estado === 'COMPRA_APROBADA' ? 'Cabe en el tope del cliente: ya puedes pagar.' : 'Enviado. Espera que el cliente apruebe.'))}>
            {preciosCompletos ? `${m.estado === 'COTIZADO' ? 'Corregir' : 'Enviar'} precios · ${soles(totalPrecios)}` : 'Pon el precio de cada cosa'}
          </PrimaryButton>
        )}
        {m.mio && !m.conCompra && m.estado === 'ACORDADO' && (
          <PrimaryButton className="h-14 w-full text-[17px]" disabled={busy} onClick={() => run(() => marcarComprado(m.id), 'Recogido.')}>
            <Store size={20} />Ya lo recogí
          </PrimaryButton>
        )}
        {m.mio && m.estado === 'COMPRA_APROBADA' && (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setBoleta(e.target.files?.[0] ?? null)} />
            {!boleta ? (
              <PrimaryButton className="h-14 w-full text-[17px]" onClick={() => fileRef.current?.click()}><Camera size={20} />Foto de la boleta</PrimaryButton>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="h-14 rounded-2xl border border-line bg-card px-4 text-[15px] font-semibold">Otra foto</button>
                <PrimaryButton className="h-14 flex-1 text-[17px]" disabled={busy} onClick={() => run(() => marcarComprado(m.id, boleta), 'Compra registrada.')}>
                  <Check size={20} />{busy ? 'Subiendo…' : 'Ya compré'}
                </PrimaryButton>
              </div>
            )}
          </>
        )}
        {m.mio && m.estado === 'COMPRADO' && (
          <PrimaryButton className="h-14 w-full text-[17px]" disabled={busy} onClick={() => setConfirmar('camino')}>Salir a entregar</PrimaryButton>
        )}
        {m.mio && m.estado === 'EN_CAMINO' && (
          <PrimaryButton className="h-14 w-full text-[17px]" disabled={busy} onClick={() => setConfirmar('entregado')}>
            Entregado · cobré {soles(m.totalACobrar ?? 0)}
          </PrimaryButton>
        )}
        {(m.estado === 'ENTREGADO' || m.estado === 'CANCELADO' || m.estado === 'COTIZADO' && !editarPrecios) && (
          <PrimaryButton variant="secondary" className="h-14 w-full" onClick={() => navigate('/mandados')}>Volver a Mandados</PrimaryButton>
        )}
      </div>

      {ofertaOpen && (
        <ContraofertaSheet
          m={m}
          onClose={() => setOfertaOpen(false)}
          onSend={async (monto, eta) => { const d = await run(() => contraofertarMandado(m.id, monto, eta), 'Oferta enviada al cliente.'); if (d) setOfertaOpen(false) }}
          onRetirar={async () => { await run(() => retirarContraoferta(m.id), 'Oferta retirada.'); setOfertaOpen(false) }}
        />
      )}
      {confirmar === 'liberar' && (
        <ConfirmSheet title="¿Soltar este mandado?" description="Vuelve a quedar disponible para otro repartidor. Avisamos al cliente." confirmLabel="Sí, soltar"
          onCancel={() => setConfirmar(null)} onConfirm={() => { setConfirmar(null); run(() => liberarMandado(m.id)).then((d) => d && navigate('/mandados')) }} />
      )}
      {confirmar === 'camino' && (
        <ConfirmSheet title="¿Sales a entregar?" description={`Al cliente le avisamos que tenga listo ${soles(m.totalACobrar ?? 0)}.`} confirmLabel="Salir a entregar"
          onCancel={() => setConfirmar(null)} onConfirm={() => { setConfirmar(null); run(() => mandadoEnCamino(m.id)) }} />
      )}
      {confirmar === 'entregado' && (
        <ConfirmSheet title={`¿Cobraste ${soles(m.totalACobrar ?? 0)}?`}
          description={`${m.conCompra ? `Compra ${soles(m.totalCompra ?? 0)} + servicio ${soles(m.tarifaAcordada ?? 0)}` : `Servicio ${soles(m.tarifaAcordada ?? 0)}`} · ${m.metodoPago === 'YAPE' ? 'Yape' : 'Efectivo'}.${m.categoria === 'LICORES' ? ' Recuerda pedir DNI.' : ''}`}
          confirmLabel="Sí, entregado" onCancel={() => setConfirmar(null)}
          onConfirm={() => { setConfirmar(null); run(() => mandadoEntregado(m.id), '¡Mandado entregado!') }} />
      )}
    </div>
  )
}

function ContraofertaSheet({ m, onClose, onSend, onRetirar }: { m: Mandado; onClose: () => void; onSend: (monto: number, eta: number) => void; onRetirar: () => void }) {
  const [monto, setMonto] = useState(m.miOferta?.monto ?? Math.max(m.ofertaCliente + 1, m.ofertaSugerida))
  const [eta, setEta] = useState(m.miOferta?.etaMin ?? 25)
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="num text-xl font-semibold">Proponer otro precio</h2>
      <p className="mt-1 text-[15px] text-ink-soft">El cliente ofrece {soles(m.ofertaCliente)}. Si acepta el tuyo, el mandado es tuyo.</p>
      <div className="mt-5 flex items-center justify-between">
        <button aria-label="Bajar" onClick={() => setMonto((v) => Math.max(1, v - 0.5))} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg"><Minus /></button>
        <div className="num text-[42px] font-semibold">{soles(monto)}</div>
        <button aria-label="Subir" onClick={() => setMonto((v) => Math.min(200, v + 0.5))} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue text-white"><Plus /></button>
      </div>
      <div className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Llego en</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[15, 25, 40, 60].map((v) => (
          <button key={v} onClick={() => setEta(v)} className={cn('h-12 rounded-xl text-[15px] font-semibold', eta === v ? 'bg-ink text-white' : 'bg-bg')}>{v} min</button>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton className="h-14 text-[17px]" onClick={() => onSend(monto, eta)}>Enviar {soles(monto)} · {eta} min</PrimaryButton>
        {m.miOferta && <button onClick={onRetirar} className="h-12 text-[15px] font-medium text-bad">Retirar mi oferta</button>}
        <button onClick={onClose} className="h-12 text-[15px] font-medium text-ink-soft">Cancelar</button>
      </div>
    </BottomSheet>
  )
}
