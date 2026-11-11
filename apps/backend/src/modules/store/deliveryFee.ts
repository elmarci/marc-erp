import { haversineKm, STORE_ORIGIN } from '../delivery/economics';

// Tarifa de envío que paga el CLIENTE de la tienda online (no es la tarifa
// que se le paga al biker, ver delivery/economics.ts). Se calcula siempre
// acá, en el servidor: nunca se confía en un monto que mande el navegador.
// Mismos valores que apps/store/src/lib/storeInfo.ts — si cambian, cambiar
// en los dos lados.
//
// Reglas del dueño (2026-11-10): zonas aledañas a la tienda S/ 1.00, demás
// zonas S/ 1.50; express suma S/ 1.50 (mínimo S/ 2.50).
export const FEE_NEAR = 1.0;
export const FEE_FAR = 1.5;
export const FEE_EXPRESS_EXTRA = 1.5;
export const NEAR_KM = 1;
// Más lejos que esto, el GPS casi seguro no es el lugar de entrega (el
// cliente pidió desde otro sitio): se ignora y se cobra por zona.
export const MAX_GPS_KM = 5;
export const NEAR_ZONES = ['Naranjos', 'Villa Hermosa', 'Unión', 'Paradero 1'];

export function storeDeliveryFee(input: {
  latitude?: number | null; longitude?: number | null; district?: string | null; express?: boolean;
}): number {
  let base: number;
  const km = input.latitude != null && input.longitude != null
    ? haversineKm(STORE_ORIGIN, { lat: input.latitude, lng: input.longitude })
    : null;
  if (km != null && km <= MAX_GPS_KM) base = km <= NEAR_KM ? FEE_NEAR : FEE_FAR;
  else base = input.district && NEAR_ZONES.includes(input.district) ? FEE_NEAR : FEE_FAR;
  return base + (input.express ? FEE_EXPRESS_EXTRA : 0);
}
