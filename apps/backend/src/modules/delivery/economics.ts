import { storeDeliveryFee } from '../store/deliveryFee';

// Lo que gana el repartidor por un pedido de la tienda online es exactamente
// el envío que pagó el cliente (StoreOrder.deliveryCost, calculado en el
// servidor en store/deliveryFee.ts): S/ 1.00, 1.50, 2.00, más S/ 2.00 si es
// express. Regla del dueño (2026-11-21): el repartidor ve el precio real que
// le pagarán y decide si lo toma.

// Ubicación real de la tienda (Mz F10 Lt2 A - C.27 Av Manchay). Es el punto
// desde el que se mide la distancia del envío y del reparto.
export const STORE_ORIGIN = { lat: -12.102235, lng: -76.874449 };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Si el envío salió en S/ 0 (p. ej. una promoción de envío gratis), al
// repartidor igual se le paga lo que habría costado ese envío.
export function tarifaParaPedido(order: {
  deliveryCost: unknown; latitude: number | null; longitude: number | null; district?: string | null; express?: boolean | null;
}): number {
  const cobrado = Math.round(Number(order.deliveryCost ?? 0) * 100) / 100;
  if (cobrado > 0) return cobrado;
  return storeDeliveryFee({ latitude: order.latitude, longitude: order.longitude, district: order.district, express: !!order.express });
}
