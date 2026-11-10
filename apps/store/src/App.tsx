import { useLayoutEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { InstallAppBanner } from './components/InstallAppBanner'
import { NotifyOptInBanner } from './components/NotifyOptInBanner'
import { MobileTabBar } from './components/MobileTabBar'
import { CartBar } from './components/CartBar'
import { VoiceShoppingListButton } from './components/VoiceShoppingListModal'
import { WhatsAppFAB } from './components/WhatsAppFAB'
import { AuthGate } from './pages/AuthGate'
import { useAuthStore } from './authStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { ProductPage } from './pages/ProductPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderConfirmPage } from './pages/OrderConfirmPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { OffersPage } from './pages/OffersPage'
import { BasketPage } from './pages/BasketPage'
import { TvPage } from './pages/TvPage'
import { PrivacyPage, TermsPage } from './pages/LegalPage'

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
  if (location.pathname === '/tv') return <TvPage />

  // Políticas: públicas y sin login — Google las exige para el inicio de
  // sesión con Google y deben poder leerse antes de registrarse.
  if (location.pathname === '/privacidad') return <PrivacyPage />
  if (location.pathname === '/terminos') return <TermsPage />

  // La tienda es abierta: catálogo, carrito y checkout funcionan sin
  // cuenta. El ingreso es una pantalla propia a la que se llega solo cuando
  // hace falta (mis pedidos, puntos, direcciones guardadas).
  if (location.pathname === '/ingresar') {
    return isLoggedIn ? <Navigate to="/" replace /> : <AuthGate />
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
        </motion.div>
      </AnimatePresence>
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/canasta') && <CartBar />}
      <MobileTabBar />
      {/* /canasta tiene su propia barra fija de total y su propio micrófono:
          los botones flotantes la tapaban. */}
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/pedido') && !location.pathname.startsWith('/canasta') && <VoiceShoppingListButton />}
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/canasta') && <WhatsAppFAB />}
    </div>
  )
}
