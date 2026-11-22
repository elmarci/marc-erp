import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { fetchAvailableOrders, fetchHistorialMandados, fetchHistory, fetchMandadosDisponibles, fetchProfile, updateEstado } from '../api'
import { subscribeRiderToPush } from '../lib/push'
import { AppHeader } from '../components/AppHeader'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

// Velocímetro: lo ganado hoy y el avance hacia la meta de entregas del día.
function Velocimetro({ ganado, entregas, meta }: { ganado: number; entregas: number; meta: number }) {
  const R = 120, CX = 135, CY = 135
  const frac = Math.max(0, Math.min(1, meta > 0 ? entregas / meta : 0))
  const ang = Math.PI * (1 - frac)
  const x = CX + R * Math.cos(ang), y = CY - R * Math.sin(ang)
  return (
    <svg width="270" height="146" viewBox="0 0 270 146" role="img" aria-label={`Ganado hoy S/ ${ganado.toFixed(2)}, ${entregas} de ${meta} entregas`}>
      <path d={`M15 ${CY} A${R} ${R} 0 0 1 255 ${CY}`} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="12" strokeLinecap="round" />
      {frac > 0 && <path d={`M15 ${CY} A${R} ${R} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke="#8BE04E" strokeWidth="12" strokeLinecap="round" />}
      <text x={CX} y="105" textAnchor="middle" fill="#fff" fontFamily="Bricolage Grotesque, Onest, sans-serif" fontSize="36" fontWeight="600">S/ {ganado.toFixed(2)}</text>
      <text x={CX} y="132" textAnchor="middle" fill="rgba(255,255,255,.72)" fontFamily="Onest, sans-serif" fontSize="13">
        {entregas >= meta ? `Meta cumplida: ${entregas} entregas` : `${entregas} de ${meta} entregas de tu meta`}
      </text>
    </svg>
  )
}

export function EstadoPage() {
  const navigate = useNavigate()
  const { nombre, enServicio, setEnServicio, locationPermission, metaDiaria } = useAuthStore()

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const { data: history } = useQuery({ queryKey: ['history'], queryFn: fetchHistory })
  const { data: disponibles } = useQuery({ queryKey: ['orders-disponibles'], queryFn: fetchAvailableOrders, enabled: enServicio, refetchInterval: 15000 })
  const { data: mandados } = useQuery({ queryKey: ['mandados-disponibles'], queryFn: fetchMandadosDisponibles, enabled: enServicio, refetchInterval: 15000 })
  const { data: mandadosHechos } = useQuery({ queryKey: ['mandados-historial'], queryFn: fetchHistorialMandados })

  const hoy = useMemo(() => {
    const d = new Date().toDateString()
    const list = (history ?? []).filter((o) => o.entregadoAt && new Date(o.entregadoAt).toDateString() === d)
    const md = (mandadosHechos ?? []).filter((m) => m.entregadoAt && new Date(m.entregadoAt).toDateString() === d)
    return { entregas: list.length + md.length, ganado: list.reduce((s, o) => s + o.tarifaReparto, 0) + md.reduce((s, m) => s + (m.tarifaAcordada ?? 0), 0) }
  }, [history, mandadosHechos])
  const masCerca = useMemo(() => (disponibles ?? []).reduce<number | null>((m, o) => (m === null || o.distanciaKm < m ? o.distanciaKm : m), null), [disponibles])

  const toggle = () => {
    if (!enServicio && locationPermission !== 'granted') {
      navigate('/ubicacion')
      return
    }
    const next = !enServicio
    setEnServicio(next)
    updateEstado({ enServicio: next }).catch(() => setEnServicio(!next))
    if (next) subscribeRiderToPush()
  }

  const f = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
  const fecha = f.charAt(0).toUpperCase() + f.slice(1)

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <p className="mt-4 text-sm text-white/70">{fecha}</p>
        <h1 className="num text-[26px] font-semibold leading-tight">Hola, {nombre.split(' ')[0]}</h1>
        <div className="mt-2 flex justify-center">
          <Velocimetro ganado={hoy.ganado} entregas={hoy.entregas} meta={metaDiaria} />
        </div>
      </AppHeader>

      <div className="no-scrollbar flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-4">
        <button onClick={toggle} className="flex items-center justify-between rounded-[20px] bg-card px-4 py-3.5 text-left shadow-card"
          aria-label={enServicio ? 'Dejar de recibir pedidos' : 'Empezar a recibir pedidos'}>
          <div>
            <div className="font-semibold">{enServicio ? 'En servicio' : 'Fuera de servicio'}</div>
            <div className="text-sm text-ink-soft">{enServicio ? 'Compartiendo tu ubicación con la tienda' : 'Actívate para recibir pedidos'}</div>
          </div>
          <span className={cn('flex h-8 w-[52px] flex-none rounded-full p-[3px] transition-colors', enServicio ? 'justify-end bg-blue' : 'justify-start bg-line')}>
            <i className="h-[26px] w-[26px] rounded-full bg-white shadow-card" />
          </span>
        </button>

        <div className="grid grid-cols-3 rounded-[20px] bg-card py-3.5 text-center shadow-card">
          <div><div className="num text-[22px] font-semibold">{profile ? profile.kmHoy : '–'}</div><div className="text-[13px] text-ink-soft">km hoy</div></div>
          <div className="border-x border-line"><div className="num text-[22px] font-semibold">{profile ? profile.tiempoPromedioMin : '–'}</div><div className="text-[13px] text-ink-soft">min promedio</div></div>
          <div><div className="num text-[22px] font-semibold">{profile ? profile.entregasSemana : '–'}</div><div className="text-[13px] text-ink-soft">esta semana</div></div>
        </div>

        {enServicio && (mandados?.length ?? 0) > 0 && (
          <button onClick={() => navigate('/mandados')} className="flex items-center justify-between rounded-[20px] bg-card px-4 py-3.5 text-left shadow-card">
            <div>
              <div className="font-semibold">{mandados!.length} {mandados!.length === 1 ? 'mandado esperando' : 'mandados esperando'}</div>
              <div className="text-sm text-ink-soft">Mejor oferta S/ {Math.max(...mandados!.map((m) => m.ofertaCliente)).toFixed(2)}</div>
            </div>
            <ChevronRight size={20} className="text-blue" />
          </button>
        )}

        {enServicio && (
          <button onClick={() => navigate('/pedidos')} className="flex items-center justify-between rounded-[20px] bg-card px-4 py-3.5 text-left shadow-card">
            <div>
              <div className="font-semibold">
                {disponibles === undefined ? 'Buscando pedidos…' : disponibles.length === 0 ? 'Sin pedidos por ahora' : `${disponibles.length} ${disponibles.length === 1 ? 'pedido esperando' : 'pedidos esperando'}`}
              </div>
              <div className="text-sm text-ink-soft">
                {masCerca !== null ? `El más cerca a ${masCerca < 1 ? `${Math.round(masCerca * 1000)} m` : `${masCerca.toFixed(1)} km`}` : 'Te avisamos apenas caiga uno'}
              </div>
            </div>
            <ChevronRight size={20} className="text-blue" />
          </button>
        )}
      </div>

      <div className="px-4 pb-3 pt-3">
        {enServicio
          ? <PrimaryButton className="w-full" onClick={() => navigate('/pedidos')}>Ver pedidos</PrimaryButton>
          : <PrimaryButton className="w-full" onClick={toggle}>Empezar a repartir</PrimaryButton>}
      </div>
    </div>
  )
}
