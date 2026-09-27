import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryOrder } from '../types'
import type { LatLng } from '../lib/geo'

const H = 320

interface RouteMapProps {
  riderPos: LatLng
  orders: DeliveryOrder[]
  selected: Set<string>
  onToggle: (id: string) => void
  // Orden de visita ya resuelto (por OSRM o, si falla, por el fallback en
  // línea recta) — numera los pines seleccionados; null mientras no hay ruta.
  ordenVisita: string[]
  routeGeometry: LatLng[]
}

function riderIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:#2460b4;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2"/></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function orderIcon(numero: number | null, seleccionado: boolean) {
  const bg = seleccionado ? '#2f6c12' : '#ffffff'
  const border = seleccionado ? '#2f6c12' : '#c9c7bb'
  const color = seleccionado ? '#ffffff' : '#26241c'
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
export function RouteMap({ riderPos, orders, selected, onToggle, ordenVisita, routeGeometry }: RouteMapProps) {
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
          <Polyline positions={routeGeometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#2f6c12', weight: 4.5, opacity: 0.9 }} />
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

        <Marker position={[riderPos.lat, riderPos.lng]} icon={riderIcon()} />
      </MapContainer>
    </div>
  )
}
