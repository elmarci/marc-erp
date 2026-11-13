// Precio de cada línea de un pedido web, decidido por el SERVIDOR.
//
// Antes se usaba tal cual el `unitPrice` que mandaba el celular: cualquiera
// que armara la petición a mano podía pedir un arroz a S/ 0.01. Ahora el
// precio del cliente solo sirve como pista de QUÉ oferta vio, y se cobra
// siempre un precio legítimo calculado acá:
//   - Producto suelto: precio de venta, o el precio con una oferta de
//     descuento activa en la tienda que incluya ese producto.
//   - Paquete (id "bundle-<oferta>-<producto>"): precio por unidad del
//     paquete, calculado igual que en la tienda (AddOfferModal.getPackInfo),
//     y solo si se piden paquetes completos; si no, precio normal.
// Nunca se cobra MENOS que el precio legítimo más bajo, y nunca más que el
// precio de venta.

export type PromoForPricing = {
  id: string;
  type: string;
  value: unknown;
  valueType: string | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  products: Array<{ productId: string; quantity: number; product: { salePrice: unknown } }>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function discountPrices(salePrice: number, promo: PromoForPricing): number[] {
  const v = Number(promo.value);
  if (promo.type === 'PERCENTAGE_DISCOUNT') return [r2(salePrice * (1 - v / 100))];
  if (promo.type === 'FIXED_DISCOUNT') return [Math.max(0, r2(salePrice - v))];
  // La tienda muestra la hora feliz como %, el POS respeta valueType: se
  // aceptan los dos para no cobrarle al cliente distinto de lo que vio.
  if (promo.type === 'HAPPY_HOUR') {
    const pct = r2(salePrice * (1 - v / 100));
    return promo.valueType === 'FIXED' ? [Math.max(0, r2(salePrice - v)), pct] : [pct];
  }
  return [];
}

export function packInfo(promo: PromoForPricing): { totalQty: number; perUnit: number } | null {
  if (promo.products.length === 0) return null;
  if (promo.type === 'BUNDLE_PRICE' || promo.type === 'COMBO') {
    const totalQty = promo.type === 'COMBO'
      ? promo.products.reduce((s, p) => s + (p.quantity || 1), 0)
      : promo.getQuantity ?? promo.products.length;
    if (totalQty <= 0) return null;
    return { totalQty, perUnit: r2(Number(promo.value) / totalQty) };
  }
  if (promo.type === 'BUY_X_GET_Y') {
    const buy = promo.buyQuantity ?? 2;
    const get = promo.getQuantity ?? 3;
    const total = r2(Number(promo.products[0].product.salePrice) * buy);
    return { totalQty: get, perUnit: r2(total / get) };
  }
  return null;
}

// El precio legítimo más bajo que sea >= al que pidió el cliente (con un
// céntimo de tolerancia por redondeo). Si pidió menos que todo lo legítimo,
// se cobra el legítimo más bajo; si pidió más que el precio de venta, el de
// venta.
export function pickPrice(clientPrice: number | undefined, candidates: number[], salePrice: number): number {
  const legit = [...new Set([salePrice, ...candidates.filter(c => c <= salePrice)])].sort((a, b) => a - b);
  if (clientPrice === undefined) return salePrice;
  return legit.find(c => c >= clientPrice - 0.01) ?? salePrice;
}
