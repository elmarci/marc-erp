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
  setCustomer: (c: CustomerProfile) => void
  setAuth: (c: CustomerProfile, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      customer: null,
      token: null,
      isLoggedIn: false,
      setCustomer: (c) => set({ customer: c }),
      setAuth: (c, token) => set({ customer: c, token, isLoggedIn: true }),
      logout: () => set({ customer: null, token: null, isLoggedIn: false }),
    }),
    { name: 'marc-customer' }
  )
)
