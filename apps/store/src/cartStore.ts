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
  addItem: (product: Product, qty?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (product, qty = 1) => {
        set(s => {
          const existing = s.items.find(i => i.product.id === product.id)
          // Bulk products always replace (each add is a new weight entry)
          if (product.isBulk) {
            if (existing) {
              return { items: s.items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i) }
            }
            return { items: [...s.items, { product, quantity: qty }] }
          }
          if (existing) {
            return { items: s.items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i) }
          }
          return { items: [...s.items, { product, quantity: qty }] }
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
    }),
    { name: 'marc-cart', partialize: (s) => ({ items: s.items }) }
  )
)

// Selectors — use these in components
export const cartTotal = (items: CartItem[]) =>
  items.reduce((s, i) => s + i.product.salePrice * i.quantity, 0)

export const cartCount = (items: CartItem[]) =>
  items.reduce((s, i) => s + i.quantity, 0)
