import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from './api'

export interface CartItem {
  product: Product
  quantity: number
}

interface AddItemResult { addedQuantity: number; finalQuantity: number; capped: boolean }

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (product: Product, qty?: number) => AddItemResult
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => { finalQuantity: number; capped: boolean }
  renameItem: (productId: string, name: string) => void
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
        const { items } = get()
        // Use full id match (supports bundle IDs like "bundle-offerX-productY")
        const existing = items.find(i => i.product.id === product.id)
        const currentQty = existing?.quantity ?? 0
        const stock = product.currentStock
        const finalQty = Math.round(Math.min(currentQty + qty, stock) * 100) / 100

        if (finalQty <= currentQty) {
          return { addedQuantity: 0, finalQuantity: currentQty, capped: true }
        }

        set({
          items: existing
            ? items.map(i => i.product.id === product.id ? { ...i, product, quantity: finalQty } : i)
            : [...items, { product, quantity: finalQty }],
        })
        return { addedQuantity: finalQty - currentQty, finalQuantity: finalQty, capped: finalQty < currentQty + qty }
      },

      removeItem: (productId) =>
        set(s => ({ items: s.items.filter(i => i.product.id !== productId) })),

      renameItem: (productId, name) =>
        set(s => ({ items: s.items.map(i => i.product.id === productId ? { ...i, product: { ...i.product, name } } : i) })),

      updateQuantity: (productId, qty) => {
        if (qty <= 0) { get().removeItem(productId); return { finalQuantity: 0, capped: false } }
        const { items } = get()
        const item = items.find(i => i.product.id === productId)
        const finalQty = item ? Math.min(qty, item.product.currentStock) : qty
        set({ items: items.map(i => i.product.id === productId ? { ...i, quantity: finalQty } : i) })
        return { finalQuantity: finalQty, capped: finalQty < qty }
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
