import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface QueuedSale {
  localId: string;
  payload: Record<string, unknown>; // mismo body que normalmente recibe POST /sales
  displayNumber: string; // "OFFLINE-xxxxxx" — para mostrar/imprimir antes de tener el número real del servidor
  createdAt: string;
  status: 'pending' | 'failed';
  error?: string;
}

interface OfflineSalesState {
  queue: QueuedSale[];
  enqueue: (payload: Record<string, unknown>) => QueuedSale;
  markFailed: (localId: string, error: string) => void;
  markPending: (localId: string) => void;
  remove: (localId: string) => void;
}

// Cola de ventas hechas sin conexión — persistida en localStorage para que
// sobreviva un recargo/reinicio del navegador mientras no hay internet
// (el service worker se encarga de que la app misma siga cargando).
export const useOfflineSalesStore = create<OfflineSalesState>()(
  persist(
    (set, get) => ({
      queue: [],

      enqueue: (payload) => {
        const sale: QueuedSale = {
          localId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          payload,
          displayNumber: `OFFLINE-${new Date().getTime().toString().slice(-8)}`,
          createdAt: new Date().toISOString(),
          status: 'pending',
        };
        set({ queue: [...get().queue, sale] });
        return sale;
      },

      markFailed: (localId, error) => {
        set({ queue: get().queue.map((s) => (s.localId === localId ? { ...s, status: 'failed', error } : s)) });
      },

      markPending: (localId) => {
        set({ queue: get().queue.map((s) => (s.localId === localId ? { ...s, status: 'pending', error: undefined } : s)) });
      },

      remove: (localId) => {
        set({ queue: get().queue.filter((s) => s.localId !== localId) });
      },
    }),
    {
      name: 'erp-offline-sales',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
