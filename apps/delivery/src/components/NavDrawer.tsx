import { NavLink, useNavigate } from 'react-router-dom'
import { ClipboardList, Clock, HelpCircle, LogOut, User, Wallet } from 'lucide-react'
import { useUiStore } from '../uiStore'
import { useAuthStore } from '../authStore'
import { cn } from '../lib/cn'

const ITEMS = [
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/historial', label: 'Historial', icon: Clock },
  { to: '/billetera', label: 'Billetera', icon: Wallet },
  { to: '/perfil', label: 'Perfil', icon: User },
]

// Complementa el nav inferior (4 pestañas siempre visibles) con acceso
// rápido a todo desde un solo botón de menú — pedido explícito: "debe tener
// algún nav sidebar... para navegación rápida".
export function NavDrawer() {
  const open = useUiStore((s) => s.drawerOpen)
  const close = useUiStore((s) => s.closeDrawer)
  const { nombre, iniciales, enServicio, logout } = useAuthStore()
  const navigate = useNavigate()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex" onClick={close}>
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="relative flex h-full w-[280px] animate-enter-up flex-col bg-paper-surface shadow-2xl"
        style={{ animationDuration: '0.16s' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-5 pt-7">
          <div className="font-display flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-700 text-lg font-extrabold text-white">
            {iniciales}
          </div>
          <div className="font-display mt-3 text-lg font-extrabold text-paper-ink">{nombre.toUpperCase()}</div>
          <div className={cn('mt-0.5 text-xs font-extrabold', enServicio ? 'text-accent-green' : 'text-paper-ink-faint')}>
            {enServicio ? '● EN SERVICIO' : '○ DESCONECTADO'}
          </div>
        </div>

        <div className="mx-5 h-px bg-paper-line" />

        <div className="flex flex-col py-3">
          {ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={close}
              className={({ isActive }) =>
                cn('flex items-center gap-3.5 px-5 py-3.5', isActive && 'bg-brand-green-900/40')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} className={isActive ? 'text-accent-green' : 'text-paper-ink-soft'} />
                  <span className={cn('font-display text-[15px] font-bold', isActive ? 'text-accent-green' : 'text-paper-ink-soft')}>
                    {label.toUpperCase()}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          <div className="mx-5 my-2.5 h-px bg-paper-line" />

          <a href="tel:016139900" className="flex items-center gap-3.5 px-5 py-3.5">
            <HelpCircle size={19} className="text-paper-ink-faint" />
            <span className="text-sm font-bold text-paper-ink-faint">Ayuda / Llamar a la tienda</span>
          </a>
          <button
            onClick={() => {
              close()
              logout()
              navigate('/')
            }}
            className="flex items-center gap-3.5 px-5 py-3.5 text-left"
          >
            <LogOut size={19} className="text-brand-achiote-500" />
            <span className="text-sm font-bold text-brand-achiote-500">Cerrar sesión</span>
          </button>
        </div>

        <div className="mt-auto px-5 py-5 text-[11px] font-bold text-paper-ink-ghost">Marc Reparto · v1.0</div>
      </div>
    </div>
  )
}
