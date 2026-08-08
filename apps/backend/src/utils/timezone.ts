import { z } from 'zod';

// Perú es siempre UTC-5 (sin horario de verano) — estas funciones evitan
// depender de la zona horaria del proceso Node (que en producción/Railway
// corre en UTC por defecto), calculando "hoy"/rangos de fecha en hora de
// Lima de forma explícita sin importar dónde se ejecute el servidor.

const limaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const limaComponentsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Fecha "YYYY-MM-DD" tal como es HOY en Lima, sin importar el TZ del servidor. */
export function todayLimaDateString(): string {
  return limaDateFormatter.format(new Date());
}

/** Interpreta una fecha "YYYY-MM-DD" (de un <input type="date">) como medianoche/fin
 * de día en hora de Lima — así el filtro "hasta" incluye todo ese día en vez de
 * cortar 5 horas antes (o después) según el TZ del proceso Node. */
export function parseLimaDate(dateStr: string, endOfDay = false): Date {
  const time = endOfDay ? 'T23:59:59.999' : 'T00:00:00';
  return new Date(`${dateStr}${time}-05:00`);
}

// Para filtros ?dateFrom=&dateTo= de querystring: acepta tanto "YYYY-MM-DD"
// como una fecha con hora sin offset (lo que manda el frontend a veces) — en
// ambos casos se queda solo con la parte de fecha y la reinterpreta en hora
// de Lima, así el filtro nunca depende del TZ del proceso Node.
export const limaDateFromParam = z.string().optional()
  .transform(s => (s ? parseLimaDate(s.slice(0, 10), false) : undefined));
export const limaDateToParam = z.string().optional()
  .transform(s => (s ? parseLimaDate(s.slice(0, 10), true) : undefined));

/** Año, mes (1-12), día y hora:minuto actuales en hora de Lima — para correlativos
 * (número de venta del día) y checks de horario (Hora Feliz) que no deben
 * depender del TZ del proceso. */
export function nowInLima(): { year: number; month: number; day: number; hhmm: string } {
  const parts = limaComponentsFormatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hhmm: `${get('hour')}:${get('minute')}`,
  };
}
