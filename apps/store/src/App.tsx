import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { InstallAppBanner } from './components/InstallAppBanner'
import { MobileTabBar } from './components/MobileTabBar'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { ProductPage } from './pages/ProductPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderConfirmPage } from './pages/OrderConfirmPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { OffersPage } from './pages/OffersPage'

export default function App() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-paper-bg">
      <Header />
      <CartDrawer />
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
    </div>
  )
}
