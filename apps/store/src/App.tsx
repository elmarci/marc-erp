import { Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { ProductPage } from './pages/ProductPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { OrderConfirmPage } from './pages/OrderConfirmPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { OffersPage } from './pages/OffersPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <CartDrawer />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/producto/:id" element={<ProductPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/pedido/:orderNumber" element={<OrderConfirmPage />} />
        <Route path="/mis-pedidos" element={<TrackOrderPage />} />
        <Route path="/ofertas" element={<OffersPage />} />
      </Routes>
    </div>
  )
}
