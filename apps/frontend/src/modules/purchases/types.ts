import { type SupplierReturnRow } from './SupplierDocuments';
import { type Tone } from '@/components/erp';

export interface Supplier {
  id: string; businessName: string; taxId: string | null;
  contactName: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; paymentTermDays: number;
  isActive: boolean; _count?: { purchaseOrders: number };
}

export type AccountingState = 'ANULADO' | 'OBSERVADO' | 'REGISTRADO' | 'PAGADO' | 'VENCIDO' | 'PARCIAL' | 'PENDIENTE_PAGO';

export interface PurchaseOrder {
  id: string; orderNumber: string; status: string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'CREDIT';
  paidAmount: number;
  payerId: string | null; payerAmount: number;
  dueDate: string | null; hasDiscrepancy: boolean; discrepancyNotes: string | null;
  accountingState: AccountingState;
  createdAt: string; expectedDate: string | null; receivedDate?: string | null;
  subtotal: number; taxAmount: number; totalAmount: number;
  // Fase 5: costos con IGV dentro (taxAmount = IGV que va dentro) y percepción aparte.
  igvIncluded?: boolean; perceptionAmount?: number;
  supplier: { businessName: string };
  user: { firstName: string; lastName: string };
  _count: { items: number };
}

// Tercero que puso el dinero de su bolsillo para pagar una compra — distinto
// del proveedor (quien vendió). Ver comentario del modelo Payer en el backend.
export interface Payer {
  id: string; name: string; phone: string | null; notes: string | null;
  creditLimit: number; isActive: boolean;
  totalOwed?: number; orderCount?: number; overLimit?: boolean;
  aging?: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
}

export interface OrderDetail extends PurchaseOrder {
  supplierInvoice: string | null; notes: string | null;
  docType: string | null; docSeries: string | null; docNumber: string | null; docIssueDate: string | null;
  creditedAmount: number;
  supplierReturns: SupplierReturnRow[];
  supplier: Supplier;
  payer: { id: string; name: string; phone: string | null } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  voidedAt: string | null; voidReason: string | null;
  voidedBy: { firstName: string; lastName: string } | null;
  items: Array<{
    id: string; orderedQty: number; receivedQty: number;
    unitCost: number; subtotal: number; isBonus: boolean;
    product: { id: string; name: string; barcode: string | null; currentStock: number; trackExpiry: boolean };
  }>;
  receipts: Array<{ id: string; receivedAt: string; notes: string | null }>;
  payments: Array<{
    id: string; amount: number; method: string; paidAt: string; reference: string | null; notes: string | null;
    reversedAt: string | null; reversalReason: string | null; reversedBy: { firstName: string; lastName: string } | null;
  }>;
}

export interface PayableOrder extends PurchaseOrder {
  outstanding: number;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = { PAID: 'Pagada', PARTIAL: 'Pago parcial', CREDIT: 'Crédito' };
export const PAYMENT_STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  PAID: 'success', PARTIAL: 'default', CREDIT: 'destructive',
};
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TRANSFER: 'Transferencia', DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito', OTHER: 'Otro',
};

export interface Product {
  id: string; name: string; barcode: string | null; costPrice: number;
  currentStock: number; category: { name: string };
  isBulk?: boolean; bulkUnit?: string | null; trackExpiry?: boolean;
}

export interface LowStockProduct {
  id: string; name: string; barcode: string | null;
  current_stock: number; min_stock: number; category: string;
  cost_price: number; supplier_id: string | null; supplier_name: string | null;
  supplier_source: 'preferred' | 'cheapest' | 'legacy' | null; alternatives_count: number;
  suggested_qty: number;
}

export interface SupplierCatalogItem {
  supplierId: string; productId: string; price: number;
  supplierSku: string | null; isPreferred: boolean; lastPurchaseAt: string | null;
  product: { id: string; name: string; barcode: string | null; currentStock: number; minStock: number; costPrice: number };
}

/* ─── Status helpers ────────────────────────────────────────────────────── */
// Flujo simple: Pedida → Recibida (en parte o completa), o Anulada. Las
// órdenes antiguas "por aprobar" o "aprobadas" ya se muestran como Pedida.
export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PENDING_APPROVAL: 'Pedida',
  APPROVED: 'Pedida', SENT: 'Pedida',
  PARTIALLY_RECEIVED: 'Recibida en parte', RECEIVED: 'Recibida', CANCELLED: 'Anulada',
};
export const STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  DRAFT: 'secondary', PENDING_APPROVAL: 'default', APPROVED: 'default',
  SENT: 'default', PARTIALLY_RECEIVED: 'default', RECEIVED: 'success', CANCELLED: 'destructive',
};

// Estado contable de 8 valores (calculado en el backend a partir de status +
// paymentStatus + vencimiento + observado) — ver purchase-state.util.ts.
export const ACCOUNTING_STATE_LABELS: Record<AccountingState, string> = {
  ANULADO: 'Anulado', OBSERVADO: 'Observado', REGISTRADO: 'Registrado',
  PAGADO: 'Pagado', VENCIDO: 'Vencido', PARCIAL: 'Pago parcial', PENDIENTE_PAGO: 'Pendiente de pago',
};
export const ACCOUNTING_STATE_VARIANT: Record<AccountingState, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  ANULADO: 'secondary', OBSERVADO: 'destructive', REGISTRADO: 'outline',
  PAGADO: 'success', VENCIDO: 'destructive', PARCIAL: 'default', PENDIENTE_PAGO: 'default',
};
// Tonos del punto de color de cada estado (badges sobrios).
export const PAYMENT_STATUS_TONE: Record<string, Tone> = { PAID: 'ok', PARTIAL: 'warn', CREDIT: 'warn' };
export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'muted', PENDING_APPROVAL: 'neutral', APPROVED: 'neutral', SENT: 'neutral',
  PARTIALLY_RECEIVED: 'warn', RECEIVED: 'ok', CANCELLED: 'muted',
};
export const ACCOUNTING_STATE_TONE: Record<AccountingState, Tone> = {
  ANULADO: 'muted', OBSERVADO: 'bad', REGISTRADO: 'neutral',
  PAGADO: 'ok', VENCIDO: 'bad', PARCIAL: 'warn', PENDIENTE_PAGO: 'warn',
};
export const AGING_BUCKET_LABELS: Record<string, string> = { '0-15': '0-15 días', '16-30': '16-30 días', '31-60': '31-60 días', '60+': '60+ días' };

/* ─── Supplier Form Modal ────────────────────────────────────────────────── */
