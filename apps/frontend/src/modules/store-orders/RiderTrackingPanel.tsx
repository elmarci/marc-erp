import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { io } from 'socket.io-client'
import { MapPin } from 'lucide-react'
import { api } from '@/services/api'
import { formatDateTime } from '@/lib/utils'

interface TrackingData {
  order: { id: string; orderNumber: string; status: string; deliveryStatus: string | null }
  rider: { id: string; nombre: string; telefono: string; lastLat: number | null; lastLng: number | null; lastLocationAt: string | null } | null
  events: Array<{ id: string; type: string; lat: number | null; lng: number | null; createdAt: string }>
}

const EVENT_LABELS: Record<string, string> = {
  CLAIMED: 'Tomó el pedido', RELEASED: 'Liberó el pedido', READY_NOTIFIED: 'Avisado: listo para recoger',
  RECOGIDO: 'Recogió el pedido', EN_CAMINO: 'Salió en camino', ENTREGADO: 'Entregó el pedido',
  UNDO_ASIGNADO: 'Deshizo "recogido"', UNDO_RECOGIDO: 'Deshizo "en camino"',
}

// Mismo divIcon-con-insignia-de-moto que apps/delivery/src/components/RouteMap.tsx
// (nunca el pin genérico de Leaflet) — así el ERP y la app del biker se ven
// coherentes, y nunca un mapa de Google (regla de marca).
function riderIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:#2460b4;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35)">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M5 17h4l3-7h5"/><path d="M12 10l2 4h5l-2-4h-3"/><path d="M9 7h3"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

export function RiderTrackingPanel({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['order-tracking', orderId],
    queryFn: async () => (await api.get<{ data: TrackingData }>(`/delivery/admin/orders/${orderId}/tracking`)).data.data,
    refetchInterval: 20000,
  })

  useEffect(() => {
    const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001/api/v1'
    const socket = io(base.replace('/api/v1', ''), { transports: ['websocket', 'polling'] })
    socket.on('delivery:rider-location', (payload: { riderId: string; lat: number; lng: number }) => {
      if (data?.rider?.id === payload.riderId) setLivePos({ lat: payload.lat, lng: payload.lng })
    })
    socket.on(`store:order-updated:${data?.order.orderNumber}`, () => {
      queryClient.invalidateQueries({ queryKey: ['order-tracking', orderId] })
    })
    return () => { socket.disconnect() }
  }, [data?.rider?.id, data?.order.orderNumber, orderId, queryClient])

  if (isLoading || !data) return <div className="text-sm text-muted-foreground py-3">Cargando seguimiento...</div>
  if (!data.rider) return <div className="text-sm text-muted-foreground py-3">Todavía no hay un repartidor asignado.</div>

  const pos = livePos ?? (data.rider.lastLat != null && data.rider.lastLng != null
    ? { lat: data.rider.lastLat, lng: data.rider.lastLng }
    : null)

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">{data.rider.nombre}</p>
          <p className="text-xs text-muted-foreground">{data.rider.telefono}</p>
        </div>
        <a href={`tel:${data.rider.telefono}`} className="text-xs font-medium text-primary hover:underline">Llamar</a>
      </div>

      {pos ? (
        <div className="h-48 overflow-hidden rounded-lg">
          <MapContainer center={[pos.lat, pos.lng]} zoom={14} style={{ height: '100%', width: '100%' }} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[pos.lat, pos.lng]} icon={riderIcon()} />
          </MapContainer>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />Todavía no reportó su ubicación.
        </div>
      )}
      {data.rider.lastLocationAt && (
        <p className="text-xs text-muted-foreground">Última actualización: {formatDateTime(data.rider.lastLocationAt)}</p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Línea de tiempo</p>
        <div className="space-y-1.5">
          {data.events.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs">
              <span>{EVENT_LABELS[e.type] ?? e.type}</span>
              <span className="text-muted-foreground">{formatDateTime(e.createdAt)}</span>
            </div>
          ))}
          {data.events.length === 0 && <p className="text-xs text-muted-foreground">Sin eventos todavía.</p>}
        </div>
      </div>
    </div>
  )
}
