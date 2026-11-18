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
export function purchaseTaxFactor(subtotal: number, taxAmount: number, igvIsCost: boolean, igvIncluded = false): number {
  if (!(subtotal > 0) || !(taxAmount > 0)) return 1;
  // Costos que ya traen el IGV: si es costo, se quedan tal cual; si el negocio
  // lo recupera, se le quita lo que va dentro.
  if (igvIncluded) return igvIsCost ? 1 : (subtotal - taxAmount) / subtotal;
  if (!igvIsCost) return 1;
  return 1 + taxAmount / subtotal;
}

export const IGV_RATE = 0.18;

/**
 * Totales de una compra a partir de la suma de sus líneas.
 * - igvIncluded: las líneas ya traen el IGV; taxAmount = lo que va dentro.
 * - legacyTaxRatio (compras antiguas): IGV sumado encima de las líneas.
 * La percepción se suma a lo que se le paga al proveedor, no al costo.
 */
export function purchaseTotals(linesTotal: number, opts: { igvIncluded?: boolean; legacyTaxRatio?: number; perception?: number }) {
  const subtotal = round2(linesTotal);
  const perception = round2(Math.max(0, opts.perception ?? 0));
  if (opts.igvIncluded) {
    const taxAmount = round2(subtotal - subtotal / (1 + IGV_RATE));
    return { subtotal, taxAmount, totalAmount: round2(subtotal + perception) };
  }
  const taxAmount = round2(subtotal * (opts.legacyTaxRatio ?? 0));
  return { subtotal, taxAmount, totalAmount: round2(subtotal + taxAmount + perception) };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
