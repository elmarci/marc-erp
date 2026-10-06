import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { getSettingValues } from '../../utils/settings';
import { BusinessError } from '../../utils/errors';
import { inventoryService } from './inventory.service';

type Db = Prisma.TransactionClient | typeof prisma;

// Margen mínimo (S/ por kg o por unidad) que debe dejar el último costo de
// compra en productos de precio volátil (frutas, verduras, a granel).
export const DEFAULT_MIN_VOLATILE_MARGIN = 1;
export const MIN_VOLATILE_MARGIN_KEY = 'min_margin_volatile';

const DAY_MS = 24 * 60 * 60 * 1000;

// Una categoría hereda las reglas de su categoría padre: marcar "Lácteos"
// alcanza para sus subcategorías sin tener que marcar una por una.
const categoryRulesSelect = {
  requiresExpiry: true,
  volatilePricing: true,
  parent: { select: { requiresExpiry: true, volatilePricing: true } },
} satisfies Prisma.CategorySelect;

type CategoryWithRules = Prisma.CategoryGetPayload<{ select: typeof categoryRulesSelect }>;

export function effectiveRules(c: CategoryWithRules | null | undefined) {
  return {
    requiresExpiry: !!(c?.requiresExpiry || c?.parent?.requiresExpiry),
    volatilePricing: !!(c?.volatilePricing || c?.parent?.volatilePricing),
  };
}

export class InventoryAlertsService {
  async getCategoryRules(categoryId: string, db: Db = prisma) {
    const category = await db.category.findUnique({ where: { id: categoryId }, select: categoryRulesSelect });
    return effectiveRules(category);
  }

  async getMinVolatileMargin(): Promise<number> {
    const values = await getSettingValues([MIN_VOLATILE_MARGIN_KEY]);
    const n = Number(values[MIN_VOLATILE_MARGIN_KEY]);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_VOLATILE_MARGIN;
  }

  /* ── Último costo de compra ──────────────────────────────────────────────── */

  // Recalcula lastPurchaseCost desde el kardex: la compra más reciente con
  // costo (las bonificaciones entran a costo 0 y no cuentan) que no haya sido
  // anulada. Se usa al anular/corregir una compra para que la alerta de margen
  // no siga mirando un costo de una compra que ya no existe.
  async refreshLastPurchaseCost(tx: Db, productId: string) {
    const voided = await tx.inventoryMovement.findMany({
      where: { productId, type: 'PURCHASE_VOID' },
      select: { referenceId: true },
    });
    const voidedRefs = [...new Set(voided.map((m) => m.referenceId).filter((r): r is string => !!r))];

    const last = await tx.inventoryMovement.findFirst({
      where: {
        productId, type: 'PURCHASE_IN', unitCost: { gt: 0 },
        ...(voidedRefs.length > 0 ? { referenceId: { notIn: voidedRefs } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { unitCost: true, createdAt: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: { lastPurchaseCost: last?.unitCost ?? null, lastPurchaseAt: last?.createdAt ?? null },
    });
  }

  /* ── Alerta de margen bajo ───────────────────────────────────────────────── */

  // Productos de precio volátil (categoría marcada, o venta a granel) cuyo
  // último costo de compra deja menos del margen mínimo contra el precio de
  // venta actual. Solo avisa — nunca toca el precio: el usuario decide.
  //
  // "Precio volátil" = categoría marcada (frutas, verduras) o producto a granel
  // que se vende por kg/litro. Los "a granel" por unidad (sachets, pan suelto)
  // no entran: su precio es de centavos y S/ 1 de margen no tiene sentido.
  // Y en productos baratos el mínimo baja a la mitad del costo, para no exigir
  // un margen de S/ 1 sobre algo que cuesta S/ 0.20.
  async computeMarginAlerts(opts: { productIds?: string[] } = {}) {
    const minMargin = await this.getMinVolatileMargin();

    const products = await prisma.product.findMany({
      where: {
        deletedAt: null, status: 'ACTIVE', isMiscItem: false, marginAlertMuted: false,
        lastPurchaseCost: { not: null },
        ...(opts.productIds ? { id: { in: opts.productIds } } : {}),
      },
      select: {
        id: true, name: true, salePrice: true, lastPurchaseCost: true, lastPurchaseAt: true,
        isBulk: true, bulkUnit: true, currentStock: true,
        category: { select: { name: true, ...categoryRulesSelect } },
      },
    });

    const alerts = [];
    for (const p of products) {
      const rules = effectiveRules(p.category);
      const weighed = p.isBulk && ['kg', 'l'].includes((p.bulkUnit ?? '').toLowerCase());
      if (!weighed && !rules.volatilePricing) continue;

      const cost = Number(p.lastPurchaseCost);
      const sale = Number(p.salePrice);
      const margin = Math.round((sale - cost) * 100) / 100;
      const required = Math.min(minMargin, cost * 0.5);
      if (margin >= required - 0.0001) continue;

      alerts.push({
        productId: p.id,
        name: p.name,
        category: p.category.name,
        unit: p.isBulk ? (p.bulkUnit ?? 'kg') : 'und',
        stock: Number(p.currentStock),
        lastPurchaseCost: cost,
        lastPurchaseAt: p.lastPurchaseAt,
        salePrice: sale,
        margin,
        minMargin: Math.round(required * 100) / 100,
        // Redondeado hacia arriba a 10 céntimos: precios "redondos" para la balanza/POS.
        suggestedPrice: Math.ceil((cost + minMargin) * 10 - 1e-9) / 10,
        severity: margin <= 0 ? 'LOSS' as const : 'LOW' as const,
      });
    }
    // Primero lo más grave (menor margen).
    return alerts.sort((a, b) => a.margin - b.margin);
  }

  /* ── Control de vencimientos ─────────────────────────────────────────────── */

  // Todos los lotes con fecha que aún tienen unidades y no se resolvieron,
  // más el stock de productos con vencimiento que NO está cubierto por ningún
  // lote con fecha (lo que nadie sabe cuándo vence).
  async getExpiryControl() {
    const now = Date.now();
    const batches = await prisma.batch.findMany({
      where: { resolvedAt: null, quantity: { gt: 0 }, expiryDate: { not: null } },
      include: {
        product: { select: { id: true, name: true, currentStock: true, unitOfMeasure: true, isBulk: true, bulkUnit: true, category: { select: { name: true } } } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const trackedProducts = await prisma.product.findMany({
      where: { deletedAt: null, status: 'ACTIVE', trackExpiry: true, currentStock: { gt: 0 } },
      select: {
        id: true, name: true, currentStock: true, isBulk: true, bulkUnit: true,
        category: { select: { name: true } },
        batches: { where: { resolvedAt: null }, select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    const uncovered = trackedProducts
      .map((p) => {
        const stock = Number(p.currentStock);
        const covered = p.batches.reduce((s, b) => s + Number(b.quantity), 0);
        return {
          productId: p.id, name: p.name, category: p.category.name,
          unit: p.isBulk ? (p.bulkUnit ?? 'kg') : 'und',
          stock, covered, uncovered: Math.round((stock - covered) * 1000) / 1000,
        };
      })
      .filter((p) => p.uncovered > 0.0005);

    const daysLeft = (d: Date) => Math.floor((d.getTime() - now) / DAY_MS);
    const mapped = batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      quantity: Number(b.quantity),
      expiryDate: b.expiryDate!,
      daysLeft: daysLeft(b.expiryDate!),
      product: { ...b.product, currentStock: Number(b.product.currentStock) },
    }));

    return {
      batches: mapped,
      uncovered,
      summary: {
        expired: mapped.filter((b) => b.daysLeft < 0).length,
        within7: mapped.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 7).length,
        within30: mapped.filter((b) => b.daysLeft > 7 && b.daysLeft <= 30).length,
        uncovered: uncovered.length,
      },
    };
  }

  // Descuenta del lote que vence primero (FEFO) lo que se vendió — así el
  // lote vendido deja de aparecer como "por vencer" sin que nadie tenga que
  // resolverlo a mano, y las alertas solo muestran lo que realmente sigue en
  // el estante.
  async consumeBatchesFefo(tx: Prisma.TransactionClient, productId: string, quantity: number) {
    let remaining = quantity;
    if (remaining <= 0) return;
    const batches = await tx.batch.findMany({
      where: { productId, resolvedAt: null, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity));
      await tx.batch.update({ where: { id: b.id }, data: { quantity: Number(b.quantity) - take } });
      remaining -= take;
    }
  }

  // Al anular una venta del mismo día la mercadería vuelve al estante: se
  // devuelve al lote que vence primero (que es del que FEFO la sacó).
  async restoreBatchesOnVoid(tx: Prisma.TransactionClient, productId: string, quantity: number) {
    if (quantity <= 0) return;
    const batch = await tx.batch.findFirst({
      where: { productId, resolvedAt: null },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    if (!batch) return;
    await tx.batch.update({ where: { id: batch.id }, data: { quantity: Number(batch.quantity) + quantity } });
  }

  // Los lotes registrados antes de existir FEFO nunca se descontaron al
  // vender, así que suman más que el stock real. Se recorta el excedente
  // desde los que vencen primero (lo más probable es que se vendiera
  // primero) hasta que los lotes sumen exactamente el stock del producto.
  async reconcileBatches() {
    const products = await prisma.product.findMany({
      where: { deletedAt: null, trackExpiry: true, batches: { some: { resolvedAt: null, quantity: { gt: 0 } } } },
      select: { id: true, currentStock: true },
    });
    let adjusted = 0;
    for (const p of products) {
      adjusted += await prisma.$transaction((tx) => this.capBatchesToStock(tx, p.id));
    }
    return { products: products.length, batchesAdjusted: adjusted };
  }

  // Recorta los lotes para que no sumen más que el stock real del producto
  // (ver reconcileBatches). También se usa al anular una compra: sus unidades
  // salen del stock pero el lote que crearon seguiría ahí como fantasma.
  async capBatchesToStock(tx: Prisma.TransactionClient, productId: string): Promise<number> {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { currentStock: true } });
    if (!product) return 0;
    const batches = await tx.batch.findMany({
      where: { productId, resolvedAt: null, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const total = batches.reduce((s, b) => s + Number(b.quantity), 0);
    let excess = total - Math.max(0, Number(product.currentStock));
    let touched = 0;
    for (const b of batches) {
      if (excess <= 0.0005) break;
      const cut = Math.min(excess, Number(b.quantity));
      await tx.batch.update({ where: { id: b.id }, data: { quantity: Number(b.quantity) - cut } });
      excess -= cut;
      touched += 1;
    }
    return touched;
  }

  // Exige fecha de vencimiento a las líneas de productos que la controlan
  // (lácteos, panadería, carnes y embutidos): sin fecha no se puede recibir.
  async assertExpiryDates(items: Array<{ productId: string; qty: number; expiryDate?: Date | null }>) {
    const withQty = items.filter((i) => i.qty > 0);
    if (withQty.length === 0) return;
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(withQty.map((i) => i.productId))] } },
      select: { id: true, name: true, trackExpiry: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const missing = new Set<string>();
    const alreadyExpired = new Set<string>();
    for (const i of withQty) {
      const p = byId.get(i.productId);
      if (!p?.trackExpiry) continue;
      if (!i.expiryDate) missing.add(p.name);
      else if (i.expiryDate.getTime() < startOfToday.getTime()) alreadyExpired.add(p.name);
    }
    if (missing.size > 0) {
      throw new BusinessError(
        `Falta la fecha de vencimiento de: ${[...missing].join(', ')}. Es obligatoria para este tipo de producto.`,
      );
    }
    if (alreadyExpired.size > 0) {
      throw new BusinessError(
        `La fecha de vencimiento ya pasó para: ${[...alreadyExpired].join(', ')}. Revisa la fecha o no recibas ese producto.`,
      );
    }
  }

  /* ── Resumen para badges ─────────────────────────────────────────────────── */

  async getSummary() {
    const [margin, expiry, lowStockRows] = await Promise.all([
      this.computeMarginAlerts(),
      this.getExpiryControl(),
      inventoryService.getLowStockProducts(),
    ]);
    const expiring = expiry.summary.expired + expiry.summary.within7 + expiry.summary.within30;
    const lowStock = lowStockRows.length;
    return {
      marginLow: margin.length,
      expiring,
      expired: expiry.summary.expired,
      uncovered: expiry.summary.uncovered,
      lowStock,
      total: lowStock + margin.length + expiring + expiry.summary.uncovered,
    };
  }
}

export const inventoryAlertsService = new InventoryAlertsService();
