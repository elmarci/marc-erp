import type { Product } from '../api'

// Presentación (unidad o paquete) y opciones de despacho (pierna/pecho,
// helada/sin helar) de un producto en el carrito.
//
// Cada combinación elegida es una LÍNEA distinta del carrito: 2 Coca-Cola
// heladas y 1 sin helar son dos líneas. Para no cambiar todo el carrito,
// la línea es un "producto" con id propio (`<id>~p~Helada`) que guarda en
// `line` el id real y lo elegido; al pedir se manda el id real.

export type Choice = { pack: boolean; options: Record<string, string> }

export const realIdOf = (p: Product) => p.line?.realId ?? p.id

// Necesita que el cliente elija algo antes de agregar.
export const needsChooser = (p: Product) => !!p.pack || (p.options?.length ?? 0) > 0

export function optionsTextOf(p: Product, options: Record<string, string>): string {
  return (p.options ?? [])
    .filter(g => options[g.id])
    .map(g => options[g.id])
    .join(' · ')
}

// Grupos obligatorios que faltan elegir (para el carrito y el checkout).
// Productos de un combo de oferta (id "bundle-…") no piden opciones.
export function missingRequired(p: Product, options?: Record<string, string>): string[] {
  if (p.id.startsWith('bundle-')) return []
  const chosen = options ?? p.line?.options ?? {}
  return (p.options ?? []).filter(g => g.required && !chosen[g.id]).map(g => g.name)
}

// "Producto" de la línea del carrito para lo elegido.
export function withChoice(base: Product, choice: Choice): Product {
  // Si ya era una línea, se vuelve al producto original (con paquete, el
  // nombre, precio y stock por unidad quedaron guardados en line.unit).
  const product: Product = base.line
    ? { ...base, ...(base.line.unit ?? {}), id: base.line.realId, line: undefined }
    : base
  const usePack = choice.pack && !!product.pack && !product.isBulk
  const options = Object.fromEntries(
    Object.entries(choice.options).filter(([gid, v]) => v && product.options?.some(g => g.id === gid && g.choices.includes(v))),
  )
  const optionsText = optionsTextOf(product, options)
  if (!usePack && !optionsText) return { ...product, line: undefined }
  const key = Object.keys(options).sort().map(k => options[k]).join('|')
  return {
    ...product,
    id: `${product.id}~${usePack ? 'p' : 'u'}~${key}`,
    name: usePack ? `${product.name} (${product.pack!.label} x${product.pack!.size})` : product.name,
    salePrice: usePack ? product.pack!.price : product.salePrice,
    // Stock en paquetes completos (el servidor revisa de nuevo al pedir).
    currentStock: usePack ? Math.floor(product.currentStock / product.pack!.size) : product.currentStock,
    line: {
      realId: product.id, pack: usePack || undefined, options, optionsText: optionsText || undefined,
      unit: usePack ? { name: product.name, salePrice: product.salePrice, currentStock: product.currentStock } : undefined,
    },
  }
}

// Ahorro del paquete frente a comprar las mismas unidades sueltas.
export function packSavings(p: Product): number {
  if (!p.pack) return 0
  return Math.max(0, Math.round((p.salePrice * p.pack.size - p.pack.price) * 100) / 100)
}
