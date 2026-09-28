import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LocationPermissionState = 'unknown' | 'granted' | 'denied'

interface AuthStore {
  isLoggedIn: boolean
  nombre: string
  iniciales: string
  telefono: string
  // Sesión real contra el backend (apps/backend/src/modules/delivery) — el
  // JWT del biker, leído por src/api.ts en cada request.
  token: string | null
  riderId: string | null
  // "En servicio" y el permiso de ubicación se persisten entre sesiones —
  // pedido explícito del spec de diseño (sección 4): no son solo de UI.
  enServicio: boolean
  locationPermission: LocationPermissionState
  comandosVozActivos: boolean
  login: (telefono: string, nombre: string, iniciales: string, token: string, riderId: string) => void
  logout: () => void
  setEnServicio: (v: boolean) => void
  setLocationPermission: (v: LocationPermissionState) => void
  setComandosVoz: (v: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      nombre: '',
      iniciales: '',
      telefono: '',
      token: null,
      riderId: null,
      enServicio: false,
      locationPermission: 'unknown',
      comandosVozActivos: true,
      login: (telefono, nombre, iniciales, token, riderId) =>
        set({ isLoggedIn: true, telefono, nombre, iniciales, token, riderId }),
      logout: () => set({ isLoggedIn: false, enServicio: false, token: null, riderId: null }),
      setEnServicio: (v) => set({ enServicio: v }),
      setLocationPermission: (v) => set({ locationPermission: v }),
      setComandosVoz: (v) => set({ comandosVozActivos: v }),
    }),
    { name: 'marc-reparto-rider' }
  )
)
