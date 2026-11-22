// Fecha y hora de entrega que eligió el cliente en la tienda. El checkout
// las guarda al inicio de la nota del pedido (apps/store CheckoutPage):
//   "ENTREGA: mañana sáb 22 nov, turno tarde (2 a 5 pm), hora 3:00 pm | RECIBE: …"
//   "ENTREGA: hoy sáb 22 nov, EXPRESS (lo antes posible) | …"
// Acá se vuelven datos para que el repartidor vea cuándo entregar y pueda
// juntar los pedidos del mismo turno.

export interface EntregaProgramada {
  express: boolean;
  /** Fecha y hora en Lima (ISO con -05:00), o null si es express o no se pudo leer. */
  cuando: string | null;
  /** "sáb 22 nov" */
  dia: string | null;
  /** "Tarde (2 a 5 pm)" */
  turno: string | null;
  /** "3:00 pm" */
  hora: string | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const OFFSET: Record<string, number> = { hoy: 0, 'mañana': 1, 'pasado mañana': 2 };

export function entregaProgramada(notes: string | null | undefined, createdAt: Date): EntregaProgramada | null {
  const m = /ENTREGA:\s*(hoy|pasado mañana|mañana)\s+(\S+\s+(\d{1,2})\s+([a-zé]{3}))\s*,\s*(EXPRESS|turno\s+(\S+)\s+\(([^)]+)\),\s*hora\s+(\d{1,2}):(\d{2})\s*(am|pm))/i.exec(notes ?? '');
  if (!m) return null;
  const dia = m[2];
  if (/^express$/i.test(m[5])) return { express: true, cuando: null, dia, turno: null, hora: null };

  // Año: el del pedido en Lima; si el mes elegido es enero y el pedido es de
  // diciembre, es el año siguiente.
  const lima = new Date(createdAt.getTime() - 5 * 3600 * 1000);
  const mes = MESES.indexOf(m[4].toLowerCase());
  let anio = lima.getUTCFullYear();
  if (mes >= 0 && mes < lima.getUTCMonth() - 6) anio += 1;
  let h = Number(m[8]) % 12;
  if (m[10].toLowerCase() === 'pm') h += 12;
  // El turno noche de vie y sáb llega hasta la 1 am: "12:30 am" es ya el
  // día siguiente.
  const d = Number(m[3]) + (h < 6 && /noche/i.test(m[6]) ? 1 : 0);
  const fecha = mes >= 0
    ? new Date(Date.UTC(anio, mes, d, h + 5, Number(m[9])))
    : new Date(lima.getTime() + (OFFSET[m[1].toLowerCase()] ?? 0) * 86400000);
  const turno = m[6].charAt(0).toUpperCase() + m[6].slice(1).toLowerCase();
  return {
    express: false,
    cuando: isNaN(fecha.getTime()) ? null : fecha.toISOString(),
    dia,
    turno: `${turno} (${m[7]})`,
    hora: `${m[8]}:${m[9]} ${m[10].toLowerCase()}`,
  };
}
