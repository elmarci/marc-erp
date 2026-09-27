import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Navigation, Wallet } from 'lucide-react'
import { fetchHistory } from '../mockApi'
import { cn } from '../lib/cn'

type Periodo = 'hoy' | 'semana' | 'mes' | 'todo'

const PERIODO_OPTIONS: { key: Periodo; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'todo', label: 'Todo' },
]

const MS_DIA = 24 * 60 * 60 * 1000

function dentroDePeriodo(iso: string | undefined, periodo: Periodo): boolean {
  if (!iso) return false
  if (periodo === 'todo') return true
  const dias = periodo === 'hoy' ? 1 : periodo === 'semana' ? 7 : 30
  return Date.now() - Date.parse(iso) <= dias * MS_DIA
}

function agruparPorDia(fecha: string): string {
  const d = new Date(fecha)
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - MS_DIA)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

export function HistorialPage() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const { data: todas, isLoading } = useQuery({ queryKey: ['history'], queryFn: fetchHistory })

  const filas = useMemo(() => (todas ?? []).filter((f) => dentroDePeriodo(f.entregadoAt, periodo)), [todas, periodo])

  const resumen = useMemo(
    () =>
      filas.reduce(
        (acc, f) => ({
          entregas: acc.entregas + 1,
          ganado: acc.ganado + f.tarifaReparto,
          km: acc.km + f.distanciaKm,
        }),
        { entregas: 0, ganado: 0, km: 0 },
      ),
    [filas],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-2 pt-6">
        <div className="font-display text-2xl font-extrabold">Historial</div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2">
        {PERIODO_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriodo(key)}
            className={cn(
              'flex-shrink-0 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors',
              periodo === key ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!isLoading && filas.length > 0 && (
        <div className="mx-5 mb-1 grid grid-cols-3 gap-2.5">
          <div className="flex flex-col gap-1 rounded-2xl bg-paper-surface p-3">
            <CheckCircle2 size={16} className="text-brand-green-600" />
            <div className="font-display text-lg font-extrabold leading-none">{resumen.entregas}</div>
            <div className="text-[11px] font-bold text-paper-ink-soft">Entregas</div>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-paper-surface p-3">
            <Wallet size={16} className="text-brand-green-600" />
            <div className="font-display text-lg font-extrabold leading-none">S/ {resumen.ganado.toFixed(0)}</div>
            <div className="text-[11px] font-bold text-paper-ink-soft">Ganado</div>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-paper-surface p-3">
            <Navigation size={16} className="text-brand-blue-500" />
            <div className="font-display text-lg font-extrabold leading-none">{resumen.km.toFixed(1)}</div>
            <div className="text-[11px] font-bold text-paper-ink-soft">Km</div>
          </div>
        </div>
      )}

      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-5 pb-5 pt-2">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-paper-ink-soft">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-paper-surface">
              <Clock size={36} strokeWidth={1.8} className="text-paper-ink-ghost" />
            </div>
            <div className="font-display text-lg font-bold">Sin entregas en este período</div>
            <div className="text-sm text-paper-ink-soft">Prueba con un rango más amplio</div>
          </div>
        ) : (
          filas.map((f, idx) => {
            const dia = agruparPorDia(f.entregadoAt!)
            const diaAnterior = idx > 0 ? agruparPorDia(filas[idx - 1].entregadoAt!) : null
            return (
              <div key={f.id}>
                {dia !== diaAnterior && (
                  <div className="px-1 pb-2 pt-4 text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft first:pt-0">
                    {dia}
                  </div>
                )}
                <button
                  onClick={() => navigate(`/pedidos/${f.id}`)}
                  className="flex w-full items-center gap-3 border-b border-[#f0efe9] py-3.5 text-left last:border-b-0"
                >
                  <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-brand-green-50">
                    <CheckCircle2 size={18} className="text-brand-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{f.direccion}</div>
                    <div className="text-xs font-semibold text-paper-ink-soft">
                      {new Date(f.entregadoAt!).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })} · S/ {f.tarifaReparto.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex-shrink-0 rounded-full bg-paper-surface px-2.5 py-1 text-xs font-extrabold">
                    {f.duracionMin} min
                  </div>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
