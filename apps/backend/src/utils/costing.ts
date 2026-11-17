// Cálculos de costo que mueven dinero — funciones puras para poder probarlas
// (ver costing.test.ts). Cualquier cambio aquí cambia el margen que ve el dueño.

/**
 * Costo promedio ponderado después de una entrada de mercadería.
 * Si el stock anterior era negativo o cero, el promedio pasa a ser el costo
 * de lo que entra (no se promedia contra unidades que no existen).
 */
export function weightedAverageCost(stockBefore: number, avgCostBefore: number, quantityIn: number, unitCostIn: number): number {
  const stockAfter = stockBefore + quantityIn;
  if (stockAfter <= 0) return avgCostBefore;
  if (stockBefore <= 0) return unitCostIn;
  return (stockBefore * avgCostBefore + quantityIn * unitCostIn) / stockAfter;
}

/**
 * Factor por el que se multiplica el costo unitario de una compra para
 * llegar al costo real del inventario. En el NRUS (y en cualquier negocio que
 * no usa crédito fiscal) el IGV pagado al proveedor no se recupera: es parte
 * del costo. Si el negocio sí recupera IGV (igvIsCost = false) el factor es 1.
 */
export function purchaseTaxFactor(subtotal: number, taxAmount: number, igvIsCost: boolean): number {
  if (!igvIsCost || !(subtotal > 0) || !(taxAmount > 0)) return 1;
  return 1 + taxAmount / subtotal;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
