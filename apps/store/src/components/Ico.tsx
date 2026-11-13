// Ícono del set propio de Tiendas Marc (public/icons/<name>.svg). Son dibujos
// a color, decorativos: el texto de al lado siempre dice qué es.
export function Ico({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  return <img src={`/icons/${name}.svg`} alt="" aria-hidden="true" draggable={false} className={`object-contain shrink-0 ${className}`} />
}
