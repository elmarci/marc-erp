import { lazy, Suspense, useLayoutEffect, type ComponentType } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { InstallAppBanner } from './components/InstallAppBanner'
import { NotifyOptInBanner } from './components/NotifyOptInBanner'
import { MobileTabBar } from './components/MobileTabBar'
import { CartBar, VOICE_LIST_ROUTES } from './components/CartBar'
import { VoiceShoppingListButton } from './components/VoiceShoppingListModal'
import { WhatsAppFAB } from './components/WhatsAppFAB'
import { useAuthStore } from './authStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'

// Velocidad: el inicio y el catálogo van en el archivo principal; el resto de
// pantallas se descarga recién cuando el cliente entra a ellas (y el service
// worker las deja guardadas para la próxima). Así la primera carga baja
// mucho menos en datos móviles.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then(m => ({ default: m[name] })))
}
const AuthGate = page(() => import('./pages/AuthGate'), 'AuthGate')
const CategoriesPage = page(() => import('./pages/CategoriesPage'), 'CategoriesPage')
const ProductPage = page(() => import('./pages/ProductPage'), 'ProductPage')
const CheckoutPage = page(() => import('./pages/CheckoutPage'), 'CheckoutPage')
const OrderConfirmPage = page(() => import('./pages/OrderConfirmPage'), 'OrderConfirmPage')
const TrackOrderPage = page(() => import('./pages/TrackOrderPage'), 'TrackOrderPage')
const OffersPage = page(() => import('./pages/OffersPage'), 'OffersPage')
const BasketPage = page(() => import('./pages/BasketPage'), 'BasketPage')
const TvPage = page(() => import('./pages/TvPage'), 'TvPage')
const PrivacyPage = page(() => import('./pages/LegalPage'), 'PrivacyPage')
const TermsPage = page(() => import('./pages/LegalPage'), 'TermsPage')

function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" aria-label="Cargando">
      <div className="h-9 w-9 border-2 border-brand-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)

  // Sin esto, el navegador conserva el scroll de la pantalla anterior — al
  // entrar a una categoría/subcategoría (o cambiar de una a otra) el feed
  // nuevo aparecía a mitad de página en vez de arriba. Se salta sólo cuando
  // la navegación trae un #hash (ej. desde el menú lateral a
  // /mis-pedidos#canje), porque ahí el scroll a esa sección puntual lo
  // maneja la propia página.
  useLayoutEffect(() => {
    if (location.hash) return
    window.scrollTo(0, 0)
  }, [location.pathname, location.search, location.hash])

  // Pantalla de la TV de la tienda: pública, sin login ni cabecera/banners de
  // la app — nadie la maneja, solo muestra ofertas y precios en loop.
  if (location.pathname === '/tv') return <Suspense fallback={null}><TvPage /></Suspense>

  // Políticas: públicas y sin login — Google las exige para el inicio de
  // sesión con Google y deben poder leerse antes de registrarse.
  if (location.pathname === '/privacidad') return <Suspense fallback={<PageLoading />}><PrivacyPage /></Suspense>
  if (location.pathname === '/terminos') return <Suspense fallback={<PageLoading />}><TermsPage /></Suspense>

  // La tienda es abierta: catálogo, carrito y checkout funcionan sin
  // cuenta. El ingreso es una pantalla propia a la que se llega solo cuando
  // hace falta (mis pedidos, puntos, direcciones guardadas).
  if (location.pathname === '/ingresar') {
    return isLoggedIn ? <Navigate to="/" replace /> : <Suspense fallback={<PageLoading />}><AuthGate /></Suspense>
  }

  return (
    <div className="min-h-screen bg-paper-bg">
      <Header />
      <CartDrawer />
      <InstallAppBanner />
      <NotifyOptInBanner />
      {/* Transición entre pantallas — deliberadamente discreta: la versión
          anterior (rotación 3D + desplazamiento + escala a la vez, 0.42s)
          se sintió "de diapositiva de PowerPoint" en testeo real. Ahora es
          sólo un fundido + un desplazamiento vertical chico (8px), rápido
          (0.18s) — se nota que cambió de pantalla sin llamar la atención
          sobre la animación misma. Respeta prefers-reduced-motion (Framer
          Motion lo baja a un fade puro cuando el sistema lo pide). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="pb-36 md:pb-0"
        >
          <Suspense fallback={<PageLoading />}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalogo" element={<CatalogPage />} />
            <Route path="/categorias" element={<CategoriesPage />} />
            <Route path="/producto/:id" element={<ProductPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pedido/:orderNumber" element={<OrderConfirmPage />} />
            <Route path="/mis-pedidos" element={<TrackOrderPage />} />
            <Route path="/ofertas" element={<OffersPage />} />
            <Route path="/canasta" element={<BasketPage />} />
          </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      {/* En pago, canasta, confirmación y cuenta no va: esas pantallas ya traen su propio botón principal y su WhatsApp. */}
      {!['/checkout', '/canasta', '/pedido', '/mis-pedidos'].some(p => location.pathname.startsWith(p)) && <CartBar />}
      <MobileTabBar />
      {/* /canasta tiene su propia barra fija de total y su propio micrófono:
          los botones flotantes la tapaban. */}
      {/* Lista por voz: solo donde se elige qué comprar, para no tapar botones en ficha, cuenta o pago. */}
      {VOICE_LIST_ROUTES.includes(location.pathname) && <VoiceShoppingListButton />}
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/canasta') && <WhatsAppFAB />}
    </div>
  )
}
