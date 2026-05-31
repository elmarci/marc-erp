import { Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderConfirmPage } from './pages/OrderConfirmPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { OffersPage } from './pages/OffersPage'

export default function App() {
  return (
    <div className="min-h-screen bg-black">
      <Header />
      <CartDrawer />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/pedido/:orderNumber" element={<OrderConfirmPage />} />
        <Route path="/mis-pedidos" element={<TrackOrderPage />} />
        <Route path="/ofertas" element={<OffersPage />} />
      </Routes>
    </div>
  )
}
