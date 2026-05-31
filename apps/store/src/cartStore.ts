import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from './api'

export interface CartItem {
  product: Product
  quantity: number
}

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
  total: number
  count: number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (product) => {
        set(s => {
          const existing = s.items.find(i => i.product.id === product.id)
          if (existing) {
            return { items: s.items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i) }
          }
          return { items: [...s.items, { product, quantity: 1 }] }
        })
      },

      removeItem: (productId) =>
        set(s => ({ items: s.items.filter(i => i.product.id !== productId) })),

      updateQuantity: (productId, qty) => {
        if (qty <= 0) { get().removeItem(productId); return }
        set(s => ({ items: s.items.map(i => i.product.id === productId ? { ...i, quantity: qty } : i) }))
      },

      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      get total() { return get().items.reduce((s, i) => s + i.product.salePrice * i.quantity, 0) },
      get count() { return get().items.reduce((s, i) => s + i.quantity, 0) },
    }),
    { name: 'marc-cart', partialize: (s) => ({ items: s.items }) }
  )
)
