import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Award, Bike, CheckCircle2, Clock, Fuel, LogOut, Mic, Package, Plus, ShieldCheck, Star, Sun, TrendingUp, Wrench } from 'lucide-react'
import { fetchProfile, fetchFuelExpenses, addFuelExpense } from '../api'
import { useAuthStore } from '../authStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { TopBar } from '../components/TopBar'
import { cn } from '../lib/cn'

export function PerfilPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useAuthStore((s) => s.logout)
  const vozActiva = useAuthStore((s) => s.comandosVozActivos)
  const setComandosVoz = useAuthStore((s) => s.setComandosVoz)
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: fetchProfile })
  const { data: gastos } = useQuery({ queryKey: ['fuel-expenses'], queryFn: fetchFuelExpenses })
  const [zonasActivas, setZonasActivas] = useState<string[]>([])
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

  const zonas = profile?.zonas ?? []
  const activas = zonasActivas.length ? zonasActivas : profile?.zonasActivas ?? []

  const toggleZona = (z: string) => {
    setZonasActivas(activas.includes(z) ? activas.filter((a) => a !== z) : [...activas, z])
  }

  if (!profile) return <div className="flex h-full items-center justify-center text-paper-ink-soft">Cargando…</div>

  return (
    <div className="no-scrollbar flex h-full flex-col overflow-y-auto pb-4">
      <TopBar title="PERFIL" />
      <div className="flex flex-col gap-[22px] px-6 pt-1">
      <div className="flex flex-col items-center gap-2.5">
        <div className="font-display flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-green-700 text-2xl font-bold text-white">
          {profile.iniciales}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="text-lg font-extrabold">{profile.nombre}</div>
          <div className="text-[13px] font-semibold text-paper-ink-soft">Repartidor afiliado desde {profile.afiliadoDesde}</div>
        </div>
        <div className="mt-1 flex items-center gap-1.5 rounded-full bg-brand-achiote-900/40 px-3.5 py-1.5">
          <Star size={15} className="fill-accent-achiote text-accent-achiote" />
          <span className="text-[13px] font-extrabold">{profile.calificacion} de calificación</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        {[
          { icon: Package, color: 'text-brand-green-600', value: profile.entregasHoy, label: 'Entregas hoy' },
          { icon: TrendingUp, color: 'text-brand-blue-500', value: `${profile.kmHoy} km`, label: 'Recorridos hoy' },
          { icon: Clock, color: 'text-brand-achiote-500', value: `${profile.tiempoPromedioMin} min`, label: 'Tiempo promedio' },
          { icon: Award, color: 'text-brand-magenta-500', value: profile.entregasSemana, label: 'Esta semana' },
        ].map(({ icon: Icon, color, value, label }) => (
          <div key={label} className="flex flex-col gap-2.5 rounded-[20px] bg-paper-surface p-[18px]">
            <Icon size={20} strokeWidth={2.2} className={color} />
            <div className="font-display text-[30px] font-extrabold leading-none">{value}</div>
            <div className="text-xs font-bold text-paper-ink-soft">{label}</div>
          </div>
        ))}
      </div>

      <div className="roadline" />

      <div className="flex flex-col gap-3">
        <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Mi moto</div>
        <div className="flex flex-col gap-3.5 rounded-[20px] bg-paper-surface p-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-paper-raised">
              <Bike size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold">{profile.moto.modelo}</div>
              <span className="mt-1.5 inline-block rounded-md bg-paper-bg px-2.5 py-1 text-xs font-extrabold tracking-wider text-paper-ink">
                {profile.moto.placa}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-brand-green-900/40 px-3.5 py-1.5">
              <ShieldCheck size={14} className="text-accent-green" />
              <span className="text-xs font-extrabold text-accent-green">SOAT vigente · vence {profile.moto.soatVigenteHasta}</span>
            </div>
            <MantenimientoPill moto={profile.moto} />
          </div>
        </div>
      </div>

      <div className="roadline" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Combustible</div>
          <button
            onClick={() => setShowGastoForm((v) => !v)}
            className="flex items-center gap-1 text-[13px] font-extrabold text-brand-green-600"
          >
            <Plus size={15} strokeWidth={2.6} />
            Registrar gasto
          </button>
        </div>

        {showGastoForm && (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-paper-surface p-4">
            <div className="flex gap-2.5">
              <input
                type="number"
                inputMode="decimal"
                value={montoGasto}
                onChange={(e) => setMontoGasto(e.target.value)}
                placeholder="Monto (S/)"
                className="h-11 flex-1 rounded-xl border-[1.5px] border-paper-line bg-paper-raised px-3 text-sm font-bold outline-none"
              />
              <input
                type="number"
                inputMode="decimal"
                value={galonesGasto}
                onChange={(e) => setGalonesGasto(e.target.value)}
                placeholder="Galones"
                className="h-11 flex-1 rounded-xl border-[1.5px] border-paper-line bg-paper-raised px-3 text-sm font-bold outline-none"
              />
            </div>
            <PrimaryButton
              className="h-12 w-full !text-base"
              disabled={!montoGasto || addGastoMutation.isPending}
              onClick={() => addGastoMutation.mutate()}
            >
              {addGastoMutation.isPending ? 'Guardando…' : 'Guardar gasto'}
            </PrimaryButton>
          </div>
        )}

        <div className="flex items-center justify-between rounded-[20px] bg-paper-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-raised">
              <Fuel size={18} className="text-accent-achiote" />
            </div>
            <div className="text-sm font-bold text-paper-ink-soft">Gastado esta semana</div>
          </div>
          <div className="font-display text-xl font-extrabold">S/ {gastoSemana.toFixed(2)}</div>
        </div>

        {gastos && gastos.length > 0 && (
          <div className="flex flex-col">
            {gastos.slice(0, 3).map((g) => (
              <div key={g.id} className="flex items-center justify-between border-b border-paper-line py-2.5 last:border-b-0">
                <span className="text-[13px] font-semibold text-paper-ink-soft">
                  {new Date(g.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} · {g.galones} gal
                </span>
                <span className="text-[13px] font-extrabold">S/ {g.monto.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="roadline" />

      <div className="flex flex-col gap-3">
        <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Insignias</div>
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-0.5">
          {[
            { icon: Award, bg: 'bg-brand-green-500', label: '100 entregas' },
            { icon: Sun, bg: 'bg-brand-achiote-500', label: 'Madrugador' },
            { icon: Star, bg: 'bg-brand-blue-500', label: '5★ seguidas' },
          ].map(({ icon: Icon, bg, label }) => (
            <div key={label} className="flex w-[68px] flex-shrink-0 flex-col items-center gap-2">
              <div className={cn('flex h-14 w-14 items-center justify-center rounded-full', bg)}>
                <Icon size={24} className="text-white" />
              </div>
              <div className="text-center text-[11px] font-bold leading-tight">{label}</div>
            </div>
          ))}
          <div className="flex w-[68px] flex-shrink-0 flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-paper-ink-ghost bg-paper-surface">
              <Award size={22} className="text-paper-ink-ghost" />
            </div>
            <div className="text-center text-[11px] font-bold leading-tight text-paper-ink-soft">Todo terreno</div>
          </div>
        </div>
      </div>

      <div className="roadline" />

      <div className="flex flex-col gap-3.5">
        <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Zonas donde quieres repartir</div>
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto">
          {zonas.map((z) => (
            <button
              key={z}
              onClick={() => toggleZona(z)}
              className={cn(
                'flex-shrink-0 rounded-full border-[1.5px] px-3.5 py-2.5 text-[13px] font-bold transition-colors',
                activas.includes(z) ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
              )}
            >
              {z}
            </button>
          ))}
        </div>
        <div className="text-xs leading-snug text-paper-ink-soft">Solo te asignaremos pedidos dentro de estas zonas</div>
      </div>

      <div className="roadline" />

      <div className="flex items-start justify-between gap-3.5">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-paper-surface">
            <Mic size={19} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-sm font-extrabold">Comandos de voz</div>
            <div className="mt-0.5 max-w-[210px] text-xs leading-snug text-paper-ink-soft">
              Di "Marc, siguiente entrega" o "Marc, ya llegué" sin soltar el manillar
            </div>
          </div>
        </div>
        <button
          onClick={() => setComandosVoz(!vozActiva)}
          aria-label="Activar o desactivar comandos de voz"
          className={cn('flex h-[30px] w-[52px] flex-shrink-0 items-center rounded-full p-[3px] transition-colors', vozActiva ? 'justify-end bg-brand-green-500' : 'justify-start bg-paper-line')}
        >
          <div className="h-6 w-6 rounded-full bg-white" />
        </button>
      </div>

      <button
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-paper-ink-soft"
      >
        <LogOut size={16} strokeWidth={2.2} />
        Cerrar sesión
      </button>
      </div>
    </div>
  )
}

function MantenimientoPill({ moto }: { moto: { kmTotal: number; kmUltimoMantenimiento: number; intervaloMantenimientoKm: number } }) {
  const kmRestantes = moto.kmUltimoMantenimiento + moto.intervaloMantenimientoKm - moto.kmTotal

  if (kmRestantes <= 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-brand-magenta-900/40 px-3.5 py-1.5">
        <AlertTriangle size={14} className="text-brand-magenta-400" />
        <span className="text-xs font-extrabold text-brand-magenta-400">
          Mantenimiento atrasado {Math.abs(kmRestantes)} km
        </span>
      </div>
    )
  }
  if (kmRestantes <= 500) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-brand-achiote-900/40 px-3.5 py-1.5">
        <Wrench size={14} className="text-accent-achiote" />
        <span className="text-xs font-extrabold text-accent-achiote">Cambio de aceite en {kmRestantes} km</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-paper-surface px-3.5 py-1.5">
      <CheckCircle2 size={14} className="text-paper-ink-soft" />
      <span className="text-xs font-extrabold text-paper-ink-soft">Mantenimiento al día · {kmRestantes} km</span>
    </div>
  )
}
