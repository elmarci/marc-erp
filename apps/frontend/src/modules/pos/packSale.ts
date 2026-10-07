import { toast } from 'sonner';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency } from '@/lib/utils';

// Venta por paquete/caja (Product.packSize): el carrito guarda la línea del
// paquete aparte de la de unidades sueltas — misma id con este sufijo — para
// que "2 unidades + 1 paquete" del mismo producto convivan en el ticket.
// Al cobrar, PosPage le quita el sufijo y manda sellAsPack al backend.
export const PACK_SUFFIX = '#pack';

export interface PackInfo {
  packSize?: number | null;
  packPrice?: number | string | null;
  packLabel?: string | null;
  packBarcode?: string | null;
}

// Producto tal como lo ve una oferta: si la promo es sobre el paquete/caja
// (asPack), el producto "efectivo" ya viene con el precio del paquete, el stock
// contado en paquetes y el nombre con su presentación — así todo el cálculo de
// la oferta (precios, 2x1, combos, tope de stock) sirve igual con paquetes que
// con unidades. isPack marca que al agregar al carrito hay que usar la línea
// del paquete.
export function presentForOffer<P extends { id: string; name: string; salePrice: number; barcode: string | null; currentStock: number } & PackInfo>(
  product: P, asPack?: boolean,
): P & { isPack?: boolean } {
  if (!asPack || !product.packSize || product.packPrice == null) return product;
  const label = product.packLabel?.trim() || 'Paquete';
  return {
    ...product,
    name: `${product.name} (${label} x${product.packSize})`,
    salePrice: Number(product.packPrice),
    barcode: product.packBarcode ?? product.barcode,
    currentStock: Math.floor(product.currentStock / product.packSize),
    isPack: true,
  };
}

// Campos extra de addItem para una línea de oferta cuando es de paquete.
export function packLineFields(product: { id: string; isPack?: boolean }) {
  return product.isPack
    ? { productId: product.id + PACK_SUFFIX, sellAsPack: true as const, unit: 'paq' }
    : { productId: product.id };
}

export function hasPack(p: PackInfo): boolean {
  return !!p.packSize && p.packSize >= 2 && p.packPrice != null && Number(p.packPrice) > 0;
}

// Unidades de stock que quedan para agregar unidades sueltas, descontando lo
// que ya está reservado en el carrito como paquetes del mismo producto.
export function unitStockLeft(productId: string, currentStock: number, packSize?: number | null): number {
  if (!packSize) return currentStock;
  const packLine = usePosStore.getState().items.find((i) => i.productId === productId + PACK_SUFFIX);
  return currentStock - (packLine?.quantity ?? 0) * packSize;
}

export function addPackToCart(
  product: { id: string; name: string; barcode: string | null; currentStock: number } & PackInfo,
  opts: { offline?: boolean } = {},
) {
  const size = product.packSize as number;
  const price = Number(product.packPrice);
  const label = product.packLabel?.trim() || 'Paquete';

  // Paquetes posibles = (stock − unidades sueltas ya en el carrito) ÷ unidades por paquete.
  const unitLine = usePosStore.getState().items.find((i) => i.productId === product.id);
  const stockInPacks = Math.floor((product.currentStock - (unitLine?.quantity ?? 0)) / size);
  if (stockInPacks <= 0) {
    toast.error(`No alcanza el stock para un ${label.toLowerCase()} de "${product.name}" (trae ${size} unidades, quedan ${product.currentStock}).`);
    return;
  }

  const result = usePosStore.getState().addItem({
    productId: product.id + PACK_SUFFIX,
    name: `${product.name} (${label} x${size})`,
    barcode: product.packBarcode ?? product.barcode,
    quantity: 1,
    unitPrice: price,
    originalPrice: price,
    discountAmount: 0,
    discountPercent: 0,
    stock: stockInPacks,
    unit: 'paq',
    sellAsPack: true,
  });
  if (result.addedQuantity <= 0) {
    toast.error(`No hay stock para otro ${label.toLowerCase()} de "${product.name}".`);
    return;
  }
  toast.success(`${label} x${size} de ${product.name} — ${formatCurrency(price)}${opts.offline ? ' (sin conexión)' : ''}`, { duration: 1500 });
}
