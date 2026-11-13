import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
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

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  const key = points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16)
    else map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 17 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

export default function TrackingMap({ store, destination, rider }: { store: LatLng; destination: LatLng | null; rider: LatLng | null }) {
  const points = [rider ?? store, destination].filter(Boolean) as LatLng[]
  if (!rider) points.push(store)
  const from = rider ?? store
  return (
    // isolate: los paneles de Leaflet usan z-index 400+ y si no se encierran
    // pasan por encima de la cabecera fija y del menú lateral.
    <div className="relative isolate h-[220px] w-full">
      <style>{'@keyframes marc-ping{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}'}</style>
      <MapContainer center={[from.lat, from.lng]} zoom={15} zoomControl={false} attributionControl={false}
        scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[store.lat, store.lng]} icon={storeIcon} />
        {destination && <Marker position={[destination.lat, destination.lng]} icon={homeIcon} />}
        {destination && (
          <Polyline positions={[[from.lat, from.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: '#1450b4', weight: 4, dashArray: '2 9', lineCap: 'round' }} />
        )}
        {rider && <Marker position={[rider.lat, rider.lng]} icon={riderIcon} />}
        <FitBounds points={points} />
      </MapContainer>
      <span className="absolute bottom-1 right-2 z-[500] text-[10px] text-paper-ink-soft bg-white/80 px-1 rounded">© OpenStreetMap</span>
    </div>
  )
}
