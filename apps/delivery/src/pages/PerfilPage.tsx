import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, LogOut, Minus, Plus } from 'lucide-react'
import { fetchProfile, fetchFuelExpenses, addFuelExpense, updateEstado } from '../api'
import { useAuthStore } from '../authStore'
import { AppHeader } from '../components/AppHeader'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

function Seccion({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between px-1 pb-2 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

const Fila = ({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) => (
  <div className={cn('flex items-baseline justify-between gap-4 border-b border-line py-3 text-[15px] last:border-b-0', className)}>
    <span className="text-ink-soft">{k}</span>
    <span className="text-right">{v}</span>
  </div>
)

function estadoMantenimiento(m: { kmTotal: number; kmUltimoMantenimiento: number; intervaloMantenimientoKm: number }) {
  const resta = m.kmUltimoMantenimiento + m.intervaloMantenimientoKm - m.kmTotal
  if (resta <= 0) return <span className="font-semibold text-bad">Atrasado {Math.abs(resta)} km</span>
  if (resta <= 500) return <span className="font-semibold text-warn">En {resta} km</span>
  return <span>Al día · faltan {resta} km</span>
}

export function PerfilPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { logout, comandosVozActivos, setComandosVoz, metaDiaria, setMetaDiaria } = useAuthStore()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const { data: gastos } = useQuery({ queryKey: ['fuel-expenses'], queryFn: fetchFuelExpenses })
  const [zonasActivas, setZonasActivas] = useState<string[] | null>(null)
  const [showGastoForm, setShowGastoForm] = useState(false)
  const [montoGasto, setMontoGasto] = useState('')
  const [galonesGasto, setGalonesGasto] = useState('')

  const addGastoMutation = useMutation({
    mutationFn: () => addFuelExpense(Number(montoGasto), Number(galonesGasto)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel-expenses'] })
      setMontoGasto('')
      setGalonesGasto('')
      setShowGastoForm(false)
    },
  })

  const gastoSemana = (gastos ?? [])
    .filter((g) => Date.now() - new Date(g.fecha).getTime() <= 7 * 86400000)
    .reduce((sum, g) => sum + g.monto, 0)

  if (!profile) return <div className="flex h-full items-center justify-center text-ink-soft">Cargando…</div>

  const activas = zonasActivas ?? profile.zonasActivas
  const toggleZona = (z: string) => {
    const next = activas.includes(z) ? activas.filter((a) => a !== z) : [...activas, z]
    setZonasActivas(next)
    updateEstado({ zonasActivas: next }).catch(() => setZonasActivas(activas))
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={profile.nombre} subtitle={`Repartidor desde ${profile.afiliadoDesde}${profile.calificacion ? ` · ${profile.calificacion.toFixed(1)} de calificación` : ''}`} />

      <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-6 pt-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-line shadow-card">
          {[
            [profile.entregasHoy, 'entregas hoy'],
            [`${profile.kmHoy}`, 'km hoy'],
            [`${profile.tiempoPromedioMin}`, 'min por entrega'],
            [profile.entregasSemana, 'entregas en 7 días'],
          ].map(([v, l]) => (
            <div key={String(l)} className="bg-card px-4 py-3.5">
              <div className="num text-[26px] font-semibold leading-none">{v}</div>
              <div className="mt-1 text-[13px] text-ink-soft">{l}</div>
            </div>
          ))}
        </div>

        <Seccion titulo="Meta del día">
          <div className="flex items-center justify-between rounded-[20px] bg-card px-4 py-3 shadow-card">
            <span className="text-[15px]">Entregas por día</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setMetaDiaria(metaDiaria - 1)} aria-label="Bajar meta" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><Minus size={18} /></button>
              <span className="num w-8 text-center text-xl font-semibold">{metaDiaria}</span>
              <button onClick={() => setMetaDiaria(metaDiaria + 1)} aria-label="Subir meta" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line"><Plus size={18} /></button>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Mi moto">
          <div className="rounded-[20px] bg-card px-4 shadow-card">
            <Fila k="Modelo" v={profile.moto.modelo || 'Sin registrar'} />
            <Fila k="Placa" v={<span className="rounded-md border border-ink px-2 py-0.5 text-sm font-semibold tracking-wider">{profile.moto.placa || '—'}</span>} />
            <Fila k="SOAT vence" v={profile.moto.soatVigenteHasta || 'Sin registrar'} />
            <Fila k="Mantenimiento" v={estadoMantenimiento(profile.moto)} />
          </div>
        </Seccion>

        <Seccion titulo="Gasolina" accion={
          <button onClick={() => setShowGastoForm((v) => !v)} className="text-sm font-medium text-blue">{showGastoForm ? 'Cancelar' : 'Registrar gasto'}</button>
        }>
          <div className="rounded-[20px] bg-card px-4 shadow-card">
            {showGastoForm && (
              <div className="flex flex-col gap-2.5 border-b border-line py-3">
                <div className="flex gap-2.5">
                  <input type="number" inputMode="decimal" value={montoGasto} onChange={(e) => setMontoGasto(e.target.value)} placeholder="Monto S/"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base outline-none focus:border-blue" />
                  <input type="number" inputMode="decimal" value={galonesGasto} onChange={(e) => setGalonesGasto(e.target.value)} placeholder="Galones"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base outline-none focus:border-blue" />
                </div>
                <PrimaryButton className="w-full" disabled={!montoGasto || addGastoMutation.isPending} onClick={() => addGastoMutation.mutate()}>
                  {addGastoMutation.isPending ? 'Guardando…' : 'Guardar gasto'}
                </PrimaryButton>
              </div>
            )}
            <Fila k="Últimos 7 días" v={<span className="num font-semibold">S/ {gastoSemana.toFixed(2)}</span>} />
            {(gastos ?? []).slice(0, 3).map((g) => (
              <Fila key={g.id} k={`${new Date(g.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} · ${g.galones} gal`} v={<span className="tabular-nums">{g.monto.toFixed(2)}</span>} />
            ))}
          </div>
        </Seccion>

        {profile.zonas.length > 0 && (
          <Seccion titulo="Zonas donde repartes">
            <div className="flex flex-wrap gap-2">
              {profile.zonas.map((z) => (
                <button key={z} onClick={() => toggleZona(z)}
                  className={cn('h-9 rounded-full border px-3.5 text-sm', activas.includes(z) ? 'border-ink bg-ink font-semibold text-white' : 'border-line bg-card text-ink-soft')}>
                  {z}
                </button>
              ))}
            </div>
            <p className="px-1 pt-2 text-[13px] text-ink-soft">Solo te mostramos pedidos de estas zonas.</p>
          </Seccion>
        )}

        <Seccion titulo="Ajustes">
          <div className="rounded-[20px] bg-card px-4 shadow-card">
            <button onClick={() => setComandosVoz(!comandosVozActivos)} className="flex w-full items-center justify-between gap-4 border-b border-line py-3 text-left">
              <span>
                <span className="block text-[15px]">Comandos de voz</span>
                <span className="block text-[13px] text-ink-soft">Di "ya recogí" o "ya llegué" sin soltar el timón</span>
              </span>
              <span className={cn('flex h-8 w-[52px] flex-none rounded-full p-[3px]', comandosVozActivos ? 'justify-end bg-blue' : 'justify-start bg-line')}>
                <i className="h-[26px] w-[26px] rounded-full bg-white shadow-card" />
              </span>
            </button>
            <button onClick={() => navigate('/nuevo-pin')} className="flex w-full items-center justify-between py-3.5 text-left text-[15px]">
              Cambiar mi PIN <ChevronRight size={18} className="text-ink-faint" />
            </button>
          </div>
        </Seccion>

        <button onClick={() => { logout(); navigate('/login', { replace: true }) }}
          className="mt-2 flex h-12 items-center justify-center gap-2 text-[15px] font-medium text-ink-soft">
          <LogOut size={17} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
