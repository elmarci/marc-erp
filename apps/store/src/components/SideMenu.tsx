import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Home, LayoutGrid, Store, Tag, Package, Gift, BarChart3, MapPin,
  MessageCircle, LogOut, User, ChevronRight,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'

const WHATSAPP_NUMBER = '51930555831'

interface SideMenuProps {
  open: boolean
  onClose: () => void
}

// Menú lateral real (desde la izquierda, como cualquier app mobile) — antes
// la hamburguesa del header sólo repetía el botón "Categorías" de la barra
// inferior, dejando el patrón de "abrir un panel lateral" sin ningún
// contenido propio. Acá reunimos todo lo que no cabe en los 4 tabs de abajo:
// navegación completa, atajos directos a las secciones del perfil (puntos,
// consumo, direcciones) y soporte.
export function SideMenu({ open, onClose }: SideMenuProps) {
  const { customer, isLoggedIn, logout, exitGuestMode } = useAuthStore()
  const navigate = useNavigate()

  const { data: profileData } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
    enabled: !!customer,
  })
  const points = profileData?.data.data.loyaltyPoints ?? 0

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'], queryFn: () => storeApi.getOffers(), staleTime: 300000,
  })
  const offersCount = offersData?.data.data.length ?? 0

  const go = (to: string) => { onClose(); navigate(to) }

  const links = [
    { to: '/', icon: Home, label: 'Inicio' },
    { to: '/catalogo', icon: Store, label: 'Catálogo completo' },
    { to: '/categorias', icon: LayoutGrid, label: 'Categorías' },
    { to: '/ofertas', icon: Tag, label: 'Ofertas', badge: offersCount },
  ]

  const accountLinks = isLoggedIn ? [
    { to: '/mis-pedidos', icon: Package, label: 'Mis pedidos' },
    { to: '/mis-pedidos#canje', icon: Gift, label: 'Puntos y canje' },
    { to: '/mis-pedidos#consumo', icon: BarChart3, label: 'Reporte de consumos' },
    { to: '/mis-pedidos#direcciones', icon: MapPin, label: 'Mis direcciones' },
  ] : []

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[60] bg-black/40" />
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-[61] w-[82%] max-w-[320px] bg-white shadow-2xl flex flex-col overflow-y-auto">

            {/* Cabecera — identidad del cliente o CTA de ingreso */}
            <div className="bg-gradient-to-br from-brand-green-600 to-brand-green-700 text-white p-5 pt-6 shrink-0">
              <button onClick={onClose} aria-label="Cerrar menú"
                className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
                <X className="h-4 w-4" />
              </button>
              {isLoggedIn && customer ? (
                <>
                  <div className="h-12 w-12 rounded-full border-2 border-white/70 -rotate-3 bg-white/10 flex items-center justify-center text-lg font-display font-semibold mb-2">
                    {customer.name[0].toUpperCase()}
                  </div>
                  <p className="font-display font-semibold leading-tight">{customer.name}</p>
                  <p className="text-xs text-white/75">{customer.phone}</p>
                  <button onClick={() => go('/mis-pedidos#canje')}
                    className="mt-3 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-full pl-2.5 pr-3 py-1.5 text-xs font-semibold transition-colors">
                    <Gift className="h-3.5 w-3.5" />{points} pts disponibles
                  </button>
                </>
              ) : (
                <>
                  <div className="h-12 w-12 rounded-full border-2 border-white/70 flex items-center justify-center mb-2">
                    <User className="h-5 w-5" />
                  </div>
                  <p className="font-display font-semibold">Bienvenido a Marc</p>
                  <button onClick={() => { onClose(); exitGuestMode() }}
                    className="mt-3 flex items-center gap-1 bg-white text-brand-green-700 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors">
                    Ingresar / Crear cuenta <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Navegación */}
            <nav className="flex-1 py-2">
              {links.map(({ to, icon: Icon, label, badge }) => (
                <Link key={to} to={to} onClick={onClose}
                  className="flex items-center gap-3 px-5 py-3 text-sm text-paper-ink hover:bg-paper-surface transition-colors">
                  <Icon className="h-4.5 w-4.5 text-paper-ink-ghost" />
                  <span className="flex-1">{label}</span>
                  {!!badge && <span className="h-5 min-w-5 px-1 bg-brand-magenta-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{badge}</span>}
                </Link>
              ))}

              {accountLinks.length > 0 && (
                <>
                  <div className="border-t border-paper-line my-2 mx-5" />
                  <p className="px-5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-paper-ink-ghost">Mi cuenta</p>
                  {accountLinks.map(({ to, icon: Icon, label }) => (
                    <Link key={to} to={to} onClick={onClose}
                      className="flex items-center gap-3 px-5 py-3 text-sm text-paper-ink hover:bg-paper-surface transition-colors">
                      <Icon className="h-4.5 w-4.5 text-paper-ink-ghost" />
                      <span className="flex-1">{label}</span>
                    </Link>
                  ))}
                </>
              )}

              <div className="border-t border-paper-line my-2 mx-5" />
              <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola TIENDA MARC! 👋 Tengo una consulta.')}`}
                target="_blank" rel="noopener noreferrer" onClick={onClose}
                className="flex items-center gap-3 px-5 py-3 text-sm text-paper-ink hover:bg-paper-surface transition-colors">
                <MessageCircle className="h-4.5 w-4.5 text-[#25D366]" />
                <span className="flex-1">Ayuda por WhatsApp</span>
              </a>

              {isLoggedIn && (
                <button onClick={() => { onClose(); logout() }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-brand-magenta-600 hover:bg-brand-magenta-50 transition-colors">
                  <LogOut className="h-4.5 w-4.5" />Cerrar sesión
                </button>
              )}
            </nav>

            <p className="px-5 py-4 text-[10px] text-paper-ink-ghost shrink-0">Minimarket Marc · Pachacamac</p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
