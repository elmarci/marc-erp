import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { fetchHistory } from '../api'
import { AppHeader } from '../components/AppHeader'
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
      <AppHeader back="/billetera" title="Historial de entregas" />

      <div className="no-scrollbar flex flex-none gap-1 overflow-x-auto px-4 pt-3">
        {PERIODO_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setPeriodo(key)}
            className={cn('h-8 flex-none rounded-full px-3 text-[13px]', periodo === key ? 'bg-ink font-semibold text-white' : 'font-medium text-ink-soft')}>
            {label}
          </button>
        ))}
      </div>

      {!isLoading && filas.length > 0 && (
        <div className="mx-4 mt-3 grid grid-cols-3 rounded-[20px] bg-card py-3.5 text-center shadow-card">
          <div><div className="num text-[20px] font-semibold">{resumen.entregas}</div><div className="text-[13px] text-ink-soft">entregas</div></div>
          <div className="border-x border-line"><div className="num text-[20px] font-semibold">{resumen.ganado.toFixed(2)}</div><div className="text-[13px] text-ink-soft">ganado S/</div></div>
          <div><div className="num text-[20px] font-semibold">{resumen.km.toFixed(1)}</div><div className="text-[13px] text-ink-soft">km</div></div>
        </div>
      )}

      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-5 pt-1">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-ink-soft">Cargando…</div>
        ) : filas.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
            <Clock size={36} strokeWidth={1.5} className="text-ink-ghost" />
            <div className="num text-lg font-semibold">Sin entregas en este período</div>
            <div className="text-sm text-ink-soft">Prueba con un rango más amplio.</div>
          </div>
        ) : (
          filas.map((f, idx) => {
            const dia = agruparPorDia(f.entregadoAt!)
            const diaAnterior = idx > 0 ? agruparPorDia(filas[idx - 1].entregadoAt!) : null
            const primeroDelDia = dia !== diaAnterior
            const ultimoDelDia = idx === filas.length - 1 || agruparPorDia(filas[idx + 1].entregadoAt!) !== dia
            return (
              <div key={f.id}>
                {primeroDelDia && <h2 className="px-1 pb-2 pt-4 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">{dia}</h2>}
                <button
                  onClick={() => navigate(`/pedidos/${f.id}`)}
                  className={cn('flex w-full items-center gap-3 bg-card px-4 py-3 text-left', primeroDelDia && 'rounded-t-[20px]', ultimoDelDia ? 'rounded-b-[20px] shadow-card' : 'border-b border-line')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{f.direccion}</div>
                    <div className="text-[13px] text-ink-soft">
                      {new Date(f.entregadoAt!).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })}{f.duracionMin ? ` · ${f.duracionMin} min` : ''}
                    </div>
                  </div>
                  <span className="flex-none tabular-nums">{f.tarifaReparto.toFixed(2)}</span>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
