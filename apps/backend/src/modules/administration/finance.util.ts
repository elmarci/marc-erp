// Reglas puras del módulo Administración (sin base de datos) — probadas en
// finance.util.test.ts.

export type LimitStatus = 'OK' | 'WARNING' | 'OVER';

/** Estado de un monto frente a un tope: OVER si lo pasa, WARNING desde alertPercent %. */
export function limitStatus(amount: number, limit: number, alertPercent = 80): LimitStatus {
  if (!(limit > 0)) return 'OK';
  if (amount > limit) return 'OVER';
  return amount >= (limit * alertPercent) / 100 ? 'WARNING' : 'OK';
}

export function percentOf(amount: number, limit: number): number {
  return limit > 0 ? Math.round((amount / limit) * 1000) / 10 : 0;
}

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Componentes de fecha en hora de Lima (UTC-5 fijo). */
function limaParts(d: Date) {
  const l = new Date(d.getTime() - LIMA_OFFSET_MS);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate() };
}
const limaStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) + LIMA_OFFSET_MS);

/**
 * Período anterior comparable. Si el rango empieza el día 1 y no sale de ese
 * mes, se compara con los mismos días del mes anterior (del 1 al 16 contra
 * del 1 al 16); un mes completo se compara con el mes anterior completo.
 * Cualquier otro rango, con los mismos N días inmediatamente anteriores.
 */
export function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const a = limaParts(from);
  const b = limaParts(to);
  if (a.y === b.y && a.m === b.m && a.d === 1) {
    const lastDay = new Date(Date.UTC(b.y, b.m + 1, 0)).getUTCDate();
    const prevLastDay = new Date(Date.UTC(a.y, a.m, 0)).getUTCDate();
    const endDay = b.d === lastDay ? prevLastDay : Math.min(b.d, prevLastDay);
    return { from: limaStart(a.y, a.m - 1, 1), to: new Date(limaStart(a.y, a.m - 1, endDay + 1).getTime() - 1) };
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  return { from: new Date(from.getTime() - days * DAY_MS), to: new Date(from.getTime() - 1) };
}

/** Variación porcentual contra el período anterior; null si no hay base. */
export function changePercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export interface IncomeFigures {
  grossSales: number;
  returns: number;
  cogs: number;
  expenses: number;
  inventoryLosses: number;
  deliveryIncome: number;
  riderPayments: number;
}

/** Arma los subtotales del estado de resultados a partir de sus componentes. */
export function buildIncomeTotals(f: IncomeFigures) {
  const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const netSales = r(f.grossSales - f.returns);
  const grossProfit = r(netSales - f.cogs);
  const deliveryNet = r(f.deliveryIncome - f.riderPayments);
  const netProfit = r(grossProfit - f.expenses - f.inventoryLosses + deliveryNet);
  return {
    netSales,
    grossProfit,
    grossMarginPercent: netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0,
    deliveryNet,
    netProfit,
    netMarginPercent: netSales > 0 ? Math.round((netProfit / netSales) * 1000) / 10 : 0,
  };
}
