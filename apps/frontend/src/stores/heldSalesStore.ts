import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usePosStore, type CartSnapshot } from './posStore';

/**
 * Ventas en espera: el cajero deja una venta a medias ("el señor fue por
 * algo más") y atiende al siguiente. Se guardan en este equipo (localStorage)
 * para que no se pierdan si se recarga la página; no van al servidor porque
 * aún no son ventas.
 */
export interface HeldSale {
  id: string;
  label: string;
  heldAt: string;
  total: number;
  itemCount: number;
  snapshot: CartSnapshot;
}

interface HeldSalesState {
  held: HeldSale[];
  /** Guarda el carrito actual y lo deja vacío. Devuelve la venta guardada o null si el carrito estaba vacío. */
  holdCurrent: (label?: string) => HeldSale | null;
  /** Retoma una venta. Si hay otra en curso, esa pasa a espera (se intercambian). */
  resume: (id: string) => void;
  remove: (id: string) => void;
}

export const useHeldSalesStore = create<HeldSalesState>()(
  persist(
    (set, get) => ({
      held: [],

      holdCurrent: (label) => {
        const pos = usePosStore.getState();
        if (pos.items.length === 0) return null;
        const n = get().held.length + 1;
        const sale: HeldSale = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: label?.trim() || pos.customerName || `Cliente ${n}`,
          heldAt: new Date().toISOString(),
          total: pos.total,
          itemCount: pos.items.reduce((s, i) => s + i.quantity, 0),
          snapshot: pos.getSnapshot(),
        };
        set({ held: [...get().held, sale] });
        pos.clearCart();
        return sale;
      },

      resume: (id) => {
        const target = get().held.find((h) => h.id === id);
        if (!target) return;
        set({ held: get().held.filter((h) => h.id !== id) });
        get().holdCurrent();
        usePosStore.getState().restoreSnapshot(target.snapshot);
      },

      remove: (id) => set({ held: get().held.filter((h) => h.id !== id) }),
    }),
    { name: 'marc-pos-held-sales' },
  ),
);
