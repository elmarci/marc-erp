// Comprobantes de proveedor: RUC, serie y número.

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** RUC peruano: 11 dígitos, prefijo válido y dígito verificador (módulo 11). */
export function isValidRuc(value: string | null | undefined): boolean {
  if (!value || !/^\d{11}$/.test(value)) return false;
  if (!['10', '15', '16', '17', '20'].includes(value.slice(0, 2))) return false;
  const sum = RUC_WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(value[10]);
}

/** Serie de 4 caracteres (F001, B002, E001, FE01…), en mayúsculas. */
export function normalizeSeries(value: string | null | undefined): string | null {
  const s = (value ?? '').trim().toUpperCase();
  return s || null;
}

/** Número sin ceros a la izquierda ("000123" → "123"). */
export function normalizeDocNumber(value: string | null | undefined): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(Number(s));
  return s.toUpperCase();
}

/** Texto para mostrar: "F001-000123" (número con 6 dígitos como mínimo). */
export function formatDocument(series: string | null | undefined, number: string | null | undefined): string | null {
  const s = normalizeSeries(series);
  const n = normalizeDocNumber(number);
  if (!s && !n) return null;
  const padded = n && /^\d+$/.test(n) ? n.padStart(6, '0') : n;
  return [s, padded].filter(Boolean).join('-');
}

/** Separa un texto libre antiguo ("F001-123", "b002 45") en serie y número. */
export function parseLegacyDocument(text: string | null | undefined): { series: string; number: string } | null {
  const m = (text ?? '').trim().match(/^([A-Za-z][A-Za-z0-9]{3})\s*[-\s]\s*0*(\d{1,8})$/);
  if (!m) return null;
  return { series: m[1].toUpperCase(), number: String(Number(m[2])) };
}

/** "2026-10" para una fecha, en hora de Lima. */
export function limaPeriod(date: Date): string {
  const lima = new Date(date.getTime() - 5 * 3600 * 1000);
  return `${lima.getUTCFullYear()}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fecha con la que un gasto entra al estado de resultados. Si se pagó en el
 * mismo mes al que corresponde, es la fecha de pago; si corresponde a otro
 * mes (la luz de octubre pagada el 5 de noviembre), es el día 1 de ese mes
 * al mediodía de Lima.
 */
export function accrualDateFor(expenseDate: Date, period: string | null | undefined): Date {
  if (!period || !/^\d{4}-\d{2}$/.test(period) || period === limaPeriod(expenseDate)) return expenseDate;
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 17, 0, 0));
}
