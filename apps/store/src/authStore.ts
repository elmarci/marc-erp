import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CustomerProfile {
  id: string
  name: string
  phone: string
  email: string | null
  addresses?: Array<{
    id: string; label: string; address: string;
    district: string; reference: string | null; isDefault: boolean;
  }>
}

interface AuthStore {
  customer: CustomerProfile | null
  token: string | null
  setAuth: (customer: CustomerProfile, token: string) => void
  updateProfile: (c: Partial<CustomerProfile>) => void
  logout: () => void
  isLoggedIn: boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      customer: null,
      token: null,
      isLoggedIn: false,
      setAuth: (customer, token) => set({ customer, token, isLoggedIn: true }),
      updateProfile: (c) => set(s => ({ customer: s.customer ? { ...s.customer, ...c } : null })),
      logout: () => set({ customer: null, token: null, isLoggedIn: false }),
    }),
    { name: 'marc-store-auth' }
  )
)
