import { create } from 'zustand'

// Estado de UI efímero (no se persiste) — hoy solo el drawer de navegación
// rápida, abierto desde el botón de menú en cada TopBar.
interface UiStore {
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}))
