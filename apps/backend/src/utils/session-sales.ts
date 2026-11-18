// Cuánto entró a la caja por cada medio de pago en una sesión. Lo usan el
// resumen de la sesión y el cierre, para que el "esperado" sea el mismo en
// los dos lados. Las ventas anuladas no cuentan. Las devoluciones (totales o
// parciales) restan lo reembolsado en el medio con que se devolvió.
type Num = number | { toString(): string };

export interface SessionSaleLike {
  status: string;
  payments: Array<{ method: string; amount: Num }>;
  returns?: Array<{ totalAmount: Num; refundMethod: string }>;
}

export function netSalesByMethod(sales: SessionSaleLike[]) {
  const byMethod: Record<string, number> = {};
  const refundsByMethod: Record<string, number> = {};
  for (const sale of sales) {
    if (sale.status === 'CANCELLED') continue;
    for (const p of sale.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
    for (const r of sale.returns ?? []) {
      refundsByMethod[r.refundMethod] = (refundsByMethod[r.refundMethod] ?? 0) + Number(r.totalAmount);
      byMethod[r.refundMethod] = (byMethod[r.refundMethod] ?? 0) - Number(r.totalAmount);
    }
  }
  for (const k of Object.keys(byMethod)) byMethod[k] = Math.round(byMethod[k] * 100) / 100;
  return { byMethod, refundsByMethod };
}
