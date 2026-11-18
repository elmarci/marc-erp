// Tipos y textos compartidos de Clientes.
export interface StoreAccount {
  id: string; email: string | null; authProvider: string; createdAt: string;
}

export interface Customer {
  id: string; firstName: string; lastName: string | null;
  taxId: string | null; taxIdType: string | null;
  businessName: string | null; email: string | null; phone: string | null;
  address: string | null; type: string;
  creditLimit: number; currentBalance: number; loyaltyPoints: number; isActive: boolean;
  notes: string | null; createdAt: string;
  storeAccounts?: StoreAccount[];
}

export interface CustomerSale {
  id: string; saleNumber: string; totalAmount: number; paidAmount: number; isCredit: boolean; status: string;
  createdAt: string; payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

export interface UnpaidSale {
  id: string; saleNumber: string; createdAt: string; totalAmount: number; paidAmount: number; outstanding: number;
}

export const AUTH_PROVIDER_LABELS: Record<string, string> = { PASSWORD: 'Correo/contraseña', GOOGLE: 'Google' };
export const TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Regular', WHOLESALE: 'Mayorista', VIP: 'VIP', CREDIT: 'Crédito',
};
export const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada', CANCELLED: 'Anulada', RETURNED: 'Devuelta',
};
export const DEBT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin',
  TRANSFER: 'Transferencia', DEBIT_CARD: 'T. Débito',
  CREDIT_CARD: 'T. Crédito', OTHER: 'Otro',
};
export const PAYMENT_METHODS_OPTS = [
  { value: 'CASH', label: 'Efectivo' }, { value: 'YAPE', label: 'Yape' },
  { value: 'PLIN', label: 'Plin' }, { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'DEBIT_CARD', label: 'Tarjeta débito' }, { value: 'CREDIT_CARD', label: 'Tarjeta crédito' },
  { value: 'OTHER', label: 'Otro' },
];

export const fullName = (c: { firstName: string; lastName: string | null }) => `${c.firstName} ${c.lastName ?? ''}`.trim();
export const hasStoreAccount = (c: Customer) => !!c.storeAccounts && c.storeAccounts.length > 0;
