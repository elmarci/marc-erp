import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Clock, LayoutGrid, MapPin, ShoppingBasket, Truck, Wallet, WifiOff } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'
import { PromoCarousel } from '../components/PromoCarousel'
import { WhatsAppIcon } from '../components/CartBar'
import { getCategoryIcon } from '../categoryIcons'
import { BRAND_NAME, DELIVERY, deliveryStatus, money, whatsappLink } from '../lib/storeInfo'

const STORE_ADDRESS = 'Mz F10 Lt2A - C.27 Av. Manchay, Pachacamac'
const WRAP = 'max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8'
const H2 = 'text-lg font-extrabold text-paper-ink'

function CardSkeleton() {
  return (
    <div className="bg-white rounded-[18px] p-2.5 shadow-card flex flex-col gap-2" aria-hidden="true">
      <div className="aspect-square rounded-xl bg-paper-surface animate-pulse" />
      <div className="h-4 rounded bg-paper-surface animate-pulse" />
      <div className="h-4 w-2/3 rounded bg-paper-surface animate-pulse" />
      <div className="h-11 rounded-xl bg-paper-surface animate-pulse" />
    </div>
  )
}

export function HomePage() {
  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })

  const featuredQuery = useQuery({
    queryKey: ['store-featured'],
    queryFn: () => storeApi.getFeaturedProducts(10),
  })

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
  })

  const categories = categoriesData?.data.data ?? []
  const featured = featuredQuery.data?.data.data ?? []
  const offers = offersData?.data.data ?? []
  const status = deliveryStatus()
  // 7 categorías + "Ver todo" llenan dos filas exactas de 4 en celular.
  const topCategories = categories.slice(0, 7)

  return (
    <main className="pb-6">
      {/* Reparto: lo primero que un vecino nuevo necesita saber antes de
          llenar el carrito — si llegamos a su zona, cuándo y cuánto cuesta. */}
      <section className={`${WRAP} pt-3.5`} aria-label="Reparto">
        <div className="bg-white rounded-2xl shadow-card px-3.5 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-green-100 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-brand-green-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-paper-ink leading-snug">{status.title}</p>
            <p className="text-[13px] text-paper-ink-soft leading-snug">
              Envío desde {money(DELIVERY.costFrom)} · Express desde {money(DELIVERY.expressFrom)}
            </p>
          </div>
        </div>
      </section>

      {topCategories.length > 0 && (
        <section className={`${WRAP} pt-5`}>
          <h2 className={`${H2} mb-3`}>Categorías</h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-x-2.5 gap-y-3.5">
            {topCategories.map(cat => {
              const Icon = getCategoryIcon(cat.name)
              return (
                <Link key={cat.id} to={`/catalogo?categoryId=${cat.id}`} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="h-16 w-16 rounded-[18px] bg-white shadow-card overflow-hidden flex items-center justify-center">
                    {cat.imageUrl
                      ? <img src={cat.imageUrl} alt="" loading="lazy" decoding="async" width={64} height={64} className="h-full w-full object-cover" />
                      : <Icon className="h-7 w-7 text-brand-blue-600" />}
                  </span>
                  <span className="text-[13px] font-semibold text-paper-ink leading-tight line-clamp-2">{cat.name}</span>
                </Link>
              )
            })}
            <Link to="/categorias" className="flex flex-col items-center gap-1.5 text-center">
              <span className="h-16 w-16 rounded-[18px] bg-brand-blue-600 flex items-center justify-center">
                <LayoutGrid className="h-7 w-7 text-white" aria-hidden="true" />
              </span>
              <span className="text-[13px] font-semibold text-paper-ink leading-tight">Ver todo</span>
            </Link>
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <>
          <div className={`${WRAP} pt-4 flex items-center justify-between`}>
            <h2 className={H2}>Ofertas de la semana</h2>
            <Link to="/ofertas" className="text-sm font-bold text-brand-blue-600 h-11 flex items-center">Ver todas</Link>
          </div>
          <PromoCarousel offers={offers} />
        </>
      )}

      <section className={`${WRAP} pt-4`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className={H2}>Lo que más se lleva</h2>
          <Link to="/catalogo" className="text-sm font-bold text-brand-blue-600 h-11 flex items-center">Ver todo</Link>
        </div>

        {featuredQuery.isError ? (
          <div className="bg-white rounded-2xl shadow-card p-6 text-center">
            <WifiOff className="h-8 w-8 mx-auto mb-3 text-paper-ink-soft" aria-hidden="true" />
            <p className="font-bold text-paper-ink">No pudimos cargar los productos</p>
            <p className="text-sm text-paper-ink-soft mt-1 mb-4">Revisa tu conexión y vuelve a intentar. También puedes pedir por WhatsApp.</p>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => featuredQuery.refetch()}
                className="h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold">Reintentar</button>
              <a href={whatsappLink(`Hola ${BRAND_NAME}, quiero hacer un pedido.`)} target="_blank" rel="noopener noreferrer"
                className="h-12 rounded-xl bg-[#25D366] text-[#0B3B1E] font-bold flex items-center justify-center gap-2">
                <WhatsAppIcon className="h-5 w-5" />Pedir por WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {featuredQuery.isLoading
              ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
              : featured.map(product => <ProductCard key={product.id} product={product} />)}
          </div>
        )}

        {!featuredQuery.isLoading && !featuredQuery.isError && featured.length === 0 && (
          <div className="bg-white rounded-2xl shadow-card p-6 text-center">
            <p className="font-bold text-paper-ink">Estamos actualizando el catálogo</p>
            <p className="text-sm text-paper-ink-soft mt-1">Mientras tanto, mira todas las categorías.</p>
            <Link to="/categorias" className="mt-4 h-12 rounded-xl bg-brand-blue-600 text-white font-bold flex items-center justify-center">Ver categorías</Link>
          </div>
        )}
      </section>

      <section className={`${WRAP} pt-6`}>
        <Link to="/canasta" className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3.5">
          <span className="h-12 w-12 rounded-xl bg-brand-blue-50 flex items-center justify-center shrink-0">
            <ShoppingBasket className="h-6 w-6 text-brand-blue-600" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-paper-ink">Arma tu canasta</span>
            <span className="block text-sm text-paper-ink-soft leading-snug">Dinos cuánto tienes y para cuántos. Te armamos la compra.</span>
          </span>
          <ChevronRight className="h-5 w-5 text-paper-ink-soft shrink-0" aria-hidden="true" />
        </Link>
      </section>

      {/* Cómo funciona el reparto y el pago: datos reales, a la vista, sin
          tener que llegar al checkout para enterarse. */}
      <section className={`${WRAP} pt-6`}>
        <h2 className={`${H2} mb-3`}>Cómo te llega tu pedido</h2>
        <div className="bg-white rounded-2xl shadow-card divide-y divide-paper-line">
          <div className="flex gap-3 p-4">
            <MapPin className="h-5 w-5 text-brand-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-paper-ink">Repartimos en {DELIVERY.zoneName}</p>
              <p className="text-sm text-paper-ink-soft leading-relaxed">{DELIVERY.zones.join(', ')}.</p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <Clock className="h-5 w-5 text-brand-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-paper-ink">Dos repartos al día</p>
              <p className="text-sm text-paper-ink-soft leading-relaxed">Mañana de 6 a 9 am y tarde de 5 a 9 pm. Viernes y sábado, hasta la 1 am.</p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <Truck className="h-5 w-5 text-brand-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-paper-ink">Envío desde {money(DELIVERY.costFrom)}</p>
              <p className="text-sm text-paper-ink-soft leading-relaxed">Express desde {money(DELIVERY.expressFrom)}. Recoger en tienda no cuesta.</p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <Wallet className="h-5 w-5 text-brand-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-paper-ink">Pagas como prefieras</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {DELIVERY.payments.map(p => (
                  <span key={p} className="bg-paper-surface rounded-full px-3 py-1 text-sm font-semibold text-paper-ink">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className={`${WRAP} pt-8 pb-4 text-sm text-paper-ink-soft`}>
        <p className="font-bold text-paper-ink">{BRAND_NAME}</p>
        <p className="mt-1">{STORE_ADDRESS}</p>
        <p>Tienda abierta de lunes a domingo, de 7 am a 10 pm.</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/terminos" className="underline py-3">Términos y condiciones</Link>
          <Link to="/privacidad" className="underline py-3">Política de privacidad</Link>
        </p>
      </footer>
    </main>
  )
}
