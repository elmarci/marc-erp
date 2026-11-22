export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

// Clases por defecto de un componente que el `className` de quien lo usa
// puede reemplazar (alto, ancho, radio, padding horizontal, tamaño de letra).
// Sin esto, "h-[52px]" y "h-14" quedan juntos y gana el que Tailwind
// escriba último, no el que pidió la pantalla.
const GRUPOS = [/^h-/, /^w-/, /^rounded/, /^px-/, /^text-\[/, /^text-(xs|sm|base|lg|xl|\dxl)$/]
export function withDefaults(defaults: string, className?: string): string {
  if (!className) return defaults
  const custom = className.split(/\s+/).filter(Boolean)
  const keep = defaults.split(/\s+/).filter((d) => {
    const g = GRUPOS.find((re) => re.test(d))
    return !g || !custom.some((c) => g.test(c))
  })
  return [...keep, ...custom].join(' ')
}
