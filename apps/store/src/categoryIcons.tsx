// Íconos de categoría del set propio de Tiendas Marc (public/icons/cat-*.svg,
// entregado por el dueño en 2026-11). Son dibujos a color (azul de marca con
// relleno suave), así que se muestran como imagen y no toman el color del
// texto: en un fondo azul hay que ponerlos sobre blanco.
//
// La firma (componente que recibe className) es la misma de antes, para que
// los sitios que usan getCategoryIcon() no cambien.
type IconProps = { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }
export type CategoryIcon = (props: IconProps) => JSX.Element

const icon = (file: string): CategoryIcon =>
  function CategoryImg({ className }: IconProps) {
    return <img src={`/icons/${file}.svg`} alt="" aria-hidden="true" className={`object-contain ${className ?? ''}`} />
  }

export const IconTodo = icon('cat-todo')
const IconAbarrotes = icon('cat-abarrotes')
const IconOtros = icon('cat-otros')

const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  'lácteos': icon('cat-lacteos'), 'lacteos': icon('cat-lacteos'),
  'panadería': icon('cat-panaderia'), 'panaderia': icon('cat-panaderia'),
  'carnes y embutidos': icon('cat-carnes'), 'carnes': icon('cat-carnes'),
  'frutas y verduras': icon('cat-frutas-verduras'),
  'abarrotes': IconAbarrotes,
  'bebidas': icon('cat-bebidas'),
  'snacks': icon('cat-snacks'),
  'limpieza': icon('cat-limpieza'),
  'licores': icon('cat-licores'),
  'mascotas': icon('cat-mascotas'),
  'otros / varios': IconOtros, 'otros/varios': IconOtros, 'otros': IconOtros,
}

// Íconos 3D de las categorías padre (entregados por el dueño el 2026-11-13,
// public/icons/cat3d/*.webp). Cada uno ya trae su propio fondo redondeado
// menta/durazno, así que se muestran llenando el recuadro. Se reconocen por
// palabra clave para no depender del nombre exacto que tenga en el ERP.
const TILE_KEYWORDS: Array<[RegExp, string]> = [
  [/farmac|botic|salud|medic/, 'farmacia'],
  [/juguet/, 'juguetes'],
  [/util|librer|escolar|papeler|oficina/, 'utiles'],
  [/lact|leche|queso|yogur/, 'lacteos'],
  [/panad|pasteler|\bpan\b/, 'panaderia'],
  [/carne|embutid|pollo|fiambre/, 'carnes'],
  [/fruta|verdura/, 'frutas-verduras'],
  [/abarrot|despensa/, 'abarrotes'],
  [/licor|cerveza|vino|alcohol/, 'licores'],
  [/bebida|gaseosa|agua/, 'bebidas'],
  [/snack|golosin|dulce|galleta|piqueo/, 'snacks'],
  [/limpie|aseo|hogar/, 'limpieza'],
  [/mascot/, 'mascotas'],
]

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Ruta del ícono 3D de la categoría, o null si no tiene. */
export function getCategoryTile(name: string): string | null {
  const n = normalize(name)
  const hit = TILE_KEYWORDS.find(([re]) => re.test(n))
  return hit ? `/icons/cat3d/${hit[1]}.webp` : null
}

const tile = (src: string): CategoryIcon =>
  function CategoryTile({ className }: IconProps) {
    return <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" className={`object-cover rounded-[22%] ${className ?? ''}`} />
  }
const tileCache = new Map<string, CategoryIcon>()

export function getCategoryIcon(name: string): CategoryIcon {
  const src = getCategoryTile(name)
  if (src) {
    if (!tileCache.has(src)) tileCache.set(src, tile(src))
    return tileCache.get(src)!
  }
  return CATEGORY_ICONS[name.toLowerCase()] ?? IconAbarrotes
}
