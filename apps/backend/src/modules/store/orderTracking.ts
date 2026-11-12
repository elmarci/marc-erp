import { haversineKm, STORE_ORIGIN } from '../delivery/economics';

// Seguimiento del pedido que ve el CLIENTE en la tienda online (pantalla
// /pedido/:orderNumber). Junta en un solo objeto lo que hoy está repartido
// entre el estado del pedido (lo mueve el staff en el ERP), el sub-estado de
// reparto (lo mueve el biker en apps/delivery) y la última posición GPS del
// biker. No guarda nada nuevo: todo sale de columnas que ya existen.
//
// Privacidad: este endpoint es público por número de pedido, así que del
// repartidor solo sale nombre corto, moto y placa (nunca su teléfono) y su
// ubicación solo mientras lleva ESTE pedido (recogido / en camino).

export type TrackingStage =
  | 'RECIBIDO' | 'CONFIRMADO' | 'PREPARANDO' | 'LISTO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';

// Velocidad media de una moto dentro de Manchay alto y cuánto más largo es
// el camino real que la línea recta (calles en pendiente, sin vía directa).
const RIDER_KMH = 18;
const ROAD_FACTOR = 1.4;
// Una posición más vieja que esto ya no sirve para decir "dónde está".
const LOCATION_FRESH_MS = 5 * 60 * 1000;

interface TrackingInput {
  status: string;
  deliveryType: string;
  deliveryStatus: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  claimedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  rider: {
    nombre: string; motoModelo: string | null; motoPlaca: string | null; calificacion: number | null;
    lastLat: number | null; lastLng: number | null; lastLocationAt: Date | null;
  } | null;
  deliveryEvents: Array<{ type: string; createdAt: Date }>;
}

function stageOf(o: TrackingInput): TrackingStage {
  if (o.status === 'CANCELLED') return 'CANCELADO';
  if (o.status === 'DELIVERED' || o.deliveryStatus === 'ENTREGADO') return 'ENTREGADO';
  if (o.deliveryStatus === 'RECOGIDO' || o.deliveryStatus === 'EN_CAMINO') return 'EN_CAMINO';
  if (o.status === 'READY') return 'LISTO';
  if (o.status === 'PREPARING') return 'PREPARANDO';
  if (o.status === 'CONFIRMED') return 'CONFIRMADO';
  return 'RECIBIDO';
}

// "Juan Pérez Rojas" → "Juan P." — basta para reconocerlo en la puerta.
function shortName(nombre: string) {
  const [first, second] = nombre.trim().split(/\s+/);
  return second ? `${first} ${second[0].toUpperCase()}.` : first;
}

// El checkout escribe la fecha/turno/hora elegidos dentro de `notes`
// ("ENTREGA: mañana mié 11 nov, turno tarde (5 a 9 pm), hora 6:00 pm | …").
function noteField(notes: string | null, key: string) {
  const part = notes?.split('|').map(s => s.trim()).find(s => s.startsWith(`${key}:`));
  return part ? part.slice(key.length + 1).trim() : null;
}

const minutesFor = (km: number) => Math.max(1, Math.ceil((km * ROAD_FACTOR / RIDER_KMH) * 60));

export function buildTracking(o: TrackingInput, now = new Date()) {
  const stage = stageOf(o);
  const isDelivery = o.deliveryType === 'DELIVERY';
  const destination = o.latitude != null && o.longitude != null ? { lat: o.latitude, lng: o.longitude } : null;
  const onTheWay = stage === 'EN_CAMINO';

  const fresh = o.rider?.lastLat != null && o.rider.lastLng != null && o.rider.lastLocationAt
    && now.getTime() - o.rider.lastLocationAt.getTime() <= LOCATION_FRESH_MS;
  const riderLocation = isDelivery && onTheWay && fresh
    ? { lat: o.rider!.lastLat!, lng: o.rider!.lastLng!, at: o.rider!.lastLocationAt!.toISOString() }
    : null;

  // Tiempo de llegada: solo cuando ya salió y hay dónde medir. Desde la
  // posición del biker si es reciente; si no, desde la tienda.
  let etaMinutes: number | null = null;
  let kmLeft: number | null = null;
  if (isDelivery && onTheWay && destination) {
    const from = riderLocation ?? STORE_ORIGIN;
    kmLeft = Math.round(haversineKm(from, destination) * ROAD_FACTOR * 10) / 10;
    etaMinutes = minutesFor(haversineKm(from, destination)) + (o.deliveryStatus === 'RECOGIDO' ? 3 : 0);
  }

  const entrega = noteField(o.notes, 'ENTREGA');
  const lastEvent = (type: string) =>
    [...o.deliveryEvents].reverse().find(e => e.type === type)?.createdAt.toISOString() ?? null;

  return {
    stage,
    express: entrega?.includes('EXPRESS') ?? false,
    schedule: entrega && !entrega.includes('EXPRESS') ? entrega : null,
    receiver: noteField(o.notes, 'RECIBE'),
    etaMinutes,
    kmLeft,
    store: STORE_ORIGIN,
    destination: isDelivery ? destination : null,
    riderLocation,
    rider: isDelivery && o.rider ? {
      nombre: shortName(o.rider.nombre),
      iniciales: o.rider.nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase(),
      moto: o.rider.motoModelo || null,
      placa: o.rider.motoPlaca || null,
      calificacion: o.rider.calificacion,
    } : null,
    times: {
      recibido: o.createdAt.toISOString(),
      asignado: o.claimedAt?.toISOString() ?? null,
      recogido: o.pickedUpAt?.toISOString() ?? null,
      enCamino: lastEvent('EN_CAMINO'),
      entregado: o.deliveredAt?.toISOString() ?? null,
    },
  };
}
