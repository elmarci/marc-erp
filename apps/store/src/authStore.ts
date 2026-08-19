import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CustomerProfile {
  id?: string
  phone: string
  name: string
  email?: string | null
}

interface AuthStore {
  customer: CustomerProfile | null
  token?: string | null
  isLoggedIn?: boolean
  // Quien no quiere crear cuenta puede seguir navegando y pedir por
  // WhatsApp — el registro es la vía principal, no la única.
  guestMode?: boolean
  setCustomer: (c: CustomerProfile) => void
  setAuth: (c: CustomerProfile, token: string) => void
  logout: () => void
  continueAsGuest: () => void
  exitGuestMode: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      customer: null,
      token: null,
      isLoggedIn: false,
      guestMode: false,
      setCustomer: (c) => set({ customer: c }),
      setAuth: (c, token) => set({ customer: c, token, isLoggedIn: true, guestMode: false }),
      logout: () => set({ customer: null, token: null, isLoggedIn: false, guestMode: false }),
      continueAsGuest: () => set({ guestMode: true }),
      exitGuestMode: () => set({ guestMode: false }),
    }),
    { name: 'marc-customer' }
  )
)
