import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BUSINESS } from '../lib/storeInfo'

// Páginas legales públicas (/privacidad y /terminos). Se muestran sin login
// ni cabecera de la tienda porque Google las revisa al publicar el inicio de
// sesión con Google, y cualquiera debe poder leerlas antes de registrarse.
// Si cambian los datos del negocio, actualizar BUSINESS en lib/storeInfo.ts.


const UPDATED = '8 de noviembre de 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold text-paper-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-paper-ink-soft">{children}</div>
    </section>
  )
}

function LegalLayout({ title, other, children }: { title: string; other: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper-bg">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-brand-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />Volver a la tienda
        </Link>
        <img src="/logo.png" alt="Minimarket Marc" className="mt-6 h-12 w-auto" />
        <h1 className="font-display mt-4 text-2xl font-extrabold text-paper-ink sm:text-3xl">{title}</h1>
        <p className="mt-1 text-xs text-paper-ink-faint">Última actualización: {UPDATED}</p>

        <div className="mt-8 space-y-7">{children}</div>

        <div className="mt-10 border-t border-paper-line pt-5 text-xs text-paper-ink-faint space-y-1">
          <p>{BUSINESS.owner} · RUC {BUSINESS.ruc}</p>
          <p>{BUSINESS.address}</p>
          <p>
            <a href={`mailto:${BUSINESS.email}`} className="text-brand-blue-600 hover:underline">{BUSINESS.email}</a> · {BUSINESS.phones}
          </p>
          <p className="pt-2">
            <Link to={other.to} className="text-brand-blue-600 hover:underline">{other.label}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Contact() {
  return (
    <>
      escribiendo a <a href={`mailto:${BUSINESS.email}`} className="text-brand-blue-600 hover:underline">{BUSINESS.email}</a> o
      al WhatsApp {BUSINESS.phones}
    </>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad" other={{ to: '/terminos', label: 'Ver Términos y condiciones' }}>
      <Section title="1. Quién es responsable de tus datos">
        <p>
          El responsable del tratamiento de tus datos personales es {BUSINESS.owner}, persona natural con negocio,
          con RUC {BUSINESS.ruc}, que opera {BUSINESS.tradeName} en {BUSINESS.address}. Esta política se aplica a la
          tienda online {BUSINESS.site} y a su aplicación instalable.
        </p>
        <p>
          Tratamos tus datos conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento.
        </p>
      </Section>

      <Section title="2. Qué datos recogemos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Datos de tu cuenta:</strong> nombre, número de teléfono (WhatsApp), correo electrónico y contraseña (guardada cifrada; nunca la vemos).</li>
          <li><strong>Si ingresas con Google:</strong> solo tu correo, tu nombre y el identificador de tu cuenta de Google. No accedemos a tus contactos, archivos ni a ningún otro dato de Google.</li>
          <li><strong>Datos de entrega:</strong> direcciones, distrito, referencias y, si lo autorizas, la ubicación de tu celular para ubicar tu casa en el mapa.</li>
          <li><strong>Datos de tus pedidos:</strong> productos, montos, método de pago elegido (Yape, Plin o efectivo) y, si la envías, la captura de tu pago. No recibimos ni guardamos datos de tarjetas.</li>
          <li><strong>Puntos y beneficios:</strong> tu historial de compras para calcular puntos y ofertas.</li>
          <li><strong>Avisos:</strong> si aceptas recibir notificaciones, guardamos el permiso de tu navegador para enviarte ofertas.</li>
        </ul>
        <p>
          La búsqueda y la lista de compras por voz usan el reconocimiento de voz de tu propio navegador. No grabamos ni
          guardamos tu voz.
        </p>
      </Section>

      <Section title="3. Para qué usamos tus datos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Crear y proteger tu cuenta.</li>
          <li>Preparar, cobrar y entregar tus pedidos, y comunicarnos contigo sobre ellos por WhatsApp, llamada o correo.</li>
          <li>Emitir comprobantes de pago y cumplir obligaciones tributarias.</li>
          <li>Darte puntos, beneficios y, si lo aceptaste, avisos de ofertas.</li>
          <li>Atender consultas y reclamos.</li>
        </ul>
        <p>No vendemos ni alquilamos tus datos a nadie.</p>
      </Section>

      <Section title="4. Con quién los compartimos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Repartidores</strong> que entregan tu pedido: solo tu nombre, teléfono, dirección y referencia, y solo para esa entrega.</li>
          <li><strong>Proveedores tecnológicos</strong> que alojan la tienda, la base de datos y el envío de correos, que solo procesan los datos para darnos ese servicio.</li>
          <li><strong>Autoridades</strong>, cuando la ley lo exija.</li>
        </ul>
        <p>
          Algunos de estos proveedores tienen sus servidores fuera del Perú, por lo que tus datos pueden almacenarse en el
          extranjero con medidas de seguridad adecuadas.
        </p>
      </Section>

      <Section title="5. Cuánto tiempo los guardamos">
        <p>
          Guardamos los datos de tu cuenta mientras la tengas activa. Los datos de pedidos y comprobantes se conservan el
          tiempo que exigen las normas tributarias. Si eliminas tu cuenta, borramos o anonimizamos el resto de tus datos.
        </p>
      </Section>

      <Section title="6. Tus derechos">
        <p>
          Puedes pedir en cualquier momento acceder a tus datos, corregirlos, eliminarlos u oponerte a su uso (derechos
          ARCO), así como borrar tu cuenta o dejar de recibir ofertas, <Contact />. Responderemos dentro de los plazos de
          ley. Si no estás conforme con la respuesta, puedes acudir a la Autoridad Nacional de Protección de Datos
          Personales del Ministerio de Justicia y Derechos Humanos.
        </p>
      </Section>

      <Section title="7. Seguridad">
        <p>
          Usamos conexión cifrada (HTTPS), contraseñas cifradas y acceso restringido al personal que necesita los datos
          para atender tu pedido.
        </p>
      </Section>

      <Section title="8. Menores de edad">
        <p>
          La tienda está dirigida a mayores de 18 años. No vendemos bebidas alcohólicas ni cigarrillos a menores de edad.
        </p>
      </Section>

      <Section title="9. Cambios a esta política">
        <p>Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización.</p>
      </Section>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Términos y condiciones" other={{ to: '/privacidad', label: 'Ver Política de privacidad' }}>
      <Section title="1. Quiénes somos">
        <p>
          {BUSINESS.site} es la tienda online de {BUSINESS.tradeName}, operada por {BUSINESS.owner}, RUC {BUSINESS.ruc},
          con domicilio en {BUSINESS.address}. Al usar la tienda aceptas estos términos.
        </p>
      </Section>

      <Section title="2. Tu cuenta">
        <p>
          Puedes registrarte con tu teléfono y una contraseña, o con tu cuenta de Google. Los datos que nos des deben ser
          reales, y eres responsable de cuidar tu contraseña. También puedes pedir por WhatsApp sin crear una cuenta.
          Debes ser mayor de 18 años para comprar.
        </p>
      </Section>

      <Section title="3. Productos y precios">
        <p>
          Los precios están en soles (S/) e incluyen los impuestos que correspondan. Las fotos son referenciales. Los
          precios, ofertas y existencias pueden cambiar sin aviso, pero respetamos el precio que aparecía cuando hiciste tu
          pedido. Las ofertas tienen vigencia y stock limitados, indicados en cada una.
        </p>
        <p>
          Si un producto se agota después de tu pedido, te avisaremos para cambiarlo por otro o quitarlo, y solo te
          cobraremos lo que se entregue.
        </p>
      </Section>

      <Section title="4. Pedidos y pagos">
        <p>
          Tu pedido queda confirmado cuando lo aceptamos. Puedes pagar con Yape, Plin o en efectivo, según las opciones que
          se muestren al pagar. Si pagas por adelantado, preparamos el pedido cuando confirmamos el pago. Podemos cancelar
          pedidos con datos falsos o que no podamos confirmar; si ya pagaste, te devolvemos el dinero.
        </p>
      </Section>

      <Section title="5. Delivery y recojo en tienda">
        <p>
          Hacemos entregas en las zonas y horarios que muestra la tienda, con el costo de envío indicado antes de confirmar.
          Los tiempos son aproximados. Debe haber alguien para recibir el pedido en la dirección indicada. También puedes
          recoger tu pedido en la tienda.
        </p>
        <p>No entregamos bebidas alcohólicas ni cigarrillos a menores de edad; el repartidor puede pedir un documento.</p>
      </Section>

      <Section title="6. Cambios y devoluciones">
        <p>
          Revisa tu pedido al recibirlo. Si un producto llega dañado, vencido, incompleto o no es el que pediste, avísanos
          dentro de las 24 horas siguientes, <Contact />, y lo cambiamos o te devolvemos el dinero de ese producto. Los
          productos perecibles (frescos, refrigerados, panadería) solo se aceptan por estos motivos.
        </p>
      </Section>

      <Section title="7. Puntos y beneficios">
        <p>
          Los puntos y beneficios son personales, no se pueden cambiar por dinero y siguen las condiciones que se muestran
          en la tienda, que pueden cambiar con aviso previo.
        </p>
      </Section>

      <Section title="8. Consultas y reclamos">
        <p>
          Puedes hacer consultas o reclamos <Contact />, o directamente en la tienda física. Nos
          regimos por el Código de Protección y Defensa del Consumidor (Ley N.° 29571).
        </p>
      </Section>

      <Section title="9. Datos personales">
        <p>
          El uso de tus datos se explica en nuestra{' '}
          <Link to="/privacidad" className="text-brand-blue-600 hover:underline">Política de privacidad</Link>.
        </p>
      </Section>

      <Section title="10. Cambios y ley aplicable">
        <p>
          Podemos actualizar estos términos; la versión vigente es la publicada en esta página. Se rigen por las leyes del
          Perú.
        </p>
      </Section>
    </LegalLayout>
  )
}
