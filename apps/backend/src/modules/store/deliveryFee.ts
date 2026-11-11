import { haversineKm, STORE_ORIGIN } from '../delivery/economics';

// Tarifa de envío que paga el CLIENTE de la tienda online (no es la tarifa
// que se le paga al biker, ver delivery/economics.ts). Se calcula siempre
// acá, en el servidor: nunca se confía en un monto que mande el navegador.
// Mismos valores que apps/store/src/lib/storeInfo.ts — si cambian, cambiar
// en los dos lados.
//
// Reglas del dueño (2026-11-10): por distancia en línea recta a la tienda,
// S/ 1.00 hasta 500 m, S/ 1.50 hasta 1 km y S/ 2.00 de 1 km a más. Sin GPS
// útil no se puede probar el tramo más corto: zonas aledañas S/ 1.50, el
// resto S/ 2.00. Express suma S/ 2.00 a la tarifa que corresponda.
export const FEE_TIERS = [{ maxKm: 0.5, fee: 1.0 }, { maxKm: 1, fee: 1.5 }];
export const FEE_BEYOND = 2.0;
export const FEE_ZONE_NEAR = 1.5;
export const FEE_ZONE_FAR = 2.0;
export const FEE_EXPRESS_EXTRA = 2.0;
// Más lejos que esto, el GPS casi seguro no es el lugar de entrega (el
// cliente pidió desde otro sitio): se ignora y se cobra por zona.
export const MAX_GPS_KM = 5;
export const NEAR_ZONES = ['Naranjos', 'Villa Hermosa', 'Unión', 'Paradero 1'];

// Comisión por pagar con tarjeta (débito o crédito por igual) en la tienda
// online: 3.5 % sobre el total del pedido. Regla del dueño (2026-11-10).
export const CARD_FEE_PERCENT = 3.5;
export const cardFee = (amount: number) => Math.round(amount * CARD_FEE_PERCENT) / 100;

export function storeDeliveryFee(input: {
  latitude?: number | null; longitude?: number | null; district?: string | null; express?: boolean;
}): number {
  let base: number;
  const km = input.latitude != null && input.longitude != null
    ? haversineKm(STORE_ORIGIN, { lat: input.latitude, lng: input.longitude })
    : null;
  if (km != null && km <= MAX_GPS_KM) base = FEE_TIERS.find(t => km <= t.maxKm)?.fee ?? FEE_BEYOND;
  else base = input.district && NEAR_ZONES.includes(input.district) ? FEE_ZONE_NEAR : FEE_ZONE_FAR;
  return base + (input.express ? FEE_EXPRESS_EXTRA : 0);
}
