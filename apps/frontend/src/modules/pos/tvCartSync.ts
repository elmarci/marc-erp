import { useEffect } from 'react';
import { api } from '@/services/api';
import { usePosStore } from '@/stores/posStore';
import { useTvLiveStore } from '@/stores/tvLiveStore';

// Pantalla del cliente: mientras está activada, cada cambio del carrito se
// manda a la TV de la tienda (con un pequeño retraso para no mandar una
// petición por cada tecla) y la TV lo muestra en vivo con el total.

const DEBOUNCE_MS = 500;
// Tras cobrar, la TV muestra "¡Gracias por tu compra!" unos segundos; durante
// ese tiempo no se manda el carrito vacío (lo taparía).
const THANKS_HOLD_MS = 9500;
let holdUntil = 0;

function buildPayload() {
  const { items, total, customerName } = usePosStore.getState();
  return {
    items: items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit ?? null,
      // Precio ya con el descuento de la línea: es lo que realmente se cobra.
      unitPrice: Math.max(0, i.unitPrice - i.discountAmount),
      subtotal: i.subtotal,
    })),
    total,
    customerName,
    promoKeys: useTvLiveStore.getState().promoKeys,
  };
}

export function pushTvCart() {
  if (!useTvLiveStore.getState().enabled) return;
  api.put('/tv/live/cart', buildPayload()).catch(() => { /* la TV es accesoria: nunca debe frenar una venta */ });
}

export function sendTvThanks() {
  if (!useTvLiveStore.getState().enabled) return;
  holdUntil = Date.now() + THANKS_HOLD_MS;
  api.post('/tv/live/thanks', { promoKeys: useTvLiveStore.getState().promoKeys }).catch(() => {});
  // Pasado el agradecimiento, la TV vuelve a la rotación (carrito vacío).
  window.setTimeout(pushTvCart, THANKS_HOLD_MS + 100);
}

export function useTvCartSync() {
  const enabled = useTvLiveStore((s) => s.enabled);
  const promoKeys = useTvLiveStore((s) => s.promoKeys);
  const items = usePosStore((s) => s.items);
  const total = usePosStore((s) => s.total);
  const customerName = usePosStore((s) => s.customerName);

  useEffect(() => {
    if (!enabled) return;
    const empty = usePosStore.getState().items.length === 0;
    const wait = empty && Date.now() < holdUntil ? holdUntil - Date.now() + 100 : DEBOUNCE_MS;
    const t = window.setTimeout(pushTvCart, wait);
    return () => window.clearTimeout(t);
  }, [enabled, promoKeys, items, total, customerName]);
}
