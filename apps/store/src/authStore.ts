import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CustomerProfile {
  phone: string
  name: string
  email?: string
}

interface AuthStore {
  customer: CustomerProfile | null
  setCustomer: (c: CustomerProfile) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      customer: null,
      setCustomer: (c) => set({ customer: c }),
      logout: () => set({ customer: null }),
    }),
    { name: 'marc-customer' }
  )
)
