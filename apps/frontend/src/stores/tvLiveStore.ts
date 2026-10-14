import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Preferencias del POS para la TV de la tienda: si se muestra la venta en curso
// al cliente y qué promos se enseñan al lado. Se recuerdan en este equipo, así
// el cajero no tiene que volver a activarlo cada vez que abre el POS.
interface TvLiveState {
  enabled: boolean;
  promoKeys: string[];
  setEnabled: (enabled: boolean) => void;
  setPromoKeys: (keys: string[]) => void;
}

export const useTvLiveStore = create<TvLiveState>()(
  persist(
    (set) => ({
      enabled: false,
      promoKeys: [],
      setEnabled: (enabled) => set({ enabled }),
      setPromoKeys: (promoKeys) => set({ promoKeys }),
    }),
    { name: 'erp-tv-live', storage: createJSONStorage(() => localStorage) },
  ),
);
