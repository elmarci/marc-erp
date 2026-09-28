import { useNavigate } from 'react-router-dom'
import { MapPin, ChevronRight, Menu } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { useUiStore } from '../uiStore'
import { updateEstado } from '../api'
import { subscribeRiderToPush } from '../lib/push'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

export function EstadoPage() {
  const navigate = useNavigate()
  const { nombre, iniciales, enServicio, setEnServicio, locationPermission } = useAuthStore()
  const openDrawer = useUiStore((s) => s.openDrawer)

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex animate-enter-up items-center justify-between px-5 pt-6">
        <button
          onClick={openDrawer}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-paper-surface transition-transform active:scale-95"
        >
          <Menu size={18} className="text-paper-ink" />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex flex-col text-right">
            <div className="text-base font-bold">Hola, {nombre.split(' ')[0]}</div>
            <div className="text-[13px] font-medium text-paper-ink-soft">Repartidor afiliado</div>
          </div>
          <div className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-brand-green-700 text-base font-bold text-white">
            {iniciales}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {enServicio && <div className="absolute inset-0 animate-ring-pulse rounded-full" />}
          <div className={cn('flex h-[88px] w-[88px] items-center justify-center rounded-full', enServicio ? 'bg-brand-green-500' : 'border-2 border-paper-line bg-paper-surface')}>
            <MapPin size={40} strokeWidth={2} className={enServicio ? 'text-white' : 'text-paper-ink-ghost'} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="font-display text-2xl font-extrabold uppercase tracking-wide">
            {enServicio ? 'Estás en servicio' : 'No estás recibiendo pedidos'}
          </div>
          <div className="max-w-[280px] text-[15px] leading-snug text-paper-ink-soft">
            {enServicio
              ? 'Compartiendo tu ubicación con la tienda mientras recibes pedidos'
              : 'Actívate cuando estés listo para salir a repartir'}
          </div>
        </div>

        <button onClick={toggle} aria-label={enServicio ? 'Desactivarte y dejar de recibir pedidos' : 'Activarte para recibir pedidos'} className="flex flex-col items-center gap-2.5">
          <div className={cn('flex h-16 w-[120px] items-center rounded-full p-1.5 transition-colors', enServicio ? 'justify-end bg-brand-green-500' : 'justify-start bg-paper-line')}>
            <div className="h-[52px] w-[52px] rounded-full bg-white shadow-md" />
          </div>
          <div className="text-[13px] font-semibold text-paper-ink-soft">
            {enServicio ? 'Toca para desactivarte' : 'Toca para activarte'}
          </div>
        </button>

        {enServicio && (
          <div className="flex items-center gap-2 rounded-full bg-paper-surface px-4 py-2.5">
            <MapPin size={16} className="text-brand-blue-500" />
            <span className="text-[13px] font-bold">Zona: Manchay</span>
          </div>
        )}
      </div>

      <div className="px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 30px)' }}>
        <PrimaryButton className="w-full" disabled={!enServicio} onClick={() => navigate('/pedidos')}>
          Ver pedidos
          {enServicio && <ChevronRight size={20} strokeWidth={2.5} />}
        </PrimaryButton>
      </div>
    </div>
  )
}
