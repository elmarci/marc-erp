import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from './api'

// Un ítem marcado con `bundle` viene de un paquete de precio fijo (oferta
// BUNDLE_PRICE/COMBO/BUY_X_GET_Y elegida en AddOfferModal): su `salePrice`
// es sólo un promedio (totalPrice / totalQty), NO un precio real por unidad.
// Por eso estos ítems no deben poder incrementarse/decrementarse sueltos
// desde el carrito (eso permitiría "comprar 1 más" al precio rebajado del
// paquete) — se muestran agrupados y sólo se pueden quitar como grupo.
export interface CartItem {
  product: Product
  quantity: number
  bundle?: { id: string; label: string; totalPrice: number; totalQty: number }
}

interface AddItemResult { addedQuantity: number; finalQuantity: number; capped: boolean }

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (product: Product, qty?: number) => AddItemResult
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => { finalQuantity: number; capped: boolean }
  renameItem: (productId: string, name: string) => void
  // Reemplaza de una sola vez todas las líneas de un paquete (usado al
  // agregar o re-elegir un combo/bundle) — nunca se suma sobre lo anterior.
  setBundle: (bundleId: string, entries: Array<{ product: Product; quantity: number }>, meta: { label: string; totalPrice: number; totalQty: number }) => void
  removeBundle: (bundleId: string) => void
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

      setBundle: (bundleId, entries, meta) => {
        const { items } = get()
        const others = items.filter(i => i.bundle?.id !== bundleId)
        const bundleItems = entries.map(({ product, quantity }) => ({ product, quantity, bundle: { id: bundleId, ...meta } }))
        set({ items: [...others, ...bundleItems] })
      },

      removeBundle: (bundleId) =>
        set(s => ({ items: s.items.filter(i => i.bundle?.id !== bundleId) })),

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
