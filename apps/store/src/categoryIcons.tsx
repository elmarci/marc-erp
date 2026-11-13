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

export function getCategoryIcon(name: string): CategoryIcon {
  return CATEGORY_ICONS[name.toLowerCase()] ?? IconAbarrotes
}
