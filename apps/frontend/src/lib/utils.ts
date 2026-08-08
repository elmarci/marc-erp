import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number | string | null | undefined,
  symbol = 'S/',
): string {
  if (amount === null || amount === undefined) return `${symbol} 0.00`;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${symbol} 0.00`;
  return `${symbol} ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// Para el costo de un producto: a diferencia del precio de venta (siempre a
// 2 decimales, como corresponde a soles/céntimos reales), el costo interno
// necesita hasta 4 decimales — un costo por kilo calculado desde una compra
// a granel (total del lote / kg) rara vez cae en un número redondo. Muestra
// el mínimo necesario: nunca menos de 2 decimales, nunca más de 4.
export function formatCost(
  amount: number | string | null | undefined,
  symbol = 'S/',
): string {
  if (amount === null || amount === undefined) return `${symbol} 0.00`;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${symbol} 0.00`;
  const [intPart, decPart] = num.toFixed(4).split('.');
  let end = decPart.length;
  while (end > 2 && decPart[end - 1] === '0') end--;
  return `${symbol} ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decPart.slice(0, end)}`;
}

// Fijado a hora de Lima explícitamente — si no, estas fechas se muestran en
// la zona horaria del navegador/OS del cajero (o del servidor si se llaman
// del lado backend), que no siempre está configurada en Perú.
const limaDateFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
});
const limaDateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return limaDateFormatter.format(new Date(date));
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return limaDateTimeFormatter.format(new Date(date)).replace(', ', ' ');
}

const limaISODateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });

// Fecha "YYYY-MM-DD" de HOY en Lima — a diferencia de `new Date().toISOString().split('T')[0]`
// (que es UTC y se adelanta un día entre ~19:00 y medianoche hora de Lima),
// esto sirve para prellenar inputs de fecha ("hoy") sin ese desfase.
export function todayLimaDateString(): string {
  return limaISODateFormatter.format(new Date());
}

export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return formatDistanceToNow(new Date(date), { locale: es, addSuffix: true });
}

export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return new Intl.NumberFormat('es-PE').format(n);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function generateBarcode(): string {
  return Math.random().toString().slice(2, 15).padEnd(13, '0');
}

// Un valor "escaneado" (por lector físico o tecleado rápido + Enter) es o
// bien un código de fábrica numérico largo, o el código interno PROxxx que
// ahora también se imprime como código de barras.
export function looksLikeScannedCode(value: string): boolean {
  return /^(\d{8,}|PRO\d+)$/i.test(value.trim());
}

export function getInitials(firstName: string, lastName?: string | null): string {
  const f = firstName.charAt(0).toUpperCase();
  const l = lastName?.charAt(0).toUpperCase() ?? '';
  return `${f}${l}`;
}

export function calculateMargin(cost: number, sale: number): number {
  if (sale === 0) return 0;
  return ((sale - cost) / sale) * 100;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Tarjeta Débito',
  CREDIT_CARD: 'Tarjeta Crédito',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito/Fiado',
  YAPE: 'Yape',
  PLIN: 'Plin',
  OTHER: 'Otro',
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
  WAREHOUSE: 'Almacenero',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  LOCKED: 'Bloqueado',
  COMPLETED: 'Completada',
  CANCELLED: 'Anulada',
  RETURNED: 'Devuelta',
  PARTIALLY_RETURNED: 'Dev. Parcial',
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};
