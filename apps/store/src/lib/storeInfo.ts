// Datos del negocio que se muestran en la tienda. Un solo lugar para el
// nombre de marca, el WhatsApp y las reglas de reparto, así no vuelven a
// convivir "TIENDA MARC", "Minimarket Marc" y "Tienda Marc" en pantallas
// distintas.
export const BRAND_NAME = 'Tiendas Marc'

// Datos legales del proveedor: páginas legales y Libro de Reclamaciones.
export const BUSINESS = {
  owner: 'María del Rosario Ruiz Chávez',
  ruc: '10771669471',
  tradeName: 'Minimarket Marc (Tienda Marc)',
  address: 'Mz. F10 Lt. 2A, Calle 27, Av. Manchay, Pachacámac, Lima, Perú',
  email: 'atencion.cliente@tiendasmarc.pe',
  phones: '930 555 831 / 927 636 433',
  site: 'www.tiendasmarc.pe',
}
export const WHATSAPP_NUMBER = '51930555831'

export const DELIVERY = {
  zoneName: 'Manchay alto',
  zones: ['Portada', 'Villa Hermosa', 'Naranjos', 'Unión', 'Tres Marías', 'Huertos', 'UPIS', 'Eucaliptos', 'Paradero 1', 'Santa Rosa'],
  costFrom: 1.0,
  expressFrom: 3.0,
  // Tarjeta (Izipay) se suma cuando el checkout online la acepte.
  payments: ['Yape', 'Efectivo'],
}

export const money = (n: number) => `S/ ${n.toFixed(2)}`

export const whatsappLink = (text: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`

// Turnos de reparto en hora de Lima: mañana 6–9 am y tarde 5–9 pm todos los
// días; viernes y sábado la tarde se extiende hasta la 1 am.
type Status = { now: boolean; title: string }

function limaParts(date: Date) {
  // Lima es UTC-5 todo el año (sin horario de verano).
  const lima = new Date(date.getTime() - 5 * 60 * 60 * 1000)
  return { day: lima.getUTCDay(), minutes: lima.getUTCHours() * 60 + lima.getUTCMinutes() }
}

export function deliveryStatus(date = new Date()): Status {
  const { day, minutes } = limaParts(date)
  const h = (n: number) => n * 60
  const lateTonight = day === 5 || day === 6          // viernes o sábado
  const lateFromYesterday = day === 6 || day === 0    // madrugada de sábado o domingo

  if (lateFromYesterday && minutes < h(1)) return { now: true, title: 'Repartiendo ahora, hasta la 1 am' }
  if (minutes >= h(6) && minutes < h(9)) return { now: true, title: 'Repartiendo ahora, hasta las 9 am' }
  if (minutes >= h(17) && (minutes < h(21) || lateTonight)) {
    return { now: true, title: lateTonight ? 'Repartiendo ahora, hasta la 1 am' : 'Repartiendo ahora, hasta las 9 pm' }
  }
  if (minutes < h(6)) return { now: false, title: 'Próximo reparto: 6 a 9 am' }
  if (minutes < h(17)) return { now: false, title: lateTonight ? 'Próximo reparto: 5 pm a 1 am' : 'Próximo reparto: 5 a 9 pm' }
  return { now: false, title: 'Próximo reparto: mañana, 6 a 9 am' }
}

/* ── Tarifa de envío ─────────────────────────────────────────────────── */
// Mismos valores que apps/backend/src/modules/store/deliveryFee.ts: acá solo
// se MUESTRA el costo; el que vale es el que recalcula el servidor.
export const STORE_ORIGIN = { lat: -12.102235, lng: -76.874449 }
export const FEES = {
  tiers: [{ maxKm: 0.5, fee: 1.0 }, { maxKm: 1, fee: 1.5 }], beyond: 2.0,
  zoneNear: 1.5, zoneFar: 2.0, expressExtra: 2.0, maxGpsKm: 5, cardPercent: 3.5,
}
export const NEAR_ZONES = ['Naranjos', 'Villa Hermosa', 'Unión', 'Paradero 1']

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Por distancia en línea recta a la tienda: S/ 1.00 hasta 500 m, S/ 1.50
// hasta 1 km, S/ 2.00 más lejos. Sin GPS útil (no compartido, o a más de
// 5 km porque el cliente no está en el lugar de entrega) se cobra por zona.
export function deliveryFee(input: { coords: { lat: number; lng: number } | null; zone: string; express: boolean }) {
  const rawKm = input.coords ? distanceKm(STORE_ORIGIN, input.coords) : null
  const km = rawKm != null && rawKm <= FEES.maxGpsKm ? rawKm : null
  const base = km != null
    ? (FEES.tiers.find(t => km <= t.maxKm)?.fee ?? FEES.beyond)
    : (NEAR_ZONES.includes(input.zone) ? FEES.zoneNear : FEES.zoneFar)
  return { fee: base + (input.express ? FEES.expressExtra : 0), km, gpsTooFar: rawKm != null && km == null }
}

// Comisión por pagar con tarjeta, igual que la calcula el servidor.
export const cardFee = (amount: number) => Math.round(amount * FEES.cardPercent) / 100

/* ── Fechas y turnos de entrega ──────────────────────────────────────── */
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const clock = (min: number) => {
  const m = min % (24 * 60), h24 = Math.floor(m / 60), mm = m % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`
}

export type DeliveryTurn = { key: 'M' | 'T'; name: string; range: string; times: string[] }
export type DeliveryDay = { offset: number; label: string; date: string; turns: DeliveryTurn[] }

// Hoy, mañana y pasado mañana (hora de Lima) con sus turnos y horas cada 30
// minutos. Para hoy solo quedan las horas que todavía se pueden cumplir
// (desde 45 minutos más adelante); si no queda ninguna, el día sale sin turnos.
export function deliveryDays(now = new Date()): DeliveryDay[] {
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const nowMin = lima.getUTCHours() * 60 + lima.getUTCMinutes()
  return [0, 1, 2].map(offset => {
    const d = new Date(lima.getTime() + offset * 24 * 60 * 60 * 1000)
    const dow = d.getUTCDay()
    const late = dow === 5 || dow === 6
    const earliest = offset === 0 ? nowMin + 45 : 0
    const slots = (from: number, to: number) => {
      const out: string[] = []
      for (let t = from; t <= to - 30; t += 30) if (t >= earliest) out.push(clock(t))
      return out
    }
    const turns: DeliveryTurn[] = [
      { key: 'M' as const, name: 'Mañana', range: '6 a 9 am', times: slots(6 * 60, 9 * 60) },
      { key: 'T' as const, name: late ? 'Tarde y noche' : 'Tarde', range: late ? '5 pm a 1 am' : '5 a 9 pm', times: slots(17 * 60, late ? 25 * 60 : 21 * 60) },
    ].filter(t => t.times.length > 0)
    return {
      offset,
      label: offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : 'Pasado mañana',
      date: `${DAYS[dow]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
      turns,
    }
  })
}
