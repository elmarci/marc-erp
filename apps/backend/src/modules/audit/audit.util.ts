// Qué se audita y cómo se compara — sin base de datos, probado en audit.util.test.ts.

// Campos que cambian solos con la operación diaria (stock, saldos, contadores)
// y ya tienen su propio kardex: registrarlos aquí solo haría ruido.
const ALWAYS_IGNORED = ['updatedAt', 'createdAt'];

export const AUDITED_MODELS: Record<string, { ignore: string[]; label: string[] }> = {
  Product: { ignore: ['currentStock', 'reservedStock', 'costPrice', 'lastPurchaseCost', 'lastPurchaseAt', 'sizeGroup', 'sizeValue'], label: ['name'] },
  Category: { ignore: [], label: ['name'] },
  Brand: { ignore: [], label: ['name'] },
  Supplier: { ignore: [], label: ['businessName'] },
  Customer: { ignore: ['currentBalance', 'loyaltyPoints'], label: ['firstName', 'lastName'] },
  User: { ignore: ['failedLoginAttempts', 'lastLoginAt', 'lastLoginIp', 'lockedAt'], label: ['username'] },
  Setting: { ignore: [], label: ['label'] },
  Promotion: { ignore: [], label: ['name'] },
  Expense: { ignore: [], label: ['description'] },
  ExpenseCategoryDef: { ignore: [], label: ['name'] },
  SupplierReturn: { ignore: [], label: ['returnNumber'] },
  PurchaseOrder: { ignore: ['paidAmount', 'paymentStatus', 'payerAmount', 'payerReimbursedAmount', 'subtotal', 'taxAmount', 'totalAmount', 'creditedAmount', 'receivedDate', 'status'], label: ['orderNumber'] },
  RecurringExpenseTemplate: { ignore: ['lastGeneratedPeriod'], label: ['description'] },
  CashRegister: { ignore: [], label: ['name'] },
  DocumentSeries: { ignore: ['currentNumber'], label: ['series'] },
  TaxRate: { ignore: [], label: ['name'] },
  Payer: { ignore: [], label: ['name'] },
  Batch: { ignore: ['quantity'], label: ['batchNumber'] },
  Employee: { ignore: [], label: ['firstName', 'lastName'] },
  EmployeeAdvance: { ignore: ['paymentId'], label: ['amount'] },
  PayrollPayment: { ignore: [], label: ['number'] },
  Rider: { ignore: ['lastLat', 'lastLng', 'lastLocationAt', 'enServicio', 'zonasActivas'], label: ['nombre'] },
};

const SECRET_FIELDS = new Set(['passwordHash', 'pin', 'pinHash', 'walletPinHash', 'refreshToken']);

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // Decimal de Prisma (y cualquier objeto con toJSON) → su forma JSON.
    const json = JSON.parse(JSON.stringify(value));
    return json;
  }
  return value;
}

/** Copia plana de un registro lista para guardar: sin secretos ni relaciones anidadas. */
export function sanitizeRecord(record: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!record) return out;
  for (const [key, value] of Object.entries(record)) {
    if (ALWAYS_IGNORED.includes(key)) continue;
    if (SECRET_FIELDS.has(key)) { out[key] = value == null ? null : '(oculto)'; continue; }
    const n = normalize(value);
    // Relaciones incluidas (objetos/arreglos de objetos) no son columnas de esta tabla.
    if (n !== null && typeof n === 'object' && !Array.isArray(n)) continue;
    if (Array.isArray(n) && n.some((v) => v !== null && typeof v === 'object')) continue;
    out[key] = n;
  }
  return out;
}

/** Campos que cambiaron entre antes y después, ignorando los que no interesan. */
export function diffRecords(
  before: Record<string, unknown>, after: Record<string, unknown>, ignore: string[] = [],
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } | null {
  const a = sanitizeRecord(before);
  const b = sanitizeRecord(after);
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignore.includes(key)) continue;
    const va = a[key] ?? null;
    const vb = b[key] ?? null;
    const same = SECRET_FIELDS.has(key)
      ? normalize(before[key]) === normalize(after[key])
      : JSON.stringify(va) === JSON.stringify(vb);
    if (same) continue;
    oldValues[key] = va;
    newValues[key] = SECRET_FIELDS.has(key) ? '(cambiado)' : vb;
  }
  return Object.keys(newValues).length > 0 ? { oldValues, newValues } : null;
}

/** ¿Este update solo toca campos ignorados? Entonces ni siquiera se lee el "antes". */
export function onlyIgnoredFields(data: unknown, ignore: string[]): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data as object);
  if (keys.length === 0) return true;
  return keys.every((k) => ignore.includes(k) || ALWAYS_IGNORED.includes(k));
}

export function recordLabel(model: string, record: Record<string, unknown> | null | undefined): string | null {
  const cfg = AUDITED_MODELS[model];
  if (!cfg || !record) return null;
  const parts = cfg.label.map((f) => record[f]).filter((v) => v != null && v !== '');
  return parts.length > 0 ? parts.join(' ').slice(0, 120) : null;
}
