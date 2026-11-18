// Tipos y textos compartidos por las pantallas de Caja.
export interface CashRegister { id: string; name: string }

export interface CashSession {
  id: string; status: 'OPEN' | 'CLOSED';
  openedAt: string; closedAt: string | null;
  openingAmount: number; closingAmount: number | null;
  expectedAmount: number | null; difference: number | null;
  cashRegister: { name: string };
  user: { firstName: string; lastName: string };
  _count: { sales: number; movements: number };
}

export interface DigitalReconciliation {
  method: string; expectedAmount: number; countedAmount: number; difference: number;
}

export interface SessionSummary {
  session: {
    id: string; status: string; openedAt: string; closedAt: string | null;
    openingAmount: number; closingAmount: number | null;
    expectedAmount: number | null; difference: number | null;
    cashRegister: { name: string }; cashier: { firstName: string; lastName: string };
  };
  reconciliations?: DigitalReconciliation[];
  summary: {
    totalTransactions: number; totalSales: number;
    salesByMethod: Record<string, number>;
    /** Lo devuelto por medio de pago; salesByMethod ya viene neto. */
    refundsByMethod?: Record<string, number>;
    commissionsByMethod?: Record<string, number>; cardCommissions?: number;
    totalWithdrawals: number; totalDeposits: number; netCash: number;
    debtPayments: number; otherDeposits: number;
    purchasePayments: number; expensePayments: number; otherWithdrawals: number;
  };
}

export interface PayableOrderPick {
  id: string; orderNumber: string; outstanding: number;
  supplier: { businessName: string };
}

export interface Movement {
  id: string; type: 'WITHDRAWAL' | 'DEPOSIT';
  amount: number; reason: string; createdAt: string;
}

export interface SessionSale {
  id: string; saleNumber: string; totalAmount: number; status: string;
  createdAt: string; payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

export interface TreasuryBalances { cash: number; yape: number; plin: number; total: number }
export type TreasuryAccount = 'CASH' | 'YAPE' | 'PLIN';

export interface TreasuryMovementRow {
  id: string; type: 'DEPOSIT' | 'WITHDRAWAL'; account: string; amount: number;
  balanceAfter: number; description: string; createdAt: string;
  user: { firstName: string; lastName: string };
}

export interface TransferRow {
  id: string; fromAccount: string; toAccount: string; amount: number; notes: string | null;
  createdAt: string; user: { firstName: string; lastName: string };
}

export interface RecurringTemplate {
  id: string; category: string; description: string; amount: number; payeeName: string | null;
  categoryDef?: { id: string; name: string } | null;
  dayOfMonth: number; isActive: boolean; lastGeneratedPeriod: string | null;
}

export interface TreasuryReconciliationRow {
  id: string; account: string; date: string;
  expectedAmount: number; countedAmount: number; difference: number; notes: string | null;
  createdAt: string; user: { firstName: string; lastName: string };
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PERSONNEL: 'Personal', BAGS: 'Bolsas', TRANSPORT: 'Transporte', SYSTEM: 'Sistema',
  WATER: 'Agua', ELECTRICITY: 'Electricidad', RENT: 'Alquiler', TAXES: 'Impuestos (cuota SUNAT)', OTHER: 'Otro',
};

export const TREASURY_ACCOUNT_LABELS: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin' };

export const balanceOf = (b: Partial<TreasuryBalances> | undefined, acc: TreasuryAccount) =>
  (acc === 'CASH' ? b?.cash : acc === 'YAPE' ? b?.yape : b?.plin) ?? 0;

/** Diferencia casi cero (centavos de redondeo) cuenta como cuadre. */
export const isZero = (n: number) => Math.abs(n) < 0.005;
