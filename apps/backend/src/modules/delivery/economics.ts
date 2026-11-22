import { storeDeliveryFee } from '../store/deliveryFee';

// Tarifa del repartidor = exactamente lo que el cliente pagó de envío en la
// tienda online (S/ 1, S/ 1.50, S/ 2… más el extra express si lo pidió).
// Pedido del dueño (2026-11-21): "el motorizado ve el precio real que le
// pagarán por ese pedido y decide si tomarlo o no". Antes se calculaba
// aparte (S/ 2 por km, mínimo S/ 5) y no coincidía con lo cobrado.
// Se congela en `tarifaReparto` al momento del claim.

// Ubicación real de la tienda (Mz F10 Lt2 A - C.27 Av Manchay). Es el punto
// desde el que se mide la distancia de cada pedido.
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
// repartidor igual se le paga lo que habría costado ese envío: el viaje lo
// hace igual.
export function tarifaParaPedido(order: {
  deliveryCost: unknown; latitude: number | null; longitude: number | null; district?: string | null;
}): number {
  const n = Number(order.deliveryCost);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  return storeDeliveryFee({ latitude: order.latitude, longitude: order.longitude, district: order.district });
}

/* ── Solicitudes de compra (mandados) ─────────────────────────────────── */
// Oferta sugerida al cliente para un mandado: base por salir + por km del
// recorrido (punto de compra → entrega, o tienda → entrega si no indicó
// dónde comprar) + un extra si el motorizado tiene que comprar (hacer cola,
// adelantar su plata). Es solo una sugerencia "prudente"; el cliente puede
// subirla o bajarla y el motorizado aceptar o contraofertar.
export const MANDADO_BASE = 3.0;
export const MANDADO_POR_KM = 1.0;
export const MANDADO_EXTRA_COMPRA = 1.0;
export const MANDADO_MINIMO = 3.0;
// Lo máximo que se le pide adelantar de su bolsillo a un motorizado.
export const MANDADO_MAX_ADELANTO = 150;

export function ofertaSugeridaMandado(input: {
  desde?: { lat: number; lng: number } | null;
  hasta?: { lat: number; lng: number } | null;
  conCompra: boolean;
}): { sugerida: number; km: number | null } {
  const desde = input.desde ?? STORE_ORIGIN;
  const km = input.hasta ? haversineKm(desde, input.hasta) * 1.3 : null; // 1.3 ≈ calle vs. línea recta
  const bruto = MANDADO_BASE + (km ?? 1.5) * MANDADO_POR_KM + (input.conCompra ? MANDADO_EXTRA_COMPRA : 0);
  // Redondeo a 50 céntimos: nadie ofrece S/ 4.37.
  const sugerida = Math.max(MANDADO_MINIMO, Math.round(bruto * 2) / 2);
  return { sugerida, km: km != null ? Math.round(km * 10) / 10 : null };
}
