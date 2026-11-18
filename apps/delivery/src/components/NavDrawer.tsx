import { NavLink, useNavigate } from 'react-router-dom'
import { Clock, HelpCircle, Home, KeyRound, LogOut, Package, User, Wallet } from 'lucide-react'
import { useUiStore } from '../uiStore'
import { useAuthStore } from '../authStore'
import { cn } from '../lib/cn'

const ITEMS = [
  { to: '/estado', label: 'Inicio', icon: Home },
  { to: '/pedidos', label: 'Pedidos', icon: Package },
  { to: '/billetera', label: 'Ganancias', icon: Wallet },
  { to: '/historial', label: 'Historial de entregas', icon: Clock },
  { to: '/perfil', label: 'Perfil', icon: User },
  { to: '/nuevo-pin', label: 'Cambiar mi PIN', icon: KeyRound },
]

export function NavDrawer() {
  const open = useUiStore((s) => s.drawerOpen)
  const close = useUiStore((s) => s.closeDrawer)
  const { nombre, iniciales, enServicio, logout } = useAuthStore()
  const navigate = useNavigate()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[800] flex justify-end" onClick={close}>
      <div className="absolute inset-0 bg-night/40" />
      <div className="relative flex h-full w-[290px] animate-enter-up flex-col bg-card shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lane bg-night px-5 pb-7 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-base font-semibold">{iniciales}</div>
          <div className="num mt-3 text-lg font-semibold">{nombre}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[13px] text-white/75">
            <i className={cn('h-2 w-2 rounded-full', enServicio ? 'bg-lime-on' : 'bg-white/40')} />
            {enServicio ? 'En ruta' : 'Fuera de servicio'}
          </div>
        </div>

        <nav className="flex flex-col py-2">
          {ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={close}
              className={({ isActive }) => cn('flex items-center gap-3.5 px-5 py-3.5 text-[15px]', isActive ? 'font-semibold text-blue' : 'text-ink')}>
              <Icon size={20} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
          <div className="mx-5 my-2 h-px bg-line" />
          <a href="tel:930555831" className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-ink-soft">
            <HelpCircle size={20} strokeWidth={1.8} />
            Llamar a la tienda
          </a>
          <button
            onClick={() => { close(); logout(); navigate('/') }}
            className="flex items-center gap-3.5 px-5 py-3.5 text-left text-[15px] text-ink-soft"
          >
            <LogOut size={20} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </nav>

        <div className="mt-auto px-5 py-5 text-xs text-ink-faint">Marc Reparto · Tiendas Marc</div>
      </div>
    </div>
  )
}
