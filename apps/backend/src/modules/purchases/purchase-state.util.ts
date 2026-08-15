import type { Prisma } from '@prisma/client';

// Estado contable de 8 valores pedido por el usuario, calculado a partir de
// los campos que ya existen (status, paymentStatus derivado de paidAmount,
// voidedAt, hasDiscrepancy, dueDate) — no reemplaza esos campos, solo los
// resume en una sola etiqueta para mostrar en pantalla sin tocar la lógica
// de recepción/anulación/pagos que ya depende de ellos.
export type AccountingState =
  | 'ANULADO'
  | 'OBSERVADO'
  | 'REGISTRADO'
  | 'PAGADO'
  | 'VENCIDO'
  | 'PARCIAL'
  | 'PENDIENTE_PAGO';

const RECEIVED_STATUSES = new Set(['RECEIVED', 'PARTIALLY_RECEIVED']);

export function getAccountingState(order: {
  voidedAt: Date | null;
  hasDiscrepancy: boolean;
  status: string;
  paidAmount: number | string | Prisma.Decimal;
  totalAmount: number | string | Prisma.Decimal;
  dueDate: Date | null;
}): AccountingState {
  if (order.voidedAt) return 'ANULADO';
  if (order.hasDiscrepancy) return 'OBSERVADO';
  if (!RECEIVED_STATUSES.has(order.status)) return 'REGISTRADO';

  const paid = Number(order.paidAmount);
  const total = Number(order.totalAmount);
  if (paid >= total - 0.009) return 'PAGADO';

  if (order.dueDate && order.dueDate.getTime() < Date.now()) return 'VENCIDO';
  if (paid > 0) return 'PARCIAL';
  return 'PENDIENTE_PAGO';
}

export type AgingBucket = '0-15' | '16-30' | '31-60' | '60+';

export function getAgingBucket(since: Date, now: Date = new Date()): AgingBucket {
  const days = Math.floor((now.getTime() - since.getTime()) / 86400000);
  if (days <= 15) return '0-15';
  if (days <= 30) return '16-30';
  if (days <= 60) return '31-60';
  return '60+';
}

export function emptyAgingSummary(): Record<AgingBucket, number> {
  return { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 };
}
