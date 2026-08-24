import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { CategoryDrawer } from './components/CategoryDrawer'
import { InstallAppBanner } from './components/InstallAppBanner'
import { MobileTabBar } from './components/MobileTabBar'
import { VoiceShoppingListButton } from './components/VoiceShoppingListModal'
import { WhatsAppFAB } from './components/WhatsAppFAB'
import { AuthGate } from './pages/AuthGate'
import { useAuthStore } from './authStore'
import { useUIStore } from './uiStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { ProductPage } from './pages/ProductPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderConfirmPage } from './pages/OrderConfirmPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { OffersPage } from './pages/OffersPage'

export default function App() {
  const location = useLocation()
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const guestMode = useAuthStore(s => s.guestMode)
  const isCategoryDrawerOpen = useUIStore(s => s.isCategoryDrawerOpen)
  const closeCategoryDrawer = useUIStore(s => s.closeCategoryDrawer)

  // El registro es la vía principal (perfil real, historial, puntos) pero
  // quien no quiera crear cuenta puede seguir como invitado y pedir por
  // WhatsApp desde el carrito.
  if (!isLoggedIn && !guestMode) return <AuthGate />

  return (
    <div className="min-h-screen bg-paper-bg">
      <Header />
      <CartDrawer />
      {isCategoryDrawerOpen && <CategoryDrawer onClose={closeCategoryDrawer} />}
      <InstallAppBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          className="pb-16 md:pb-0"
        >
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalogo" element={<CatalogPage />} />
            <Route path="/producto/:id" element={<ProductPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pedido/:orderNumber" element={<OrderConfirmPage />} />
            <Route path="/mis-pedidos" element={<TrackOrderPage />} />
            <Route path="/ofertas" element={<OffersPage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
      <MobileTabBar />
      {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/pedido') && <VoiceShoppingListButton />}
      {!location.pathname.startsWith('/checkout') && <WhatsAppFAB />}
    </div>
  )
}
