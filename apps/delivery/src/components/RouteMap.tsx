import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryOrder } from '../types'
import type { LatLng } from '../lib/geo'

const H = 320

interface RouteMapProps {
  riderPos: LatLng
  riderIniciales: string
  orders: DeliveryOrder[]
  selected: Set<string>
  onToggle: (id: string) => void
  // Orden de visita ya resuelto (por OSRM o, si falla, por el fallback en
  // línea recta) — numera los pines seleccionados; null mientras no hay ruta.
  ordenVisita: string[]
  routeGeometry: LatLng[]
}

// Avatar con las iniciales del repartidor (mismo patrón que Estado/Perfil —
// no hay foto real todavía) más una insignia de moto — no una bicicleta —
// para que se identifique de un vistazo, igual que un driver de Uber/inDrive.
function riderIcon(iniciales: string) {
  const label = (iniciales || '').slice(0, 2).toUpperCase()
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:38px;height:38px;">
      <div style="width:38px;height:38px;border-radius:9999px;background:#2460b4;border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-family:'Public Sans',sans-serif;font-weight:800;font-size:13px;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${label}</div>
      <div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-radius:9999px;background:#c9552a;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3)">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="5" cy="17" r="3"/>
          <circle cx="19" cy="17" r="3"/>
          <path d="M5 17h4l3-7h5"/>
          <path d="M12 10l2 4h5l-2-4h-3"/>
          <path d="M9 7h3"/>
        </svg>
      </div>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

// El GPS entrega posiciones a saltos (cada varios segundos); sin esto el
// marcador "teletransporta" de un punto a otro. Se anima con un tween propio
// en vez de depender de que Leaflet re-renderice el Marker, para no pelear
// con el ciclo de vida de react-leaflet.
function AnimatedRiderMarker({ position, icon }: { position: LatLng; icon: L.DivIcon }) {
  const markerRef = useRef<L.Marker>(null)
  const displayedRef = useRef<LatLng>(position)
  const rafRef = useRef<number>()

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    const from = displayedRef.current
    const to = position
    if (from.lat === to.lat && from.lng === to.lng) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const DURATION_MS = 700
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const eased = 1 - (1 - t) ** 3
      const lat = from.lat + (to.lat - from.lat) * eased
      const lng = from.lng + (to.lng - from.lng) * eased
      marker.setLatLng([lat, lng])
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        displayedRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [position.lat, position.lng])

  return <Marker ref={markerRef} position={[displayedRef.current.lat, displayedRef.current.lng]} icon={icon} />
}

function orderIcon(numero: number | null, seleccionado: boolean) {
  const bg = seleccionado ? '#7ED957' : '#26241c'
  const border = seleccionado ? '#7ED957' : '#6b6656'
  const color = seleccionado ? '#12250a' : '#f5f1e6'
  const dot = !seleccionado ? '<div style="position:absolute;top:13px;left:13px;width:8px;height:8px;border-radius:9999px;background:#c9552a"></div>' : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:34px;height:34px;"><div style="width:34px;height:34px;border-radius:9999px;background:${bg};border:2px solid ${border};display:flex;align-items:center;justify-content:center;font-family:'Public Sans',sans-serif;font-weight:800;font-size:13px;color:${color};box-shadow:0 1px 5px rgba(0,0,0,0.25)">${numero ?? ''}</div>${dot}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  useEffect(() => {
    if (points.length === 0) return
    // El contenedor todavía no tiene su tamaño final de layout (flex) en el
    // primer render — sin este invalidateSize + espera al siguiente frame,
    // Leaflet calcula el pixel-origin con un tamaño equivocado y los pines
    // terminan fuera del recuadro visible aunque el zoom "parezca" correcto.
    const id = requestAnimationFrame(() => {
      map.invalidateSize()
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 15)
      } else {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [34, 34] })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [map, key])
  return null
}

// Mapa real (tiles de OpenStreetMap) en vez del SVG de cuadrícula anterior —
// nunca Google Maps embebido (guía de marca), pero sí calles, geografía y
// una ruta real de por medio en vez de líneas rectas.
export function RouteMap({ riderPos, riderIniciales, orders, selected, onToggle, ordenVisita, routeGeometry }: RouteMapProps) {
  const allPoints = useMemo(() => [riderPos, ...orders.map((o) => ({ lat: o.lat, lng: o.lng }))], [riderPos, orders])

  return (
    <div className="marc-map overflow-hidden rounded-[20px] border-[1.5px] border-paper-line" style={{ height: H }}>
      <MapContainer center={[riderPos.lat, riderPos.lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FitBounds points={allPoints} />

        {routeGeometry.length > 1 && (
          <Polyline positions={routeGeometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#4ca324', weight: 4.5, opacity: 0.9 }} />
        )}

        {orders.map((o) => {
          const isSelected = selected.has(o.id)
          const ordenIdx = ordenVisita.indexOf(o.id)
          return (
            <Marker
              key={o.id}
              position={[o.lat, o.lng]}
              icon={orderIcon(isSelected ? ordenIdx + 1 : null, isSelected)}
              eventHandlers={{ click: () => onToggle(o.id) }}
            >
              {/* Siempre visible, no solo al tocar — para que al llegar al
                  punto físico el repartidor pueda calzar el pedido correcto
                  sin tener que abrir el detalle primero. */}
              <Tooltip permanent direction="top" offset={[0, -20]} className="marc-map-label">
                {o.numero}
              </Tooltip>
            </Marker>
          )
        })}

        <AnimatedRiderMarker position={riderPos} icon={riderIcon(riderIniciales)} />
      </MapContainer>
    </div>
  )
}
