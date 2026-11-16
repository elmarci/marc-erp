import { Link } from 'react-router-dom'
import { useAuthStore } from '../authStore'

// Franjas con foto del inicio: cuentan en un vistazo lo que más pregunta
// un vecino nuevo (cuándo llega, cómo paga, qué gana). El texto va en HTML,
// no dentro de la imagen, para poder cambiarlo sin redibujar nada.
export function HomeBanners({ wrap }: { wrap: string }) {
  const isLoggedIn = useAuthStore(s => !!s.isLoggedIn)
  const banners = [
    { img: 'ban-delivery-turnos', title: 'Tres repartos al día', text: 'Mañana, tarde y noche.', to: '/como-comprar' },
    { img: 'ban-paga-con-tarjeta', title: 'Paga con tarjeta al recibir', text: 'Débito o crédito, con POS.', to: '/como-comprar' },
    { img: 'ban-suma-puntos', title: 'Suma puntos en cada compra', text: 'Canjéalos por productos.', to: isLoggedIn ? '/mis-pedidos#canje' : '/ingresar' },
  ]
  return (
    <section className="pt-5" aria-label="Lo que tienes que saber">
      <div className={`${wrap} flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-6 lg:scroll-pl-8 no-scrollbar -mb-1 pb-1`}>
        {banners.map(b => (
          <Link key={b.img} to={b.to}
            className="relative shrink-0 snap-start w-[86%] max-w-[380px] h-[132px] rounded-2xl overflow-hidden bg-white shadow-card flex">
            <span className="flex-1 min-w-0 px-4 py-3.5 flex flex-col justify-center">
              <span className="block text-base font-extrabold text-paper-ink leading-snug">{b.title}</span>
              <span className="block mt-1 text-[13px] text-paper-ink-soft leading-snug">{b.text}</span>
              <span className="mt-2 text-[13px] font-bold text-brand-blue-600">Ver más</span>
            </span>
            <img src={`/ilustraciones/${b.img}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async"
              width={400} height={362} className="w-[42%] h-full object-cover shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  )
}
