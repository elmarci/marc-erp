import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapPin, Clock, Phone, ChevronRight, Tag, Zap, ShoppingBag, Star, Truck } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'

const WHATSAPP_NUMBER = '51930555831'
const STORE_ADDRESS = 'Mz F10 Lt2A - C.27 Av. Manchay, Pachacamac'

const CATEGORY_ICONS: Record<string, string> = {
  'Abarrotes': '🛒', 'Bebidas': '🥤', 'Lácteos': '🥛', 'Frutas': '🍎', 'Verduras': '🥦',
  'Carnes': '🥩', 'Panadería': '🍞', 'Limpieza': '🧹', 'Higiene': '🧴', 'Snacks': '🍿',
  'Golosinas': '🍬', 'Congelados': '❄️', 'Mascotas': '🐾',
}

export function HomePage() {
  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })
  const { data: featuredData } = useQuery({
    queryKey: ['store-featured'],
    queryFn: () => storeApi.getProducts({ limit: 8, page: 1 }),
  })
  const { data: offersData } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
  })

  const categories = categoriesData?.data.data ?? []
  const featured = featuredData?.data.data ?? []
  const offers = offersData?.data.data ?? []

  return (
    <main className="bg-bg min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FFF8F0 0%, #FAFAF8 60%, #FFF0E8 100%)' }}>
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-green rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-14 sm:py-20">
          <div className="max-w-xl">
            {/* Logo */}
            <img src="/logo-light.png" alt="TIENDA MARC" className="h-14 w-auto object-contain mb-6" />

            <div className="inline-flex items-center gap-2 bg-orange/10 border border-orange/20 rounded-full px-4 py-1.5 mb-5">
              <Zap className="h-3.5 w-3.5 text-orange" />
              <span className="text-orange text-sm font-semibold">Delivery y recojo en tienda · Pachacamac</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black text-marc leading-tight mb-4">
              Tu minimarket<br />
              <span className="text-orange">a un clic</span> 🛒
            </h1>
            <p className="text-marc/60 text-base mb-8">
              Compra online y recibe en tu puerta o recoge en nuestra tienda.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/catalogo"
                className="bg-orange hover:bg-orange-dark text-white font-bold px-8 py-3.5 rounded-full transition-colors shadow-orange text-sm">
                Ver productos
              </Link>
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"
                className="bg-white hover:bg-cream border border-[--border] text-marc font-medium px-8 py-3.5 rounded-full transition-colors text-sm flex items-center gap-2 shadow-card">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Features strip */}
        <div className="border-t border-orange/10 bg-white/60">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-marc/60">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-orange" />{STORE_ADDRESS}</div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange" />Lun–Dom 7:00 AM – 10:00 PM</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-orange" />930 555 831</div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          {[
            { icon: Truck, title: 'Delivery rápido', desc: 'A tu puerta', color: 'text-orange', bg: 'bg-orange-pale' },
            { icon: ShoppingBag, title: 'Recojo gratis', desc: 'En tienda', color: 'text-green-dark', bg: 'bg-green-pale' },
            { icon: Star, title: 'Productos frescos', desc: 'Calidad garantizada', color: 'text-yellow-600', bg: 'bg-yellow-50' },
          ].map(b => (
            <div key={b.title} className={`${b.bg} rounded-2xl p-4 text-center`}>
              <b.icon className={`h-6 w-6 ${b.color} mx-auto mb-2`} />
              <p className="text-sm font-bold text-marc">{b.title}</p>
              <p className="text-xs text-marc/50">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Offers */}
      {offers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-4 pb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black text-marc flex items-center gap-2">
              <Tag className="h-5 w-5 text-orange" />Ofertas especiales 🔥
            </h2>
            <Link to="/ofertas" className="text-orange hover:text-orange-dark text-sm font-semibold flex items-center gap-1">
              Ver todas <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {offers.map(offer => (
              <Link key={offer.id} to="/ofertas"
                className="relative bg-gradient-to-br from-orange to-orange-dark rounded-2xl p-5 overflow-hidden hover:shadow-orange transition-all group text-white">
                <div className="absolute top-3 right-3">
                  {offer.storeBadge && (
                    <span className="bg-white text-orange text-xs font-black px-3 py-1 rounded-full">{offer.storeBadge}</span>
                  )}
                </div>
                <h3 className="font-black text-lg mb-1">{offer.name}</h3>
                {offer.description && <p className="text-white/70 text-sm mb-2">{offer.description}</p>}
                <p className="text-white font-black text-2xl">
                  {offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.value}% OFF` :
                   offer.type === 'FIXED_DISCOUNT' ? `S/ ${offer.value} OFF` : 'Precio especial'}
                </p>
                {offer.endDate && (
                  <p className="text-white/50 text-xs mt-2">Hasta {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}</p>
                )}
                <p className="text-white/60 text-xs mt-2 group-hover:text-white transition-colors">Ver productos →</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-4 pb-8">
          <h2 className="text-xl font-black text-marc mb-5">Explora por categoría</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            <Link to="/catalogo"
              className="shrink-0 flex flex-col items-center gap-2 bg-orange text-white rounded-2xl px-5 py-3 text-sm font-bold transition-colors hover:bg-orange-dark">
              <span className="text-2xl">🛒</span>
              <span>Todo</span>
            </Link>
            {categories.map(cat => (
              <Link key={cat.id} to={`/catalogo?categoryId=${cat.id}`}
                className="shrink-0 flex flex-col items-center gap-2 bg-white hover:bg-cream border border-[--border] hover:border-orange/30 rounded-2xl px-5 py-3 text-sm font-medium text-marc/70 hover:text-orange transition-all shadow-card whitespace-nowrap">
                <span className="text-2xl">{CATEGORY_ICONS[cat.name] ?? '📦'}</span>
                <span>{cat.name}</span>
                <span className="text-[11px] text-marc/30">{cat._count.products}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 py-4 pb-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-marc">Productos destacados</h2>
          <Link to="/catalogo" className="text-orange hover:text-orange-dark text-sm font-semibold flex items-center gap-1">
            Ver todos <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {featured.map(product => <ProductCard key={product.id} product={product} />)}
        </div>
        {featured.length === 0 && (
          <div className="text-center py-16 text-marc/30">
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Cargando productos...</p>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-[--border] bg-white">
        <div className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8 text-sm text-marc/50">
          <div>
            <img src="/logo-light.png" alt="TIENDA MARC" className="h-8 w-auto object-contain mb-3" />
            <p>Tu minimarket de confianza en Pachacamac.</p>
          </div>
          <div>
            <p className="text-marc font-bold mb-3">Ubicación</p>
            <p>{STORE_ADDRESS}</p>
          </div>
          <div>
            <p className="text-marc font-bold mb-3">Contacto</p>
            <p>WhatsApp: 930 555 831</p>
            <p className="mt-1">Lun–Dom: 7:00 AM – 10:00 PM</p>
          </div>
        </div>
        <div className="border-t border-[--border] px-4 py-4 text-center text-xs text-marc/25">
          © 2026 TIENDA MARC — Todos los derechos reservados
        </div>
      </footer>
    </main>
  )
}
