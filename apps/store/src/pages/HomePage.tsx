import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  MapPin, Clock, Phone, ChevronRight, Zap, LayoutGrid, Truck, ShieldCheck,
  Store, Heart, Flame, Smile, Leaf,
} from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'
import { PromoCarousel } from '../components/PromoCarousel'
import { getCategoryIcon } from '../categoryIcons'
import { useCartStore } from '../cartStore'
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal'

const MotionLink = motion.create(Link)

const heroStagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } }
const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] } },
}

const WHATSAPP_NUMBER = '51930555831'
const STORE_ADDRESS = 'Mz F10 Lt2A - C.27 Av. Manchay, Pachacamac'

const BENEFITS = [
  { icon: Truck, title: 'Delivery a tu puerta', desc: 'Pedidos entregados el mismo día en Pachacamac' },
  { icon: Store, title: 'Recojo en tienda', desc: 'Reserva online y pasa a recogerlo sin espera' },
  { icon: ShieldCheck, title: 'Pago seguro', desc: 'Yape, Plin o efectivo contra entrega' },
  { icon: Heart, title: 'Atención cercana', desc: 'Te respondemos directo por WhatsApp' },
]

const WHY_US = [
  { icon: Leaf, title: 'Productos frescos', desc: 'Frutas, verduras y lácteos que renovamos constantemente' },
  { icon: Smile, title: 'Precios justos', desc: 'Los mismos precios de nuestra tienda física, sin sorpresas' },
  { icon: Flame, title: 'Ofertas reales', desc: 'Promociones activas cada semana en tus marcas de siempre' },
  { icon: MapPin, title: 'De tu barrio', desc: 'Un minimarket de Pachacamac hecho para vecinos de Pachacamac' },
]

export function HomePage() {
  const { openCart } = useCartStore()

  const { data: categoriesData } = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => storeApi.getCategories(),
  })

  const { data: featuredData } = useQuery({
    queryKey: ['store-featured'],
    queryFn: () => storeApi.getFeaturedProducts(10),
  })

  const { data: offersData } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
  })

  const { data: displayData } = useQuery({
    queryKey: ['store-display-settings'],
    queryFn: () => storeApi.getDisplaySettings(),
    staleTime: 5 * 60_000,
  })

  const categories = categoriesData?.data.data ?? []
  const featured = featuredData?.data.data ?? []
  const offers = offersData?.data.data ?? []
  const heroVideoUrl = displayData?.data.data.heroVideoUrl ?? null
  const heroPosterUrl = displayData?.data.data.heroPosterUrl ?? null

  return (
    <main>
      {/* Hero */}
      <section className={`relative overflow-hidden ${heroVideoUrl ? 'bg-gray-900' : 'bg-gradient-to-br from-brand-blue-50 via-white to-brand-green-50'}`}>
        {heroVideoUrl ? (
          <>
            <video
              key={heroVideoUrl}
              className="absolute inset-0 h-full w-full object-cover"
              src={heroVideoUrl}
              poster={heroPosterUrl ?? undefined}
              autoPlay muted loop playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/85 via-gray-900/40 to-gray-900/20" />
          </>
        ) : (
          <>
            {/* Sin video: dos manchas de color con movimiento lento para que la
                portada no se sienta plana ni siquiera antes de subir un video real. */}
            <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-brand-blue-200/50 blur-3xl animate-float-blob" />
            <div className="pointer-events-none absolute -bottom-28 -right-10 h-80 w-80 rounded-full bg-brand-green-200/50 blur-3xl animate-float-blob-slow" />
          </>
        )}

        <div className="relative max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <motion.div className="max-w-2xl" variants={heroStagger} initial="hidden" animate="show">
            <motion.div variants={heroItem}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 border ${
                heroVideoUrl ? 'bg-white/10 border-white/30 backdrop-blur-sm' : 'bg-brand-green-100 border-brand-green-200'
              }`}>
              <Zap className={`h-3.5 w-3.5 ${heroVideoUrl ? 'text-brand-green-300' : 'text-brand-green-700'}`} />
              <span className={`text-sm font-medium ${heroVideoUrl ? 'text-white' : 'text-brand-green-800'}`}>Delivery y recojo en tienda</span>
            </motion.div>
            <motion.h1 variants={heroItem}
              className={`text-4xl sm:text-6xl font-black leading-tight mb-4 ${heroVideoUrl ? 'text-white drop-shadow-lg' : 'text-gray-900'}`}>
              Tu minimarket<br />
              <span className={heroVideoUrl ? 'text-brand-green-300' : 'text-brand-blue-600'}>en un clic</span>
            </motion.h1>
            <motion.p variants={heroItem} className={`text-lg mb-8 ${heroVideoUrl ? 'text-white/90' : 'text-gray-600'}`}>
              Compra online y recibe en tu puerta o recoge en nuestra tienda en Pachacamac.
            </motion.p>
            <motion.div variants={heroItem} className="flex flex-wrap gap-3">
              <MotionLink to="/catalogo" whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold px-8 py-3.5 rounded-full transition-colors hover:shadow-lg hover:shadow-brand-blue-600/30 text-sm">
                Ver productos
              </MotionLink>
              <motion.a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer"
                whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className={`font-medium px-8 py-3.5 rounded-full transition-colors hover:shadow-md text-sm flex items-center gap-2 shadow-sm ${
                  heroVideoUrl ? 'bg-white/10 border border-white/30 text-white backdrop-blur-sm hover:bg-white/20' : 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-700'
                }`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </motion.a>
            </motion.div>
          </motion.div>
        </div>

        {/* Info bar */}
        <div className={`relative border-t ${heroVideoUrl ? 'border-white/20 bg-black/30 backdrop-blur-sm' : 'border-gray-200/70 bg-white/50'}`}>
          <div className={`max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-6 text-sm ${heroVideoUrl ? 'text-white/85' : 'text-gray-600'}`}>
            <div className="flex items-center gap-2"><MapPin className={`h-4 w-4 shrink-0 ${heroVideoUrl ? 'text-brand-green-300' : 'text-brand-blue-600'}`} />{STORE_ADDRESS}</div>
            <div className="flex items-center gap-2"><Clock className={`h-4 w-4 shrink-0 ${heroVideoUrl ? 'text-brand-green-300' : 'text-brand-blue-600'}`} />Lun–Dom 7:00 AM – 10:00 PM</div>
            <div className="flex items-center gap-2"><Phone className={`h-4 w-4 shrink-0 ${heroVideoUrl ? 'text-brand-green-300' : 'text-brand-blue-600'}`} />930 555 831</div>
          </div>
        </div>
      </section>

      {/* Beneficios del servicio — lo que nos diferencia como minimarket */}
      <section className="bg-white border-b border-gray-100">
        <StaggerGroup className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {BENEFITS.map(b => (
            <StaggerItem key={b.title}>
              <motion.div whileHover={{ y: -3 }} className="group flex items-start gap-3 p-3 rounded-2xl transition-colors hover:bg-brand-blue-50/60">
                <div className="h-11 w-11 shrink-0 rounded-full bg-brand-blue-50 group-hover:bg-brand-blue-100 flex items-center justify-center transition-colors">
                  <b.icon className="h-5 w-5 text-brand-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm leading-tight">{b.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-snug hidden sm:block">{b.desc}</p>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </section>

      {/* Promociones — carrusel destacado, primero que las categorías */}
      <PromoCarousel offers={offers} />

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Reveal><h2 className="text-xl font-bold mb-6 text-gray-900">Compra por categorías</h2></Reveal>
          <StaggerGroup className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-3">
            <StaggerItem>
              <MotionLink to="/catalogo" whileHover={{ y: -4, scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="group flex flex-col items-center justify-center gap-2 bg-brand-blue-600 hover:bg-brand-blue-700 text-white rounded-2xl px-3 py-5 hover:shadow-lg hover:shadow-brand-blue-600/25 text-center h-full">
                <LayoutGrid className="h-7 w-7 transition-transform group-hover:scale-110" />
                <span className="text-xs font-bold">Todo</span>
              </MotionLink>
            </StaggerItem>
            {categories.map(cat => {
              const Icon = getCategoryIcon(cat.name)
              return (
                <StaggerItem key={cat.id}>
                  <MotionLink to={`/catalogo?categoryId=${cat.id}`} whileHover={{ y: -4, scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="group relative flex flex-col items-center justify-end gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 text-center hover:shadow-lg hover:border-brand-blue-300 aspect-square h-full">
                    {cat.imageUrl ? (
                      <>
                        <img src={cat.imageUrl} alt="" aria-hidden
                          className="absolute inset-0 h-full w-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-110 transition-all duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/10 to-transparent" />
                        <span className="relative z-10 text-xs font-bold text-white line-clamp-1 px-2 pb-3">{cat.name}</span>
                      </>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 py-4 group-hover:bg-brand-blue-50 transition-colors w-full h-full">
                        <Icon className="h-6 w-6 text-brand-blue-600 transition-transform group-hover:scale-110" />
                        <span className="text-xs font-medium text-gray-700 line-clamp-1">{cat.name}</span>
                      </div>
                    )}
                  </MotionLink>
                </StaggerItem>
              )
            })}
          </StaggerGroup>
        </section>
      )}

      {/* Featured products — más vendidos reales, no un listado alfabético */}
      <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
        <Reveal className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />Los más vendidos
          </h2>
          <Link to="/catalogo" className="text-brand-blue-600 hover:text-brand-blue-700 text-sm flex items-center gap-1 transition-colors group">
            Ver todos <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
        <StaggerGroup className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {featured.map(product => (
            <StaggerItem key={product.id}>
              <ProductCard product={product} />
            </StaggerItem>
          ))}
        </StaggerGroup>
        {featured.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p>Cargando productos...</p>
          </div>
        )}
      </section>

      {/* Por qué elegirnos — lo que nos vende como minimarket, no solo como catálogo */}
      <section className="bg-gradient-to-br from-brand-green-50 via-white to-brand-blue-50 border-y border-gray-100">
        <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <Reveal className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">¿Por qué comprar en Marc?</h2>
            <p className="text-gray-500 text-sm">Somos el minimarket de tu barrio, ahora también online.</p>
          </Reveal>
          <StaggerGroup className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {WHY_US.map(w => (
              <StaggerItem key={w.title}>
                <motion.div whileHover={{ y: -5 }} className="group bg-white rounded-2xl p-5 border border-gray-100 text-center transition-shadow hover:shadow-xl hover:border-brand-green-200 h-full">
                  <div className="h-12 w-12 mx-auto rounded-full bg-brand-green-50 group-hover:bg-brand-green-100 flex items-center justify-center mb-3 transition-colors">
                    <w.icon className="h-6 w-6 text-brand-green-600" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm mb-1">{w.title}</p>
                  <p className="text-gray-500 text-xs leading-snug">{w.desc}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm text-gray-500">
          <div>
            <img src="/logo.png" alt="Minimarket Marc" className="h-8 w-auto mb-3" />
            <p>Tu minimarket de confianza en Pachacamac.</p>
          </div>
          <div>
            <p className="text-gray-900 font-medium mb-3">Ubicación</p>
            <p>{STORE_ADDRESS}</p>
            <p className="mt-1">Lun–Dom: 7:00 AM – 10:00 PM</p>
          </div>
          <div>
            <p className="text-gray-900 font-medium mb-3">Navegación</p>
            <ul className="space-y-1.5">
              <li><Link to="/catalogo" className="hover:text-brand-blue-600 transition-colors">Catálogo</Link></li>
              <li><Link to="/ofertas" className="hover:text-brand-blue-600 transition-colors">Ofertas</Link></li>
              <li><Link to="/mis-pedidos" className="hover:text-brand-blue-600 transition-colors">Mi cuenta / Mis pedidos</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-gray-900 font-medium mb-3">Contacto y pagos</p>
            <p>WhatsApp: 930 555 831</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600">Yape</span>
              <span className="bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600">Plin</span>
              <span className="bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600">Efectivo</span>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-4 text-center text-xs text-gray-400">
          © 2026 TIENDA MARC — Todos los derechos reservados
        </div>
      </footer>
    </main>
  )
}
