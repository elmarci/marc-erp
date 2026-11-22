import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { fetchMandadosDisponibles, fetchMisMandados } from '../api'
import { AppHeader, HeaderTabs } from '../components/AppHeader'
import { EntregaChip, TripCard } from '../components/TripCard'
import { entregaInfo, fmtDist, soles } from '../lib/formato'
import { adelanto, CATEGORIA, ESTADO_RIDER } from '../lib/mandados'
import type { Mandado } from '../types'

// Mandados: el cliente pide que le compren o recojan algo y ofrece un pago.
// Aquí se ve cuánto ofrece, cuánto hay que adelantar y a dónde va.

export function MandadosPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'disponibles' | 'mios'>('disponibles')
  const { data: disponibles, isLoading: l1 } = useQuery({ queryKey: ['mandados-disponibles'], queryFn: fetchMandadosDisponibles, refetchInterval: 10000 })
  const { data: mios, isLoading: l2 } = useQuery({ queryKey: ['mandados-mios'], queryFn: fetchMisMandados, refetchInterval: 10000 })
  const list = (tab === 'disponibles' ? disponibles : mios) ?? []
  const loading = tab === 'disponibles' ? l1 : l2

  const card = (m: Mandado) => {
    const cat = CATEGORIA[m.categoria]
    const Icon = cat.icon
    const ent = entregaInfo(m.programadoPara ? { tipo: 'PROGRAMADO', at: m.programadoPara } : { tipo: 'EXPRESS', at: m.createdAt })
    const ad = adelanto(m)
    const mio = tab === 'mios'
    return (
      <TripCard
        key={m.id}
        onOpen={() => navigate(`/mandados/${m.id}`)}
        resaltado={mio && m.estado === 'COMPRA_APROBADA'}
        chip={mio
          ? <span className="inline-flex h-7 items-center rounded-full bg-blue px-2.5 text-[13px] font-semibold text-white">{ESTADO_RIDER[m.estado]}</span>
          : <EntregaChip texto={m.programadoPara ? ent.texto : 'Lo antes posible'} urgencia={ent.urgencia} />}
        meta={m.codigo}
        tag={<span className="inline-flex items-center gap-1 font-semibold text-ink"><Icon size={14} />{cat.label}</span>}
        monto={m.tarifaAcordada ?? m.ofertaCliente}
        montoLabel={m.tarifaAcordada != null ? 'Ganas' : 'Ofrece'}
        destino={m.entrega.direccion}
        distancia={m.distanciaKm != null ? fmtDist(m.distanciaKm) : undefined}
        pie={<>
          {ad.monto != null && ad.monto > 0 ? <>{ad.texto} <b className="text-ink">{soles(ad.monto)}</b></> : ad.texto}
          {m.conCompra && ` · ${m.items.length} ${m.items.length === 1 ? 'cosa' : 'cosas'}`}
          {!mio && m.miOferta && <span className="block font-semibold text-blue">Tu oferta: {soles(m.miOferta.monto)}</span>}
        </>}
        accion={<button onClick={() => navigate(`/mandados/${m.id}`)} className="flex h-12 items-center gap-1.5 rounded-2xl bg-blue px-5 text-[16px] font-semibold text-white">
          {mio ? 'Seguir' : 'Ver'} <ArrowRight size={18} />
        </button>}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <HeaderTabs
          value={tab}
          onChange={setTab}
          tabs={[
            ['disponibles', `Mandados${disponibles ? ` · ${disponibles.length}` : ''}`],
            ['mios', `Míos${mios?.length ? ` · ${mios.length}` : ''}`],
          ]}
        />
      </AppHeader>
      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-44 animate-shimmer rounded-[22px] bg-card shadow-card" />)
        ) : list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <ShoppingBag size={44} strokeWidth={1.5} className="text-ink-ghost" />
            <div className="num text-xl font-semibold">{tab === 'disponibles' ? 'Sin mandados por ahora' : 'No tienes mandados en curso'}</div>
            <div className="text-[15px] leading-snug text-ink-soft">
              {tab === 'disponibles' ? 'Cuando un cliente pida que le compren algo, te avisamos.' : 'Acepta o haz una oferta en Mandados.'}
            </div>
          </div>
        ) : list.map(card)}
      </div>
    </div>
  )
}
