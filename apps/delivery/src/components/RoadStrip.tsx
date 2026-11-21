// Tira de ruta: Tienda ── distancia ── destino. El guiño biker de cada pedido.
export function RoadStrip({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-soft">
      <i className="h-2.5 w-2.5 flex-none rounded-full border-2 border-ink" />
      <span className="flex-none">Tienda</span>
      <i className="road-dash min-w-3 flex-1" />
      <span className="flex-none tabular-nums">{texto}</span>
      <i className="road-dash min-w-3 flex-1" />
      <i className="h-2.5 w-2.5 flex-none rounded-full bg-ink" />
    </div>
  )
}
