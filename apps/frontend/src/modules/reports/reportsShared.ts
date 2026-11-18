// Tipos, rangos de fechas, etiquetas y colores de los Reportes.
/* ─── Types ─────────────────────────────────────────────────────────────── */
export interface SalesReport {
  summary: { total: number; count: number; average: number; discounts: number; taxes: number };
  byCategory: Array<{ category: string; total: number; quantity: number }>;
  byPaymentMethod: Array<{ method: string; total: number; count: number }>;
  chart: Array<{ period: string; total: number; count: number }>;
}

export interface InventoryReport {
  totalValue: { cost: number; sale: number };
  byCategory: Array<{ category: string; products: number; cost_value: number; sale_value: number }>;
  lowStock: Array<{ id: string; name: string; currentStock: number; minStock: number; category: { name: string } }>;
  noMovement: Array<{ id: string; name: string; current_stock: number; last_movement: string | null }>;
}

export interface TopProduct {
  product_id: string; name: string; barcode: string | null;
  category: string; quantity: number; revenue: number; transactions: number;
}

export interface MarginReport {
  summary: { revenue: number; cost: number; margin: number; marginPercent: number; itemsWithoutCost: number; lineRevenue?: number; saleDiscounts?: number };
  chart: Array<{ period: string; revenue: number; cost: number; margin: number }>;
  byProduct: Array<{ productId: string; name: string; quantity: number; revenue: number; cost: number; margin: number; marginPercent: number }>;
}

export interface NetProfitReport {
  summary: { revenue: number; cost: number; grossMargin: number; expenses: number; netProfit: number; netProfitPercent: number };
  expensesByCategory: Array<{ category: string; total: number; count: number }>;
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PERSONNEL: 'Personal', BAGS: 'Bolsas', TRANSPORT: 'Transporte', SYSTEM: 'Sistema',
  WATER: 'Agua', ELECTRICITY: 'Electricidad', RENT: 'Alquiler', TAXES: 'Impuestos (cuota SUNAT)', OTHER: 'Otro',
};

/* ─── Date preset helpers ────────────────────────────────────────────────── */
export const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

// Obtener fecha en zona horaria de Lima (UTC-5) en formato YYYY-MM-DD
export const limaDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });
export function limaDateStr(date: Date): string {
  return limaDateFmt.format(date); // devuelve 'YYYY-MM-DD' en hora Lima
}

export function getDateRange(days: number) {
  const now = new Date();
  const to = limaDateStr(now);
  if (days === 0) {
    // "Hoy" en Lima
    return { from: to, to };
  }
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return { from: limaDateStr(fromDate), to };
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito',
  TRANSFER: 'Transferencia', YAPE: 'Yape', PLIN: 'Plin', CREDIT: 'Crédito', OTHER: 'Otro',
};

// Paleta sobria: verde de la marca primero, luego tonos apagados.
export const COLORS = ['#23802f', '#3d6fa3', '#c08a2b', '#7a5c99', '#2f8f8a', '#a8553d', '#6b7280', '#7d9a3a'];

