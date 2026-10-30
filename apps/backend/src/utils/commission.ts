// Comisión por pago con tarjeta (POS Izipay): se cobra al cliente encima de
// la venta. Misma fórmula en el frontend (apps/frontend/src/lib/commission.ts)
// para que lo que muestra la pantalla de cobro calce al céntimo con lo que se
// guarda.

export const CARD_METHODS = ['DEBIT_CARD', 'CREDIT_CARD'];

export function isCardMethod(method: string): boolean {
  return CARD_METHODS.includes(method);
}

// Redondeo al céntimo más cercano (medio céntimo sube). El paso intermedio a
// 6 decimales evita que el error de punto flotante baje un caso exacto —
// 25 × 4.06 da 101.49999999999999 en vez de 101.5.
export function cardCommission(amount: number, percent: number): number {
  if (!(amount > 0) || !(percent > 0)) return 0;
  const cents = Math.round(amount * percent * 1e6) / 1e6;
  return Math.round(cents) / 100;
}
