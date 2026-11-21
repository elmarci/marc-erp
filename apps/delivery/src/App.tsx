import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from './authStore'
import { setSessionEndedHandler } from './api'
import { BottomNav } from './components/BottomNav'
import { NavDrawer } from './components/NavDrawer'
import { LoginPage } from './pages/LoginPage'
import { CambiarPinPage } from './pages/CambiarPinPage'
import { LocationPermissionPage } from './pages/LocationPermissionPage'
import { EstadoPage } from './pages/EstadoPage'
import { PedidosPage } from './pages/PedidosPage'
import { PedidoDetallePage } from './pages/PedidoDetallePage'
import { ConfirmacionEntregaPage } from './pages/ConfirmacionEntregaPage'
import { HistorialPage } from './pages/HistorialPage'
import { BilleteraPage } from './pages/BilleteraPage'
import { PerfilPage } from './pages/PerfilPage'

function WithTabs({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">{children}</div>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const pinUpgrade = useAuthStore((s) => s.pinUpgrade)

  useEffect(() => {
    setSessionEndedHandler(() => {
      if (!useAuthStore.getState().isLoggedIn) return
      useAuthStore.getState().logout()
      toast('Tu sesión se cerró. Vuelve a ingresar con tu PIN.', { id: 'session-ended' })
    })
  }, [])

  return (
    <div className="flex justify-center bg-line sm:py-6">
      <div className="relative flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-bg sm:h-[min(844px,90dvh)] sm:rounded-[32px] sm:shadow-xl">
        {!isLoggedIn ? (
          <Routes>
            <Route path="*" element={<LoginPage />} />
          </Routes>
        ) : pinUpgrade ? (
          <Routes>
            <Route path="*" element={<CambiarPinPage obligatorio />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/ubicacion" element={<LocationPermissionPage />} />
            <Route path="/estado" element={<WithTabs><EstadoPage /></WithTabs>} />
            <Route path="/pedidos" element={<WithTabs><PedidosPage /></WithTabs>} />
            <Route path="/pedidos/:id" element={<PedidoDetallePage />} />
            <Route path="/pedidos/:id/entregado" element={<ConfirmacionEntregaPage />} />
            <Route path="/historial" element={<WithTabs><HistorialPage /></WithTabs>} />
            <Route path="/billetera" element={<WithTabs><BilleteraPage /></WithTabs>} />
            <Route path="/perfil" element={<WithTabs><PerfilPage /></WithTabs>} />
            <Route path="/nuevo-pin" element={<CambiarPinPage />} />
            <Route path="/login" element={<Navigate to="/estado" replace />} />
            <Route path="*" element={<Navigate to="/estado" replace />} />
          </Routes>
        )}
        {isLoggedIn && !pinUpgrade && <NavDrawer />}
      </div>
    </div>
  )
}
