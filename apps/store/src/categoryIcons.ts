import {
  Milk, Croissant, Beef, Apple, ShoppingBasket, CupSoda, Cookie, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Ícono representativo por categoría — puramente visual, para que la grilla
// y el menú de categorías se sientan más de "supermercado" y menos como una
// lista de texto. Si el nombre no matchea, se usa un ícono genérico.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'lácteos': Milk, 'lacteos': Milk,
  'panadería': Croissant, 'panaderia': Croissant,
  'carnes y embutidos': Beef,
  'frutas y verduras': Apple,
  'abarrotes': ShoppingBasket,
  'bebidas': CupSoda,
  'snacks': Cookie,
  'limpieza': Sparkles,
}

export function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name.toLowerCase()] ?? ShoppingBasket
}
