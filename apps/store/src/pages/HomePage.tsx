import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, Flame, LayoutGrid } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'
import { PromoCarousel } from '../components/PromoCarousel'
import { getCategoryIcon } from '../categoryIcons'
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal'

const MotionLink = motion.create(Link)

const STORE_ADDRESS = 'Mz F10 Lt2A - C.27 Av. Manchay, Pachacamac'

// Paleta fija que se repite en orden para cada categoría — mismo trato
// visual (tamaño, forma, tipografía) para todas, sólo cambia el acento de
// color; así ninguna categoría "se ve distinta" a las demás según qué foto
// le subieron. Antes se usaba la foto del producto (cat.imageUrl) cuando
// existía, lo que hacía que unas categorías tuvieran una tarjeta con foto y
// otras un ícono — inconsistente, y la foto casi nunca representaba bien a
// toda la categoría.
const TILE_ACCENTS = [
  { bg: 'bg-brand-green-50 group-hover:bg-brand-green-100', icon: 'text-brand-green-600' },
  { bg: 'bg-brand-blue-50 group-hover:bg-brand-blue-100', icon: 'text-brand-blue-600' },
  { bg: 'bg-brand-magenta-50 group-hover:bg-brand-magenta-100', icon: 'text-brand-magenta-600' },
]

export function HomePage() {
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

  const categories = categoriesData?.data.data ?? []
  const featured = featuredData?.data.data ?? []
  const offers = offersData?.data.data ?? []

  return (
    <main>
      {/* Promociones — lo primero que se ve al abrir la app, no una portada
          de "landing page" con copy publicitario que ya no aporta nada a
          alguien que abre esto como una app hecha para volver seguido. */}
      <div className="pt-3">
        <PromoCarousel offers={offers} />
      </div>

      {/* Categorías — acceso rápido tipo app (ícono uniforme + nombre), no
          una vitrina de fotos de productos sueltos. */}
      {categories.length > 0 && (
        <section className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Reveal><h2 className="text-lg font-bold mb-4 text-paper-ink">Categorías</h2></Reveal>
          <StaggerGroup className="flex overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory gap-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10">
            <StaggerItem className="shrink-0 w-16 snap-start sm:w-auto">
              <MotionLink to="/catalogo" whileTap={{ scale: 0.94 }}
                className="group flex flex-col items-center gap-2 text-center">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-brand-green-600 group-hover:bg-brand-green-700 flex items-center justify-center transition-colors shadow-sm">
                  <LayoutGrid className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <span className="text-xs font-bold text-paper-ink leading-tight">Todo</span>
              </MotionLink>
            </StaggerItem>
            {categories.map((cat, i) => {
              const Icon = getCategoryIcon(cat.name)
              const accent = TILE_ACCENTS[i % TILE_ACCENTS.length]
              return (
                <StaggerItem key={cat.id} className="shrink-0 w-16 snap-start sm:w-auto">
                  <MotionLink to={`/catalogo?categoryId=${cat.id}`} whileTap={{ scale: 0.94 }}
                    className="group flex flex-col items-center gap-2 text-center">
                    <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center transition-colors ${accent.bg}`}>
                      <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${accent.icon}`} />
                    </div>
                    <span className="text-xs font-medium text-paper-ink-soft leading-tight line-clamp-2">{cat.name}</span>
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
          <h2 className="text-xl font-bold text-paper-ink flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />Los más vendidos
          </h2>
          <Link to="/catalogo" className="text-brand-blue-600 hover:text-brand-blue-700 text-sm flex items-center gap-1 transition-colors group">
            Ver todos <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
        <StaggerGroup className="flex overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory gap-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 sm:gap-4">
          {featured.map(product => (
            <StaggerItem key={product.id} className="shrink-0 w-40 snap-start sm:w-auto">
              <ProductCard product={product} />
            </StaggerItem>
          ))}
        </StaggerGroup>
        {featured.length === 0 && (
          <div className="text-center py-16 text-paper-ink-ghost">
            <p>Cargando productos...</p>
          </div>
        )}
      </section>

      {/* Footer — info de referencia (ubicación, horario, pagos), no una
          sección más de venta. */}
      <footer className="border-t border-paper-line bg-white">
        <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm text-paper-ink-soft">
          <div>
            <img src="/logo.png" alt="Minimarket Marc" className="h-8 w-auto mb-3" />
            <p>Tu minimarket de confianza en Pachacamac.</p>
          </div>
          <div>
            <p className="text-paper-ink font-medium mb-3">Ubicación</p>
            <p>{STORE_ADDRESS}</p>
            <p className="mt-1">Lun–Dom: 7:00 AM – 10:00 PM</p>
          </div>
          <div>
            <p className="text-paper-ink font-medium mb-3">Navegación</p>
            <ul className="space-y-1.5">
              <li><Link to="/catalogo" className="hover:text-brand-green-600 transition-colors">Catálogo</Link></li>
              <li><Link to="/ofertas" className="hover:text-brand-green-600 transition-colors">Ofertas</Link></li>
              <li><Link to="/mis-pedidos" className="hover:text-brand-green-600 transition-colors">Mi cuenta / Mis pedidos</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-paper-ink font-medium mb-3">Contacto y pagos</p>
            <p>WhatsApp: 930 555 831</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="bg-paper-surface rounded-full px-2.5 py-1 text-xs font-medium text-paper-ink-soft">Yape</span>
              <span className="bg-paper-surface rounded-full px-2.5 py-1 text-xs font-medium text-paper-ink-soft">Efectivo</span>
            </div>
          </div>
        </div>
        <div className="border-t border-paper-line px-4 py-4 text-center text-xs text-paper-ink-ghost">
          © 2026 TIENDA MARC — Todos los derechos reservados
        </div>
      </footer>
    </main>
  )
}
