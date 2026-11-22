// Lee la línea "ENTREGA: …" que el checkout de la tienda escribe en la nota
// del pedido (apps/store/src/pages/CheckoutPage.tsx) y la convierte en una
// fecha/hora real. Ejemplos de lo que llega:
//   "ENTREGA: hoy vie 21 nov, EXPRESS (lo antes posible)"
//   "ENTREGA: mañana sáb 22 nov, turno tarde (2 a 5 pm), hora 3:00 pm"
// "hoy/mañana" es relativo al día del pedido, así que NO sirve mostrarlo tal
// cual al repartidor días después: se usa la fecha ("sáb 22 nov") + la hora.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000; // Lima = UTC-5 todo el año

export interface Entrega {
  tipo: 'EXPRESS' | 'PROGRAMADO' | 'SIN_HORA';
  // Hora exacta pedida (ISO, UTC). En express es la hora del pedido.
  at: string | null;
  turno: string | null; // "Tarde (2 a 5 pm)"
}

export function noteField(notes: string | null | undefined, key: string): string | null {
  const part = notes?.split('|').map(s => s.trim()).find(s => s.startsWith(`${key}:`));
  return part ? part.slice(key.length + 1).trim() : null;
}

export function parseEntrega(notes: string | null | undefined, createdAt: Date): Entrega {
  const raw = noteField(notes, 'ENTREGA');
  if (!raw) return { tipo: 'SIN_HORA', at: null, turno: null };
  if (/EXPRESS/i.test(raw)) return { tipo: 'EXPRESS', at: createdAt.toISOString(), turno: null };

  const fecha = raw.match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i);
  const hora = raw.match(/hora\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  const turnoM = raw.match(/turno\s+([a-zñ]+)\s*\(([^)]+)\)/i);
  const turno = turnoM ? `${turnoM[1].charAt(0).toUpperCase()}${turnoM[1].slice(1)} (${turnoM[2]})` : null;
  if (!fecha) return { tipo: 'SIN_HORA', at: null, turno };

  const day = Number(fecha[1]);
  const month = MONTHS.indexOf(fecha[2].toLowerCase());
  const createdLima = new Date(createdAt.getTime() - LIMA_OFFSET_MS);
  let year = createdLima.getUTCFullYear();
  if (month < createdLima.getUTCMonth()) year += 1; // pedido el 31 dic para el 1 ene

  let h = 12, m = 0;
  if (hora) {
    h = Number(hora[1]) % 12 + (hora[3].toLowerCase() === 'pm' ? 12 : 0);
    m = Number(hora[2]);
  }
  // "12:30 am" de la noche extendida (vie/sáb hasta la 1 am) cae ya al día
  // siguiente del que dice la fecha: el turno noche es de ese día.
  const extraDay = hora && h < 5 ? 1 : 0;
  const atUtc = Date.UTC(year, month, day + extraDay, h, m) + LIMA_OFFSET_MS;
  return { tipo: 'PROGRAMADO', at: new Date(atUtc).toISOString(), turno };
}
