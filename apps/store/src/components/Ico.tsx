// Ícono del set propio de Tiendas Marc (public/icons/<name>.svg). Son dibujos
// a color, decorativos: el texto de al lado siempre dice qué es. Los íconos
// "ico-*" (segundo set, 2026-11) vienen en WebP.
export function Ico({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  const file = name.startsWith('ico-') ? `${name}.webp` : `${name}.svg`
  return <img src={`/icons/${file}`} alt="" aria-hidden="true" draggable={false} className={`object-contain shrink-0 ${className}`} />
}

// Foto de apoyo (public/ilustraciones/<name>.webp, 4:3). Decorativa: el título
// de al lado dice lo mismo con palabras. Se recorta para llenar su caja.
export function Ilu({ name, className = 'h-40 w-auto', eager = false }: { name: string; className?: string; eager?: boolean }) {
  return (
    <img src={`/ilustraciones/${name}.webp`} alt="" aria-hidden="true" draggable={false}
      width={640} height={480} loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`object-cover rounded-2xl bg-paper-surface select-none ${className}`} />
  )
}
