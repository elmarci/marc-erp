import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LocationPermissionState = 'unknown' | 'granted' | 'denied'

interface AuthStore {
  isLoggedIn: boolean
  // Se conservan al cerrar sesión para saludar al repartidor por su nombre
  // y no pedirle el número cada vez ("No soy …" los borra).
  nombre: string
  iniciales: string
  telefono: string
  // Sesión real contra el backend (apps/backend/src/modules/delivery): JWT
  // atado a este celular, leído por src/api.ts en cada request.
  token: string | null
  riderId: string | null
  // El PIN aún es de 4 dígitos: la app pide crear uno de 6 antes de seguir.
  pinUpgrade: boolean
  enServicio: boolean
  locationPermission: LocationPermissionState
  comandosVozActivos: boolean
  // Meta de entregas del día (velocímetro de Inicio). La elige el repartidor.
  metaDiaria: number
  login: (r: { telefono: string; nombre: string; iniciales: string; token: string; riderId: string; pinUpgrade: boolean }) => void
  logout: () => void
  forget: () => void
  setPinUpgrade: (v: boolean) => void
  setEnServicio: (v: boolean) => void
  setLocationPermission: (v: LocationPermissionState) => void
  setComandosVoz: (v: boolean) => void
  setMetaDiaria: (v: number) => void
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
      pinUpgrade: false,
      enServicio: false,
      locationPermission: 'unknown',
      comandosVozActivos: true,
      metaDiaria: 12,
      login: ({ telefono, nombre, iniciales, token, riderId, pinUpgrade }) =>
        set({ isLoggedIn: true, telefono, nombre, iniciales, token, riderId, pinUpgrade }),
      logout: () => set({ isLoggedIn: false, enServicio: false, token: null, riderId: null, pinUpgrade: false }),
      forget: () => set({ telefono: '', nombre: '', iniciales: '' }),
      setPinUpgrade: (v) => set({ pinUpgrade: v }),
      setEnServicio: (v) => set({ enServicio: v }),
      setLocationPermission: (v) => set({ locationPermission: v }),
      setComandosVoz: (v) => set({ comandosVozActivos: v }),
      setMetaDiaria: (v) => set({ metaDiaria: Math.min(40, Math.max(1, Math.round(v))) }),
    }),
    {
      name: 'marc-reparto-rider',
      version: 2,
      // Las sesiones de antes de v2 no están atadas a un celular: se cierran
      // y el repartidor vuelve a ingresar (y activa su celular una vez).
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Partial<AuthStore>
        return { ...old, isLoggedIn: false, token: null, riderId: null, pinUpgrade: false, metaDiaria: old.metaDiaria ?? 12 } as AuthStore
      },
    },
  ),
)
