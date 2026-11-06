import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency } from '@/lib/utils';
import { presentForOffer, packLineFields, type PackInfo } from './packSale';

export interface OfferProduct {
  id: string; name: string; salePrice: number; barcode: string | null; currentStock: number;
  imageUrl: string | null; isBulk: boolean; bulkUnit: string | null; isPack?: boolean; category: { name: string };
}

export interface Offer {
  id: string; name: string; type: string; value: number;
  valueType: 'PERCENTAGE' | 'FIXED' | null;
  buyQuantity: number | null; getQuantity: number | null;
  isActive: boolean; storeBadge: string | null; priority?: number;
  startDate?: string; endDate?: string | null;
  startTime?: string | null; endTime?: string | null; daysOfWeek?: number[];
  products: Array<{ quantity?: number; asPack?: boolean; product: OfferProduct & PackInfo }>;
}

interface HappyHourPromo {
  id: string; name: string; value: number; valueType: 'PERCENTAGE' | 'FIXED' | null;
  priority: number;
  products: Array<{ product: { id: string; salePrice: number } }>;
}

/** Precio rebajado que se aplica solo al vender el producto por unidad. */
export interface AutoDeal { effectivePrice: number; label: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

// Misma regla que el backend para la Hora feliz (hora Lima, UTC-5 fijo):
// dentro de fechas, del día de la semana y del horario, si los tiene.
function isLiveNow(o: Offer): boolean {
  const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const hhmm = lima.toISOString().slice(11, 16);
  const today = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate());
  if (o.startDate && new Date(o.startDate).getTime() > lima.getTime()) return false;
  if (o.endDate && new Date(o.endDate).getTime() < today) return false;
  if (o.daysOfWeek?.length && !o.daysOfWeek.includes(lima.getUTCDay())) return false;
  if (o.startTime && hhmm < o.startTime) return false;
  if (o.endTime && hhmm > o.endTime) return false;
  return true;
}

/** Etiqueta corta de la oferta: "20% OFF", "Lleva 3 paga 2", "Combo S/ 4.30"… */
export function offerTag(o: Offer): string {
  switch (o.type) {
    case 'PERCENTAGE_DISCOUNT': return `${Number(o.value)}% OFF`;
    case 'FIXED_DISCOUNT': return `S/ ${Number(o.value).toFixed(2)} menos`;
    case 'BUY_X_GET_Y': return `Lleva ${o.getQuantity ?? 3} paga ${o.buyQuantity ?? 2}`;
    case 'BUNDLE_PRICE': return `${o.getQuantity ?? '?'} x ${formatCurrency(Number(o.value))}`;
    case 'COMBO': return `Combo ${formatCurrency(Number(o.value))}`;
    default: return o.storeBadge ?? 'Oferta';
  }
}

export function discountedPrice(o: Offer, price: number): number {
  if (o.type === 'PERCENTAGE_DISCOUNT') return round2(price * (1 - Number(o.value) / 100));
  if (o.type === 'FIXED_DISCOUNT') return Math.max(0, round2(price - Number(o.value)));
  return price;
}

/** Ofertas vigentes ahora mismo para el POS (descuentos, packs y combos). */
export function useLiveOffers() {
  return useQuery({
    queryKey: ['pos-offers'],
    queryFn: async () => (await api.get<{ data: Offer[] }>('/promotions?active=true&limit=100')).data.data,
    // Las promos sobre paquete/caja se presentan ya con el precio y el stock del
    // paquete (ver presentForOffer), así el resto del POS no distingue.
    select: (d) => d
      .filter((o) => o.isActive && o.type !== 'HAPPY_HOUR' && isLiveNow(o))
      .map((o) => ({ ...o, value: Number(o.value), products: o.products.map((e) => ({ ...e, product: presentForOffer(e.product, e.asPack) })) })),
    staleTime: 60000,
    refetchInterval: 5 * 60000,
  });
}

// Copia de los descuentos automáticos al alcance de código que no es un
// componente (el escáner en PosPage agrega productos fuera de la grilla).
export const useAutoDealsStore = create<{ deals: Record<string, AutoDeal> }>(() => ({ deals: {} }));

/**
 * Descuentos que se aplican solos al vender por unidad: la Hora feliz y las
 * ofertas de % o monto fijo vigentes. Si un producto tiene varias, gana el
 * precio más bajo. Los packs ("lleva 3 paga 2") y combos no se aplican solos:
 * se agregan desde el filtro Ofertas.
 */
export function useAutoOffers() {
  const { data: offers } = useLiveOffers();
  const { data: happyHours } = useQuery({
    queryKey: ['pos-happy-hours'],
    queryFn: async () => (await api.get<{ data: HappyHourPromo[] }>('/promotions/active-now')).data.data,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { deals, tags } = useMemo(() => {
    const deals = new Map<string, AutoDeal>();
    const tags = new Map<string, string>();
    const offer = (id: string, d: AutoDeal) => {
      const cur = deals.get(id);
      if (!cur || d.effectivePrice < cur.effectivePrice) deals.set(id, d);
    };
    for (const promo of happyHours ?? []) {
      for (const { product } of promo.products) {
        const orig = Number(product.salePrice);
        const effectivePrice = promo.valueType === 'FIXED'
          ? Math.max(0, round2(orig - promo.value))
          : round2(orig * (1 - promo.value / 100));
        offer(product.id, { effectivePrice, label: 'Hora feliz' });
      }
    }
    for (const o of offers ?? []) {
      for (const { product, asPack } of o.products) {
        if (o.type === 'PERCENTAGE_DISCOUNT' || o.type === 'FIXED_DISCOUNT') {
          if (asPack) { tags.set(product.id, `${product.name.match(/\(([^)]+)\)$/)?.[1] ?? 'Paquete'} en oferta`); continue; }
          offer(product.id, { effectivePrice: discountedPrice(o, Number(product.salePrice)), label: offerTag(o) });
        } else if (!tags.has(product.id)) {
          tags.set(product.id, offerTag(o));
        }
      }
    }
    return { deals, tags };
  }, [offers, happyHours]);

  useEffect(() => {
    useAutoDealsStore.setState({ deals: Object.fromEntries(deals) });
  }, [deals]);

  return { deals, tags, offers: offers ?? [] };
}

/** Descuento por unidad que corresponde al producto, o 0. */
export function autoDiscountFor(productId: string, price: number): number {
  const d = useAutoDealsStore.getState().deals[productId];
  return d ? Math.max(0, round2(price - d.effectivePrice)) : 0;
}

/* ─── Agregar ofertas al carrito ─────────────────────────────────────────── */

// Cada oferta va en su propia línea del carrito (id del producto + sufijo), así
// no se mezcla con las unidades sueltas del mismo producto ni pierde su
// descuento. Al cobrar, PosPage se queda solo con lo que va antes del '#'.
function offerLineId(product: { id: string; isPack?: boolean }, offerId: string) {
  return product.isPack ? packLineFields(product) : { productId: `${product.id}#of-${offerId}` };
}

// Stock que queda para una línea de oferta, descontando lo que ya ocupan las
// otras líneas del mismo producto en el carrito.
function stockLeft(product: { id: string; currentStock: number; isPack?: boolean }, lineId: string) {
  if (product.isPack) return product.currentStock;
  const others = usePosStore.getState().items
    .filter((i) => i.productId.split('#')[0] === product.id && i.productId !== lineId && !i.sellAsPack)
    .reduce((s, i) => s + i.quantity, 0);
  return Math.max(0, product.currentStock - others);
}

// Saca hasta `qty` unidades de la línea suelta del producto (si las hay): se
// usa al convertir lo que ya estaba en el carrito en una oferta.
function takeFromPlainLine(productId: string, qty: number): number {
  const st = usePosStore.getState();
  const line = st.items.find((i) => i.productId === productId);
  if (!line || qty <= 0) return 0;
  const taken = Math.min(line.quantity, qty);
  st.updateQuantity(productId, line.quantity - taken);
  return taken;
}

function packMath(offer: Offer, price: number) {
  const units = offer.getQuantity ?? 3;
  const total = offer.type === 'BUNDLE_PRICE' ? Number(offer.value) : round2(price * (offer.buyQuantity ?? 2));
  return { units, total, perUnitDiscount: round2(price - round2(total / units)) };
}

/** Agrega el producto con la oferta. `convert` = usa las unidades sueltas que ya están en el carrito. */
export function addOfferProduct(offer: Offer, product: Offer['products'][0]['product'], opts: { convert?: boolean; packs?: number } = {}) {
  const addItem = usePosStore.getState().addItem;
  const originalPrice = Number(product.salePrice);
  const label = offer.storeBadge ?? offer.name;

  if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
    const { units, total, perUnitDiscount } = packMath(offer, originalPrice);
    const packs = opts.packs ?? 1;
    const ids = offerLineId(product, offer.id);
    if (opts.convert && !product.isPack) takeFromPlainLine(product.id, units * packs);
    if (stockLeft(product, ids.productId) - (usePosStore.getState().items.find((i) => i.productId === ids.productId)?.quantity ?? 0) < units * packs) {
      toast.error(`No hay stock suficiente de "${product.name}" para esta oferta (necesita ${units * packs}).`);
      return;
    }
    const r = addItem({
      ...ids,
      name: `${product.name} (${offerTag(offer)})`,
      barcode: product.barcode, quantity: units * packs,
      unitPrice: originalPrice, originalPrice, discountAmount: perUnitDiscount, discountPercent: 0,
      stock: stockLeft(product, ids.productId), packSize: units,
    });
    if (r.addedQuantity <= 0) toast.error(`No hay stock suficiente de "${product.name}" para otro paquete de ${units}.`);
    else toast.success(`${label}: ${units * packs} ${product.name} por ${formatCurrency(total * packs)}`, { duration: 1800 });
    return;
  }

  // Descuento simple (% o monto fijo)
  const finalPrice = discountedPrice(offer, originalPrice);
  const ids = offerLineId(product, offer.id);
  const qty = opts.convert && !product.isPack ? takeFromPlainLine(product.id, Infinity) || 1 : 1;
  const r = addItem({
    ...ids,
    name: `${product.name} (${offerTag(offer)})`,
    barcode: product.barcode, quantity: qty,
    unitPrice: originalPrice, originalPrice, discountAmount: round2(originalPrice - finalPrice), discountPercent: 0,
    stock: stockLeft(product, ids.productId),
  });
  if (r.addedQuantity <= 0) { toast.error(`"${product.name}" ya tiene todo el stock disponible en el carrito.`); return; }
  toast.success(`${product.name} con oferta: ${formatCurrency(finalPrice)} c/u`, { duration: 1500 });
}

// Combo de productos DISTINTOS a un precio total fijo: se agregan todos los
// componentes de una vez y el descuento se reparte en proporción a su precio
// normal, para que la suma de subtotales dé exacto el precio del combo. Si un
// componente ya estaba suelto en el carrito, se usa esa unidad (no se duplica).
export function addCombo(offer: Offer) {
  const addItem = usePosStore.getState().addItem;
  const comboTotal = Number(offer.value);
  const items = offer.products;
  for (const { quantity, product } of items) {
    const need = quantity ?? 1;
    if (product.currentStock < need) {
      toast.error(`No hay stock suficiente de "${product.name}" para este combo (necesita ${need}, disponible: ${product.currentStock}).`);
      return;
    }
  }
  const sumPrice = items.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
  if (sumPrice <= 0) return;
  const totalDiscount = Math.max(0, round2(sumPrice - comboTotal));
  let assigned = 0;
  items.forEach(({ quantity, product }, idx) => {
    const qty = quantity ?? 1;
    const orig = Number(product.salePrice);
    const lineDiscount = idx === items.length - 1
      ? round2(totalDiscount - assigned)
      : round2(totalDiscount * ((orig * qty) / sumPrice));
    assigned += lineDiscount;
    if (!product.isPack) takeFromPlainLine(product.id, qty);
    const lineId = product.isPack ? packLineFields(product) : { productId: `${product.id}#combo-${offer.id}` };
    addItem({
      ...lineId,
      name: `${product.name} (${offer.storeBadge ?? offer.name})`,
      barcode: product.barcode, quantity: qty,
      unitPrice: orig, originalPrice: orig, discountAmount: round2(lineDiscount / qty), discountPercent: 0,
      // El combo se vende aunque el sistema marque poco stock de algún componente
      // ya contado arriba; el tope real lo controla la validación previa.
      stock: Math.max(qty, stockLeft(product, lineId.productId)),
    });
  });
  toast.success(`${offer.name} agregado: ${formatCurrency(comboTotal)}`);
}

/* ─── Ofertas recomendadas para la venta en curso ────────────────────────── */

export interface CartSuggestion {
  key: string;
  offer: Offer;
  title: string;
  detail: string;
  saving: number;
  apply: () => void;
}

/**
 * Ofertas que aplican a lo que ya está en el carrito, ordenadas por ahorro:
 * - Pack ("lleva 3 paga 2") de un producto que se está llevando suelto.
 * - Descuento de un producto que entró sin él (p. ej. antes de cargar las ofertas).
 * - Combo que incluye algún producto del carrito.
 */
export function useCartSuggestions(): CartSuggestion[] {
  const { data: offers } = useLiveOffers();
  const items = usePosStore((s) => s.items);
  return useMemo(() => {
    const plain = new Map(items.filter((i) => !i.productId.includes('#')).map((i) => [i.productId, i]));
    if (plain.size === 0 || !offers) return [];
    const out: CartSuggestion[] = [];
    for (const o of offers) {
      if (o.type === 'COMBO') {
        const inCart = o.products.filter((e) => !e.product.isPack && plain.has(e.product.id));
        if (inCart.length === 0) continue;
        const missing = o.products.filter((e) => !inCart.includes(e));
        const sum = o.products.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
        const saving = round2(sum - Number(o.value));
        if (saving <= 0) continue;
        out.push({
          key: `combo-${o.id}`, offer: o, saving,
          title: `${o.name}: ${formatCurrency(Number(o.value))}`,
          detail: missing.length ? `Agrega ${missing.map((m) => m.product.name).join(' y ')} y ahorra ${formatCurrency(saving)}` : `Ya lleva todo: ahorra ${formatCurrency(saving)}`,
          apply: () => addCombo(o),
        });
        continue;
      }
      for (const e of o.products) {
        const line = !e.asPack ? plain.get(e.product.id) : undefined;
        if (!line) continue;
        const price = Number(e.product.salePrice);
        if (o.type === 'BUY_X_GET_Y' || o.type === 'BUNDLE_PRICE') {
          const { units, total, perUnitDiscount } = packMath(o, price);
          if (perUnitDiscount <= 0) continue;
          const packs = Math.max(1, Math.floor(line.quantity / units));
          const add = Math.max(0, packs * units - line.quantity);
          out.push({
            key: `pack-${o.id}-${e.product.id}`, offer: o, saving: round2(perUnitDiscount * units * packs),
            title: `${e.product.name}: ${offerTag(o)}`,
            detail: add > 0
              ? `Agrega ${add} más: ${units} por ${formatCurrency(total)}`
              : `Aplica a ${packs * units} unidades: ahorra ${formatCurrency(round2(perUnitDiscount * units * packs))}`,
            apply: () => addOfferProduct(o, e.product, { convert: true, packs }),
          });
        } else if (o.type === 'PERCENTAGE_DISCOUNT' || o.type === 'FIXED_DISCOUNT') {
          const disc = round2(price - discountedPrice(o, price));
          if (disc <= line.discountAmount + 0.001) continue;
          out.push({
            key: `disc-${o.id}-${e.product.id}`, offer: o, saving: round2((disc - line.discountAmount) * line.quantity),
            title: `${e.product.name}: ${offerTag(o)}`,
            detail: `Queda a ${formatCurrency(price - disc)} c/u`,
            apply: () => addOfferProduct(o, e.product, { convert: true }),
          });
        }
      }
    }
    return out.sort((a, b) => b.saving - a.saving);
  }, [offers, items]);
}
