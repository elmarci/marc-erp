// Misma fórmula y mismos valores que apps/delivery/src/lib/economics.ts —
// acá se recalcula server-side (nunca se confía en un monto que mande el
// cliente) para congelar la tarifa real en el momento del claim.
export const TARIFA_MINIMA_SOLES = 5.0;
export const TARIFA_POR_KM_SOLES = 2.0;

// Origen de referencia (tienda/zona Manchay) — mismo punto que RIDER_BASE
// en apps/delivery/src/mockApi.ts, usado cuando el pedido no tiene GPS del
// cliente para poder estimar una distancia igual.
export const STORE_ORIGIN = { lat: -12.038, lng: -76.845 };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calcularTarifa(distanciaKm: number): number {
  return Math.max(TARIFA_MINIMA_SOLES, distanciaKm * TARIFA_POR_KM_SOLES);
}

// Si el pedido no tiene lat/lng (el cliente no compartió ubicación al hacer
// el pedido), no hay forma real de medir distancia — se cobra/paga la
// tarifa mínima como piso seguro en vez de asumir un valor inventado.
export function tarifaParaPedido(order: { latitude: number | null; longitude: number | null }): number {
  if (order.latitude == null || order.longitude == null) return TARIFA_MINIMA_SOLES;
  const distanciaKm = haversineKm(STORE_ORIGIN, { lat: order.latitude, lng: order.longitude });
  return calcularTarifa(distanciaKm);
}
