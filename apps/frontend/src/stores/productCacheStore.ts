import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CachedProduct {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  currentStock: number;
  imageUrl: string | null;
  isBulk: boolean;
  bulkUnit: string | null;
  bottleDeposit?: number;
  // Venta por paquete/caja: sin esto, offline el código del paquete agregaría la unidad.
  packSize?: number | null;
  packPrice?: number | string | null;
  packLabel?: string | null;
  packBarcode?: string | null;
  category: { name: string };
}

interface ProductCacheState {
  products: Record<string, CachedProduct>;
  lastSyncedAt: string | null;
  lastFullSyncAt: string | null;
  setProducts: (list: CachedProduct[], serverTime?: string) => void;
  mergeProducts: (changed: CachedProduct[], removedIds: string[], serverTime: string) => void;
  findByBarcode: (barcode: string) => (CachedProduct & { matchedPack?: boolean }) | undefined;
}

// Copia local del catálogo activo, persistida en localStorage — el escaneo
// de código de barras en el POS depende de encontrar el producto YA, no
// puede esperar a que vuelva el internet. Se refresca en segundo plano
// mientras haya conexión (ver PosPage) y sirve de respaldo cuando se cae.
export const useProductCacheStore = create<ProductCacheState>()(
  persist(
    (set, get) => ({
      products: {},
      lastSyncedAt: null,
      lastFullSyncAt: null,

      setProducts: (list, serverTime) => {
        const products: Record<string, CachedProduct> = {};
        for (const p of list) products[p.id] = p;
        const at = serverTime ?? new Date().toISOString();
        set({ products, lastSyncedAt: at, lastFullSyncAt: at });
      },

      // Solo lo que cambió desde la última vez (ver GET /products/pos-sync).
      mergeProducts: (changed, removedIds, serverTime) => {
        const products = { ...get().products };
        for (const id of removedIds) delete products[id];
        for (const p of changed) products[p.id] = p;
        set({ products, lastSyncedAt: serverTime });
      },

      findByBarcode: (barcode) => {
        const found = Object.values(get().products).find((p) => p.barcode === barcode || p.packBarcode === barcode);
        return found ? { ...found, matchedPack: !!found.packSize && found.packBarcode === barcode } : undefined;
      },
    }),
    {
      name: 'erp-product-cache',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
