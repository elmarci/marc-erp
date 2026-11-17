const DAY_MS = 24 * 60 * 60 * 1000;

export function limaDaysUntil(date: Date, now: Date = new Date()): number {
  // La fecha de vencimiento es un día de calendario (se guarda como medianoche
  // UTC); "hoy" es el día en Lima.
  const expiryDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const l = new Date(now.getTime() - 5 * 3600 * 1000);
  const today = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  return Math.round((expiryDay - today) / DAY_MS);
}
