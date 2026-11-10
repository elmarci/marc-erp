// Datos del negocio que se muestran en la tienda. Un solo lugar para el
// nombre de marca, el WhatsApp y las reglas de reparto, así no vuelven a
// convivir "TIENDA MARC", "Minimarket Marc" y "Tienda Marc" en pantallas
// distintas.
export const BRAND_NAME = 'Tiendas Marc'
export const WHATSAPP_NUMBER = '51930555831'

export const DELIVERY = {
  zoneName: 'Manchay alto',
  zones: ['Portada', 'Villa Hermosa', 'Naranjos', 'Unión', 'Tres Marías', 'Huertos', 'UPIS', 'Eucaliptos', 'Paradero 1', 'Santa Rosa'],
  costFrom: 1.0,
  expressFrom: 2.5,
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
