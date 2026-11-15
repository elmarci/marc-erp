import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { Ico } from '../components/Ico'
import { WhatsAppIcon } from '../components/CartBar'
import { BRAND_NAME, DELIVERY, FEES, money, whatsappLink } from '../lib/storeInfo'

// Guía para clientes nuevos: cómo comprar paso a paso, zonas, horarios,
// costos, pagos y puntos. Pública (no pide cuenta) y sirve también para
// mandar el enlace por WhatsApp: www.tiendasmarc.pe/como-comprar
const STEPS = [
  { icon: 'nav-categorias-relleno', title: 'Busca o elige por categoría', text: 'Usa el buscador, las categorías o las ofertas. También puedes dictar tu lista con el micrófono o usar "Arma tu canasta" con tu presupuesto.' },
  { icon: 'nav-carrito-relleno', title: 'Agrega al carrito', text: 'Toca el + verde de cada producto. Con − y + cambias la cantidad. Los productos a granel (por kilo) te dejan pedir por peso o por monto, por ejemplo S/ 5.' },
  { icon: 'chk-delivery', title: 'Elige delivery o recojo', text: `Delivery en ${DELIVERY.zoneName} o recoges gratis en la tienda. Comparte tu ubicación para que el envío se calcule exacto.` },
  { icon: 'chk-tarjeta', title: 'Elige cómo pagar', text: `Yape ahora o al recibir, efectivo, o tarjeta débito/crédito al recibir (comisión ${FEES.cardPercent} %). No necesitas crear cuenta para pedir.` },
  { icon: 'seg-moto', title: 'Sigue tu pedido', text: 'Te mostramos cada paso: recibido, preparando, en camino (con el repartidor en el mapa) y entregado.' },
] as const

const FAQ: Array<[string, string]> = [
  ['¿Necesito crear una cuenta?', 'No. Puedes pedir como invitado. Con cuenta ganas puntos en cada compra, guardas tus direcciones y repites pedidos en un toque.'],
  ['¿Cuánto cuesta el envío?', `${money(FEES.tiers[0].fee)} hasta 500 m de la tienda, ${money(FEES.tiers[1].fee)} hasta 1 km y ${money(FEES.beyond)} a más distancia. El envío express suma ${money(FEES.expressExtra)}. Recoger en tienda no cuesta.`],
  ['¿A qué zonas llegan?', `${DELIVERY.zoneName}: ${DELIVERY.zones.join(', ')}.`],
  ['¿En qué horario reparten?', 'Mañana de 6 a 9 am y tarde de 5 a 9 pm. Viernes y sábado, hasta la 1 am.'],
  ['¿Cómo pago con tarjeta?', `Elige "Tarjeta al recibir": el repartidor lleva el POS y pagas con débito o crédito. Se suma una comisión de ${FEES.cardPercent} % que ves antes de confirmar. Nunca te pedimos los datos de tu tarjeta por la web.`],
  ['¿Cómo funcionan los puntos?', 'Con tu cuenta, cada compra entregada te suma puntos. Los vas juntando para canjearlos por productos del catálogo de premios. Los ves en Mis pedidos, en "Puntos y canje".'],
  ['¿Cómo instalo la app en mi celular?', 'En Android, abre la tienda en Chrome y toca "Instalar" cuando aparezca el aviso, o en el menú ⋮ elige "Instalar app". En iPhone, abre en Safari, toca Compartir y luego "Agregar a inicio".'],
  ['¿Y si tengo un problema con mi pedido?', 'Escríbenos por WhatsApp y lo vemos al momento. También tienes el Libro de Reclamaciones al pie de la página.'],
]

export function HowToBuyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 pt-2 pb-10">
      <Link to="/" className="inline-flex items-center gap-1 h-11 text-sm font-bold text-brand-blue-600">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a la tienda
      </Link>
      <h1 className="text-2xl font-extrabold text-paper-ink">Cómo comprar</h1>
      <p className="text-[15px] text-paper-ink-soft mt-1 mb-5">Tu pedido en 5 pasos, sin crear cuenta si no quieres.</p>

      <ol className="bg-white rounded-2xl shadow-card divide-y divide-paper-line">
        {STEPS.map((s, n) => (
          <li key={s.title} className="flex gap-3.5 p-4">
            <span className="relative shrink-0">
              <Ico name={s.icon} className="h-10 w-10" />
              <span className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-brand-blue-600 text-white text-[11px] font-extrabold flex items-center justify-center">{n + 1}</span>
            </span>
            <span>
              <span className="block font-bold text-paper-ink">{s.title}</span>
              <span className="block text-sm text-paper-ink-soft leading-relaxed mt-0.5">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <h2 className="text-lg font-extrabold text-paper-ink mt-7 mb-3">Preguntas frecuentes</h2>
      <div className="bg-white rounded-2xl shadow-card divide-y divide-paper-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="flex items-center justify-between gap-3 p-4 min-h-12 cursor-pointer list-none font-bold text-paper-ink [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown className="h-5 w-5 text-paper-ink-soft shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="px-4 pb-4 -mt-1 text-sm text-paper-ink-soft leading-relaxed">{a}</p>
          </details>
        ))}
      </div>

      <div className="mt-7 flex flex-col gap-2.5">
        <Link to="/" className="h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold flex items-center justify-center">
          Empezar a comprar
        </Link>
        <a href={whatsappLink(`Hola ${BRAND_NAME}, tengo una consulta.`)} target="_blank" rel="noopener noreferrer"
          className="h-12 rounded-xl bg-[#25D366] text-[#0B3B1E] font-bold flex items-center justify-center gap-2">
          <WhatsAppIcon className="h-5 w-5" />Escríbenos por WhatsApp
        </a>
      </div>
    </main>
  )
}
