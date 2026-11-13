import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, ZoomControl, useMap } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { LocateFixed } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type LatLng = { lat: number; lng: number }

// Pines del set propio de Tiendas Marc (public/icons/pin-*.svg) dentro de un
// círculo blanco con borde de color: tienda y casa en azul, la moto en verde
// con un halo que late para que se note que se mueve.
const pin = (name: string, border: string, size = 40, pulse = false) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:${size}px;height:${size}px">
    ${pulse ? '<span style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(43,122,18,.25);animation:marc-ping 1.6s ease-out infinite"></span>' : ''}
    <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:2.5px solid ${border};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(20,33,61,.3)">
      <img src="/icons/${name}.svg" alt="" style="width:${Math.round(size * 0.72)}px;height:${Math.round(size * 0.72)}px" />
    </div>
  </div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
})

const storeIcon = pin('pin-tienda', '#1450b4')
const homeIcon = pin('pin-casa', '#1450b4')
const riderIcon = pin('pin-moto', '#2b7a12', 44, true)

// Anima la moto entre posiciones (el repartidor manda su GPS cada 15 s): sin
// esto el pin "salta". Igual que AnimatedRiderMarker de la app de delivery.
function AnimatedMarker({ position, icon }: { position: LatLng; icon: L.DivIcon }) {
  const ref = useRef<L.Marker>(null)
  const shown = useRef<LatLng>(position)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const from = shown.current, to = position
    if (from.lat === to.lat && from.lng === to.lng) return
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900), e = 1 - (1 - t) ** 3
      m.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e])
      if (t < 1) raf = requestAnimationFrame(step); else shown.current = to
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [position.lat, position.lng])
  return <Marker ref={ref} position={[shown.current.lat, shown.current.lng]} icon={icon} />
}

function FitBounds({ points, version }: { points: LatLng[]; version: number }) {
  const map = useMap()
  const key = points.map(p => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|')
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      map.invalidateSize()
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16)
      else map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 17 })
    })
    return () => cancelAnimationFrame(id)
    // Solo se reencuadra cuando cambia bastante (≈100 m) o al tocar "centrar":
    // así el cliente puede mover el mapa sin que se le vuelva a mover solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, map])
  return null
}

export type RouteInfo = { km: number; min: number }

// Ruta real por calles (servidor público de OSRM, el mismo que usa la app de
// los motorizados). Si no responde, se dibuja una línea punteada recta.
async function fetchRoute(from: LatLng, to: LatLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error('ruta')
  const data = await res.json()
  const r = data.routes?.[0]
  if (data.code !== 'Ok' || !r) throw new Error('ruta')
  return {
    line: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]),
    km: r.distance / 1000, min: r.duration / 60,
  }
}

export default function TrackingMap({ store, destination, rider, onRoute, height = 300 }: {
  store: LatLng; destination: LatLng | null; rider: LatLng | null; onRoute?: (r: RouteInfo | null) => void; height?: number
}) {
  const from = rider ?? store
  const points = [from, destination].filter(Boolean) as LatLng[]
  const [version, setVersion] = useState(0)

  // Se recalcula cuando la moto avanza ~100 m, no en cada ping.
  const routeKey = destination ? `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${destination.lat},${destination.lng}` : null
  const { data: route } = useQuery({
    queryKey: ['osrm-route', routeKey],
    queryFn: () => fetchRoute(from, destination!),
    enabled: !!routeKey,
    staleTime: Infinity,
    retry: 1,
  })
  useEffect(() => { onRoute?.(route ? { km: route.km, min: route.min } : null) }, [route, onRoute])

  return (
    // isolate: los paneles de Leaflet usan z-index 400+ y si no se encierran
    // pasan por encima de la cabecera fija y del menú lateral.
    <div className="marc-track-map relative isolate w-full" style={{ height }}>
      <style>{`@keyframes marc-ping{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}
        .marc-track-map .leaflet-control-zoom{border:none;box-shadow:0 1px 4px rgba(20,33,61,.25);border-radius:12px;overflow:hidden;margin:10px}
        .marc-track-map .leaflet-control-zoom a{width:36px;height:36px;line-height:36px;color:#14213d;font-size:18px}`}</style>
      <MapContainer center={[from.lat, from.lng]} zoom={15} zoomControl={false} attributionControl={false}
        scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <ZoomControl position="topright" />
        {destination && (route ? (
          <>
            {/* Ruta estilo navegador: borde blanco y línea azul encima */}
            <Polyline positions={route.line} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={route.line} pathOptions={{ color: '#1450b4', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          </>
        ) : (
          <Polyline positions={[[from.lat, from.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: '#1450b4', weight: 4, dashArray: '2 9', lineCap: 'round' }} />
        ))}
        <Marker position={[store.lat, store.lng]} icon={storeIcon} />
        {destination && <Marker position={[destination.lat, destination.lng]} icon={homeIcon} />}
        {rider && <AnimatedMarker position={rider} icon={riderIcon} />}
        <FitBounds points={points} version={version} />
      </MapContainer>
      <button type="button" onClick={() => setVersion(v => v + 1)} aria-label="Centrar el mapa en tu pedido"
        className="absolute left-2.5 bottom-2.5 z-[500] h-10 px-3 rounded-xl bg-white shadow-card text-[13px] font-bold text-brand-blue-700 flex items-center gap-1.5">
        <LocateFixed className="h-4 w-4" aria-hidden="true" />Centrar
      </button>
      <span className="absolute bottom-1 right-2 z-[500] text-[10px] text-paper-ink-soft bg-white/80 px-1 rounded">© OpenStreetMap</span>
    </div>
  )
}
