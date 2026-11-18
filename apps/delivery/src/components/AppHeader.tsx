import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../uiStore'
import { useAuthStore } from '../authStore'

interface AppHeaderProps {
  title?: string
  subtitle?: string
  back?: string
  children?: ReactNode
}

// Cabecera "azul noche" con línea de carril al pie: el toque biker de la app.
// El avatar abre el menú lateral; el estado "En ruta" se ve siempre.
export function AppHeader({ title, subtitle, back, children }: AppHeaderProps) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const iniciales = useAuthStore((s) => s.iniciales)
  const enServicio = useAuthStore((s) => s.enServicio)
  const navigate = useNavigate()

  return (
    <header className="lane flex-shrink-0 bg-night px-4 pb-6 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
      <div className="flex items-center justify-between gap-3">
        {back ? (
          <button onClick={() => navigate(back)} aria-label="Volver" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <img src="/marc-mark.png" alt="Tiendas Marc" width={34} height={34} className="h-[34px] w-[34px] rounded-full bg-white" />
        )}
        <span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/10 px-3 text-[13px] font-medium">
          <i className={enServicio ? 'h-2 w-2 rounded-full bg-lime-on shadow-[0_0_0_3px_rgba(139,224,78,.25)]' : 'h-2 w-2 rounded-full bg-white/40'} />
          {enServicio ? 'En ruta · Manchay alto' : 'Fuera de servicio'}
        </span>
        <button onClick={openDrawer} aria-label="Abrir menú" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold active:bg-white/20">
          {iniciales || '··'}
        </button>
      </div>
      {title && (
        <div className="mt-4">
          <h1 className="num text-[26px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-white/70">{subtitle}</p>}
        </div>
      )}
      {children}
    </header>
  )
}

// Selector de pestañas sobre la cabecera azul noche.
export function HeaderTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  return (
    <div className="mt-4 flex rounded-xl bg-white/10 p-[3px]" role="tablist">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={value === key
            ? 'h-9 flex-1 rounded-[9px] bg-white text-sm font-semibold text-night'
            : 'h-9 flex-1 rounded-[9px] text-sm font-medium text-white/80'}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
