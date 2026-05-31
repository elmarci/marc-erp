import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
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

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'dd/MM/yyyy', { locale: es });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: es });
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
