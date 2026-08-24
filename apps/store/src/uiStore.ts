import { create } from 'zustand'

// Estado global mínimo para overlays compartidos entre componentes que no
// tienen relación padre/hijo directa (ej. el tab bar inferior y el header
// necesitan abrir el mismo CategoryDrawer, montado una sola vez en App).
interface UIStore {
  isCategoryDrawerOpen: boolean
  openCategoryDrawer: () => void
  closeCategoryDrawer: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  isCategoryDrawerOpen: false,
  openCategoryDrawer: () => set({ isCategoryDrawerOpen: true }),
  closeCategoryDrawer: () => set({ isCategoryDrawerOpen: false }),
}))
