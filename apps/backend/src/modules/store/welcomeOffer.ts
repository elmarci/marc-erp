import { prisma } from '../../database/client';

// Descuento de bienvenida de la tienda online (regla del dueño, 2026-11-15):
// 20 % en la primera compra (de S/ 40 o más) de una cuenta, con compra mínima de S/ 40
// en productos y un tope de S/ 15 de descuento por pedido. No cuenta el
// envío ni la comisión de tarjeta. Cigarros quedan fuera (Ley 28705 prohíbe
// promocionarlos) y también licores. No se junta con canje de puntos.
// Mismos valores que apps/store/src/lib/storeInfo.ts (WELCOME): si cambian,
// cambiar en los dos lados.
export const WELCOME_PERCENT = 20;
export const WELCOME_MIN = 40;
export const WELCOME_CAP = 15;
// Categorías excluidas: se compara el nombre de la categoría y de su padre.
export const WELCOME_EXCLUDED = /cigarr|tabaco|licor|cerveza|vino|alcohol|ron\b|pisco|whisk|vodka/;

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const isExcludedCategory = (...names: Array<string | null | undefined>) =>
  names.some(n => !!n && WELCOME_EXCLUDED.test(normalize(n)));

// ¿Puede usar la bienvenida? Vale para la primera compra de S/ 40 o más de
// la cuenta: no puede tener antes (ni a su nombre ni con su teléfono, así
// tampoco vale si pidió como invitado con ese número) un pedido no cancelado
// que ya usó la bienvenida o que llegó al mínimo. Un primer pedido chico
// (ej. S/ 12) no le quita el beneficio. Si el pedido con descuento se
// cancela, vuelve a quedar disponible porque los cancelados no cuentan.
export async function isWelcomeEligible(storeCustomerId?: string | null): Promise<boolean> {
  if (!storeCustomerId) return false;
  const sc = await prisma.storeCustomer.findUnique({ where: { id: storeCustomerId }, select: { phone: true, isActive: true } });
  if (!sc || !sc.isActive) return false;
  const previous = await prisma.storeOrder.count({
    where: {
      status: { not: 'CANCELLED' },
      AND: [
        { OR: [{ storeCustomerId }, { customerPhone: sc.phone }] },
        { OR: [{ welcomeDiscountAmount: { gt: 0 } }, { subtotal: { gte: WELCOME_MIN } }] },
      ],
    },
  });
  return previous === 0;
}

// Monto del descuento sobre las líneas del pedido. `eligibleSubtotal` ya
// viene sin los productos excluidos; el mínimo se mide sobre todo el pedido.
export function welcomeDiscount(productsSubtotal: number, eligibleSubtotal: number): number {
  if (productsSubtotal < WELCOME_MIN || eligibleSubtotal <= 0) return 0;
  return Math.min(WELCOME_CAP, Math.round(eligibleSubtotal * WELCOME_PERCENT) / 100);
}
