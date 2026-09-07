import { useLayoutEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { InstallAppBanner } from './components/InstallAppBanner'
import { NotifyOptInBanner } from './components/NotifyOptInBanner'
import { MobileTabBar } from './components/MobileTabBar'
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

export default function App() {
  const location = useLocation()
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const guestMode = useAuthStore(s => s.guestMode)

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

  // El registro es la vía principal (perfil real, historial, puntos) pero
  // quien no quiera crear cuenta puede seguir como invitado y pedir por
  // WhatsApp desde el carrito.
  if (!isLoggedIn && !guestMode) return <AuthGate />

  return (
    <div className="min-h-screen bg-paper-bg">
      <Header />
      <CartDrawer />
      <InstallAppBanner />
      <NotifyOptInBanner />
      {/* Entorno de navegación con profundidad real: cada pantalla entra
          girando levemente en el eje Y con perspectiva (no un simple
          slide 2D), como una tarjeta que rota hacia el centro — se nota
          más en pantallas donde el cambio es grande (Home → Producto,
          Categorías → Catálogo) sin marear en las transiciones chicas
          porque el ángulo es sutil (10°) y dura poco (0.42s). Respeta
          prefers-reduced-motion — Framer Motion baja la animación a un
          simple fade cuando el sistema lo pide. */}
      <div style={{ perspective: 1400 }} className="overflow-x-clip">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, rotateY: -10, x: 32, scale: 0.97 }}
            animate={{ opacity: 1, rotateY: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 10, x: -24, scale: 0.97 }}
            transition={{ duration: 0.42, ease: [0.22, 0.85, 0.25, 1] }}
            style={{ transformOrigin: 'center center', transformStyle: 'preserve-3d' }}
            className="pb-16 md:pb-0"
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
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
      <MobileTabBar />
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/pedido') && <VoiceShoppingListButton />}
      {!location.pathname.startsWith('/checkout') && <WhatsAppFAB />}
    </div>
  )
}
