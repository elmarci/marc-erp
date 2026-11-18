// Tipos y textos compartidos por las pestañas de Inventario.
import type { Tone } from '@/components/erp';
import type { ShelfBatch } from './StockHealth';

export interface DashboardData {
  kpis: { totalProducts: number; outOfStock: number; lowStock: number; costValue: number; saleValue: number; margin: number };
  byCategory: Array<{ category: string; products: number; totalStock: number; costValue: number; saleValue: number }>;
  recentMovements: Array<{ id: string; type: string; quantity: number; quantityBefore: number; quantityAfter: number; createdAt: string; product: { name: string } }>;
}
export interface StockProduct {
  id: string; name: string; barcode: string | null; sku: string | null;
  current_stock: number; min_stock: number; max_stock: number | null;
  cost_price: number; sale_price: number; category: string; category_id: string;
  last_movement: string | null; stockStatus: 'ok' | 'low' | 'out'; stockValue: number;
}
export interface Movement {
  id: string; type: string; quantity: number; quantityBefore: number; quantityAfter: number;
  unitCost: number | null; referenceType: string | null; notes: string | null; createdAt: string;
  product: { id: string; name: string; barcode: string | null };
}
export interface Adjustment {
  id: string; reason: string; reasonCode: string | null; notes: string | null; createdAt: string;
  user: { firstName: string; lastName: string };
  _count: { items: number };
  items: Array<{ productId: string; productName: string; systemQuantity: number; physicalQuantity: number; difference: number }>;
}
export interface Category { id: string; name: string }
export interface ExpiringBatch {
  id: string; batchNumber: string | null; quantity: number; expiryDate: string | null;
  product: { id: string; name: string; currentStock: number; unitOfMeasure: string; category: { name: string } };
}
export interface UncoveredRow {
  productId: string; name: string; category: string; unit: string;
  stock: number; covered: number; uncovered: number;
}
export interface ExpiryControl {
  batches: ShelfBatch[];
  uncovered: UncoveredRow[];
  summary: { expired: number; within7: number; within30: number; uncovered: number };
}
export interface AlertsSummary {
  marginLow: number; expiring: number; expired: number; uncovered: number; lowStock: number; total: number;
}
export interface SupplierPrice {
  supplierId: string; supplierName: string; supplierPhone: string | null;
  price: number; supplierSku: string | null; isPreferred: boolean; isCheapest: boolean; lastPurchaseAt: string | null;
}

export const MOV_LABELS: Record<string, string> = {
  PURCHASE_IN: 'Compra', PURCHASE_VOID: 'Anulación compra', SALE_OUT: 'Venta', ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste −', RETURN_IN: 'Devolución E', RETURN_OUT: 'Devolución S',
  INITIAL_STOCK: 'Stock inicial', LOSS: 'Pérdida', EXPIRY: 'Vencimiento',
};
export const isEntry = (t: string) => ['PURCHASE_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'INITIAL_STOCK', 'TRANSFER_IN'].includes(t);

export const STATUS_LABEL: Record<string, string> = { ok: 'Normal', low: 'Stock bajo', out: 'Sin stock' };
export const STATUS_TONE: Record<string, Tone> = { ok: 'ok', low: 'warn', out: 'bad' };

/** Tono del aviso de vencimiento según los días que faltan. */
export const daysTone = (d: number): Tone => (d <= 3 ? 'bad' : d <= 7 ? 'warn' : 'neutral');
export const daysText = (d: number, long = false) =>
  d < 0 ? `Venció hace ${Math.abs(d)}d` : d === 0 ? 'Vence hoy' : long ? `${d} días` : `En ${d}d`;

// Días calendario hasta el vencimiento (negativo = ya venció). La fecha de
// vencimiento es un día de calendario guardado a medianoche UTC; "hoy" es el
// día en Lima.
export const daysUntil = (dateStr: string) => {
  const t = new Date(dateStr);
  const target = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const l = new Date(Date.now() - 5 * 3600 * 1000);
  const today = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
};

/** Cantidad con signo para movimientos: verde oscuro no; solo las salidas en rojo. */
export const signedQty = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q)}`;

export const INV_KEYS = ['inv-stock', 'inv-dashboard', 'inv-movements', 'inv-adjustments', 'inv-expiry', 'inv-alerts-summary'];
