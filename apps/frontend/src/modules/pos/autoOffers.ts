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

/* ─── Agregar una oferta desde el filtro Ofertas ─────────────────────────── */

export function addOfferProduct(offer: Offer, product: Offer['products'][0]['product']) {
  const addItem = usePosStore.getState().addItem;
  const originalPrice = Number(product.salePrice);
  const label = offer.storeBadge ?? offer.name;

  if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
    const paidUnits = offer.buyQuantity ?? 2;
    const totalUnits = offer.getQuantity ?? 3;
    // Precio total del pack — sin dividir entre unidades para evitar redondeo
    const packPrice = offer.type === 'BUNDLE_PRICE' ? Number(offer.value) : round2(originalPrice * paidUnits);
    const packLabel = `${label} — pack de ${totalUnits}`;
    // La cantidad que se agrega son las unidades FÍSICAS del pack (no "1
    // pack"), para que el stock se descuente bien.
    if (product.currentStock < totalUnits) {
      toast.error(`No hay stock suficiente de "${product.name}" para esta oferta (necesita ${totalUnits}, disponible: ${product.currentStock}).`);
      return;
    }
    const perUnitDiscount = round2(originalPrice - round2(packPrice / totalUnits));
    const r = addItem({
      ...packLineFields(product),
      name: `${product.name} (${packLabel})`,
      barcode: product.barcode, quantity: totalUnits,
      unitPrice: originalPrice, originalPrice, discountAmount: perUnitDiscount, discountPercent: 0,
      stock: product.currentStock, packSize: totalUnits,
    });
    if (r.addedQuantity <= 0) toast.error(`No hay stock suficiente de "${product.name}" para otro paquete de ${totalUnits}.`);
    else if (r.capped) toast.warning(`Solo se pudieron agregar ${r.addedQuantity} unidad(es) más de "${product.name}": stock limitado.`);
    else toast.success(`${packLabel} agregado: ${formatCurrency(packPrice)}`);
    return;
  }

  // Descuento simple (% o monto fijo)
  const finalPrice = discountedPrice(offer, originalPrice);
  const r = addItem({
    ...packLineFields(product),
    name: product.name,
    barcode: product.barcode, quantity: 1,
    unitPrice: originalPrice, originalPrice, discountAmount: round2(originalPrice - finalPrice), discountPercent: 0,
    stock: product.currentStock,
  });
  if (r.addedQuantity <= 0) { toast.error(`"${product.name}" ya tiene todo el stock disponible en el carrito (${product.currentStock}).`); return; }
  toast.success(`${product.name} con oferta: ${formatCurrency(finalPrice)}`, { duration: 1500 });
}

// Combo de productos DISTINTOS a un precio total fijo: se agregan todos los
// componentes de una vez y el descuento se reparte en proporción a su precio
// normal, para que la suma de subtotales dé exacto el precio del combo.
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
  let anyCapped = false;
  items.forEach(({ quantity, product }, idx) => {
    const qty = quantity ?? 1;
    const orig = Number(product.salePrice);
    const lineDiscount = idx === items.length - 1
      ? round2(totalDiscount - assigned)
      : round2(totalDiscount * ((orig * qty) / sumPrice));
    assigned += lineDiscount;
    const r = addItem({
      ...packLineFields(product),
      name: `${product.name} (${offer.storeBadge ?? offer.name})`,
      barcode: product.barcode, quantity: qty,
      unitPrice: orig, originalPrice: orig, discountAmount: round2(lineDiscount / qty), discountPercent: 0,
      stock: product.currentStock,
    });
    if (r.capped) anyCapped = true;
  });
  if (anyCapped) toast.warning('Stock limitado en algún producto del combo: se agregó lo disponible.');
  else toast.success(`${offer.name} agregado: ${formatCurrency(comboTotal)}`);
}
