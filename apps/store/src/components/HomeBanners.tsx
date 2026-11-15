import { Link } from 'react-router-dom'
import { useAuthStore } from '../authStore'

// Franjas ilustradas del inicio: cuentan en un vistazo lo que más pregunta
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
            className="relative shrink-0 snap-start w-[86%] max-w-[380px] h-[150px] rounded-2xl overflow-hidden bg-[#D6E6FD] shadow-card">
            <img src={`/ilustraciones/${b.img}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async"
              width={796} height={192} className="absolute right-0 bottom-0 h-[96px] w-auto max-w-none" />
            <span className="relative block px-4 pt-3">
              <span className="block text-base font-extrabold text-paper-ink leading-snug truncate">{b.title}</span>
              <span className="block text-[13px] text-paper-ink-soft leading-snug truncate">{b.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
