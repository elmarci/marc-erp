import type { LucideIcon } from 'lucide-react'
import {
  Clock, Bike, Mic, Banknote, Zap, Store, CreditCard, MapPin, Search, Bell, Lock, Mail, Home,
  CheckCircle2, LocateFixed, Scale, Download, Tag, Star, Gift, Phone, MessageCircle, HelpCircle,
  ShoppingBasket, Receipt, Package, LayoutGrid,
} from 'lucide-react'

// 2026-11-25: los íconos dibujados a color (aviso-*, chk-*, menu-*, ico-*) se
// sentían "muy animados". Ahora son íconos de línea de un solo color (azul de
// marca, o el color de texto que traiga `className`), del mismo grosor en
// toda la tienda. Los de la barra inferior (nav-*), del seguimiento (seg-*) y
// los pines del mapa (pin-*) siguen siendo los archivos de public/icons.
const LINE: Record<string, LucideIcon> = {
  'aviso-horario': Clock, 'aviso-reparto': Bike, 'aviso-voz': Mic,
  'chk-delivery': Bike, 'chk-efectivo': Banknote, 'chk-express': Zap, 'chk-recojo': Store,
  'chk-tarjeta': CreditCard, 'chk-ubicacion': MapPin,
  'ico-buscar': Search, 'ico-campana': Bell, 'ico-candado': Lock, 'ico-correo': Mail,
  'ico-direccion': Home, 'ico-exito': CheckCircle2, 'ico-gps': LocateFixed, 'ico-granel': Scale,
  'ico-instalar': Download, 'ico-microfono': Mic, 'ico-ofertas': Tag, 'ico-puntos': Star,
  'ico-regalo': Gift, 'ico-reloj': Clock, 'ico-telefono': Phone, 'ico-whatsapp-pedido': MessageCircle,
  'menu-ayuda': HelpCircle, 'menu-canasta': ShoppingBasket, 'menu-consumos': Receipt,
  'menu-direcciones': MapPin, 'menu-ofertas': Tag, 'menu-pedidos': Package, 'menu-puntos': Star,
  'cat-todo': LayoutGrid,
}

// 2026-11-25 (2): set realista del dueño (public/icons/real/*.webp, fondo
// transparente). Se usa con `real` en avisos, opciones de entrega y pago,
// puntos y seguimiento del pedido, a 28 px o más. Los botones pequeños, la
// barra inferior y los campos de formulario siguen con íconos de línea.
const REAL: Record<string, string> = {
  'aviso-horario': 'ico-reloj', 'aviso-reparto': 'ico-reparto', 'aviso-voz': 'ico-microfono',
  'chk-delivery': 'ico-reparto', 'chk-efectivo': 'ico-efectivo', 'chk-express': 'ico-express',
  'chk-recojo': 'ico-recojo', 'chk-tarjeta': 'ico-tarjeta', 'chk-ubicacion': 'ico-ubicacion',
  'menu-ayuda': 'ico-ayuda', 'menu-pedidos': 'ico-pedidos', 'menu-ofertas': 'ico-ofertas', 'menu-puntos': 'ico-puntos',
  'ico-whatsapp-pedido': 'ico-whatsapp', 'seg-moto': 'seg-en-camino',
  ...Object.fromEntries([
    'ico-ayuda', 'ico-campana', 'ico-direccion', 'ico-efectivo', 'ico-exito', 'ico-express', 'ico-microfono',
    'ico-ofertas', 'ico-pedidos', 'ico-puntos', 'ico-recojo', 'ico-regalo', 'ico-reloj', 'ico-reparto',
    'ico-tarjeta', 'ico-ubicacion', 'ico-whatsapp', 'ico-yape',
    'seg-recibido', 'seg-confirmado', 'seg-preparando', 'seg-listo', 'seg-en-camino', 'seg-entregado',
  ].map(n => [n, n])),
}

/** Ruta del ícono realista (o null si ese nombre no tiene versión realista). */
export const realIcon = (name: string) => (REAL[name] ? `/icons/real/${REAL[name]}.webp` : null)

export function Ico({ name, className = 'h-6 w-6', real = false }: { name: string; className?: string; real?: boolean }) {
  const realSrc = real ? realIcon(name) : null
  if (realSrc) {
    return <img src={realSrc} alt="" aria-hidden="true" draggable={false} loading="lazy" decoding="async" className={`object-contain shrink-0 select-none ${className}`} />
  }
  const Line = LINE[name]
  if (Line) {
    const color = /(^|\s)text-/.test(className) ? '' : 'text-brand-blue-600'
    return (
      <span aria-hidden="true" className={`inline-flex items-center justify-center shrink-0 ${color} ${className}`}>
        <Line className="h-[72%] w-[72%]" strokeWidth={1.9} />
      </span>
    )
  }
  return <img src={`/icons/${name}.svg`} alt="" aria-hidden="true" draggable={false} className={`object-contain shrink-0 ${className}`} />
}

// Foto de apoyo (public/ilustraciones/<name>.webp, 4:3). Decorativa: el título
// de al lado dice lo mismo con palabras. Se recorta para llenar su caja.
// Los `vacio-*` son del set realista (recorte con fondo transparente): se
// muestran enteros, sin fondo ni recorte.
export function Ilu({ name, className = 'h-40 w-auto', eager = false }: { name: string; className?: string; eager?: boolean }) {
  if (name.startsWith('vacio-')) {
    return (
      <img src={`/icons/real/${name}.webp`} alt="" aria-hidden="true" draggable={false}
        width={320} height={240} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className={`object-contain select-none ${className}`} />
    )
  }
  return (
    <img src={`/ilustraciones/${name}.webp`} alt="" aria-hidden="true" draggable={false}
      width={640} height={480} loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`object-cover rounded-2xl bg-paper-surface select-none ${className}`} />
  )
}
