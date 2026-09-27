// Tarifa real que se gana el repartidor por el viaje — no es lo que el
// cliente paga por el pedido (`monto`), es lo que la empresa le paga a él.
// Regla pedida por el dueño: un mínimo garantizado para viajes cortos, y
// que suba por km cuando el viaje es largo — nunca menos que el mínimo.
// Estos valores son referenciales hasta que el dueño defina los reales.
export const TARIFA_MINIMA_SOLES = 5.0
export const TARIFA_POR_KM_SOLES = 2.0

export function calcularTarifa(distanciaKm: number): number {
  return Math.max(TARIFA_MINIMA_SOLES, distanciaKm * TARIFA_POR_KM_SOLES)
}
