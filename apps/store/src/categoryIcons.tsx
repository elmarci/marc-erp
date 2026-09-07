import type { SVGProps } from 'react'

// Set de íconos propio para las categorías — antes eran de Lucide, la misma
// librería que trae cualquier plantilla de dashboard/e-commerce, así que la
// grilla de categorías terminaba viéndose idéntica a la de cualquier otra
// app de delivery (Rappi, PedidosYa, etc.). Mismo grosor de trazo y mismas
// puntas redondeadas en los once — un set chico y consistente, dibujado
// para esta tienda. Ver la propuesta "Marc, de Barrio" para el porqué.
//
// Firma de props compatible con los íconos de lucide-react (className,
// tamaño vía las clases h-*/w-* de Tailwind, color vía currentColor) para
// que los 4 sitios que ya usan getCategoryIcon() no necesiten cambiar nada.
type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconTodo(props: IconProps) {
  return (
    <svg {...base} strokeWidth={3.6} {...props}>
      <rect x="9" y="9" width="12" height="12" rx="3" />
      <rect x="27" y="9" width="12" height="12" rx="3" />
      <rect x="9" y="27" width="12" height="12" rx="3" />
      <rect x="27" y="27" width="12" height="12" rx="3" />
    </svg>
  )
}

export function IconPanaderia(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 33V24Q9 9 24 9Q39 9 39 24V33Q39 35 37 35H11Q9 35 9 33Z" />
      <path d="M16 17l3 6M24 13v7M32 17l-3 6" />
    </svg>
  )
}

export function IconLacteos(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 9h12l4 8v24a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V17Z" />
      <path d="M14 17h20" />
    </svg>
  )
}

export function IconCarnes(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="23" cy="21" rx="15" ry="9.5" />
      <ellipse cx="23" cy="21" rx="4" ry="2.6" />
    </svg>
  )
}

export function IconFrutasVerduras(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17 17h14l-7 25Z" />
      <path d="M20 17c-1-5-3-7-6-8M24 17V8M28 17c1-5 3-7 6-8" />
    </svg>
  )
}

export function IconAbarrotes(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="14" y="16" width="20" height="24" rx="4" />
      <rect x="18" y="8" width="12" height="8" rx="2" />
    </svg>
  )
}

export function IconBebidas(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 8h8v7l5 7v20a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V22l5-7Z" />
      <path d="M15 26h18" />
    </svg>
  )
}

export function IconSnacks(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 16h20l-3 22a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3Z" />
      <path d="M18 16l2-8h8l2 8" />
    </svg>
  )
}

export function IconLimpieza(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="15" y="18" width="14" height="22" rx="3" />
      <path d="M19 18v-6h6v6" />
      <path d="M25 12h7l-2 4h-5" />
    </svg>
  )
}

export function IconLicores(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 11h20l-9 14v11" />
      <path d="M17 40h14M24 36v6" />
    </svg>
  )
}

export function IconMascotas(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="24" cy="31" rx="9.5" ry="7" />
      <circle cx="13" cy="19" r="4" />
      <circle cx="24" cy="13" r="4.5" />
      <circle cx="35" cy="19" r="4" />
    </svg>
  )
}

export function IconOtros(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="11" y="17" width="26" height="21" rx="2.5" />
      <path d="M11 24h26M24 17v21" />
    </svg>
  )
}

export type CategoryIcon = (props: IconProps) => JSX.Element

const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  'lácteos': IconLacteos, 'lacteos': IconLacteos,
  'panadería': IconPanaderia, 'panaderia': IconPanaderia,
  'carnes y embutidos': IconCarnes,
  'frutas y verduras': IconFrutasVerduras,
  'abarrotes': IconAbarrotes,
  'bebidas': IconBebidas,
  'snacks': IconSnacks,
  'limpieza': IconLimpieza,
  'licores': IconLicores,
  'mascotas': IconMascotas,
  'otros / varios': IconOtros, 'otros/varios': IconOtros, 'otros': IconOtros,
}

export function getCategoryIcon(name: string): CategoryIcon {
  return CATEGORY_ICONS[name.toLowerCase()] ?? IconAbarrotes
}
