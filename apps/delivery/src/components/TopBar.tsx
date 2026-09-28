import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../uiStore'
import { useAuthStore } from '../authStore'

interface TopBarProps {
  title: string
  subtitle?: string
}

// Barra compacta (60px) — reemplaza el bloque de header de ~200px de la v1.
// El ícono de menú abre el drawer (NavDrawer) con acceso rápido a todo lo
// que no cabe en el nav inferior de 4 pestañas.
export function TopBar({ title, subtitle }: TopBarProps) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const iniciales = useAuthStore((s) => s.iniciales)
  const navigate = useNavigate()

  return (
    <div className="flex flex-shrink-0 items-center justify-between px-5 py-3">
      <button
        onClick={openDrawer}
        aria-label="Abrir menú"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-paper-surface transition-transform active:scale-95"
      >
        <Menu size={18} className="text-paper-ink" />
      </button>
      <div className="text-center">
        <div className="font-display text-[19px] font-extrabold leading-none text-paper-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11px] font-bold text-paper-ink-faint">{subtitle}</div>}
      </div>
      <button
        onClick={() => navigate('/perfil')}
        aria-label="Ir a mi perfil"
        className="font-display flex h-9 w-9 items-center justify-center rounded-full bg-brand-green-700 text-xs font-extrabold text-white transition-transform active:scale-95"
      >
        {iniciales}
      </button>
    </div>
  )
}
