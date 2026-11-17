import { Prisma, type BatchMovementType } from '@prisma/client';
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

export interface BatchRef {
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  notes?: string | null;
}

/** Días calendario de Lima entre hoy y la fecha (negativo si ya pasó). */
export function limaDaysUntil(date: Date, now: Date = new Date()): number {
  // La fecha de vencimiento es un día de calendario (se guarda como medianoche
  // UTC); "hoy" es el día en Lima.
  const expiryDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const l = new Date(now.getTime() - 5 * 3600 * 1000);
  const today = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  return Math.round((expiryDay - today) / DAY_MS);
}

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
        product: { select: { id: true, name: true, currentStock: true, unitOfMeasure: true, isBulk: true, bulkUnit: true, salePrice: true, category: { select: { name: true } } } },
        supplier: { select: { businessName: true } },
        purchaseOrder: { select: { orderNumber: true } },
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

    const daysLeft = (d: Date) => limaDaysUntil(d, new Date(now));
    const mapped = batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      quantity: Number(b.quantity),
      expiryDate: b.expiryDate!,
      daysLeft: daysLeft(b.expiryDate!),
      unitCost: b.unitCost != null ? Number(b.unitCost) : null,
      supplierName: b.supplier?.businessName ?? null,
      orderNumber: b.purchaseOrder?.orderNumber ?? null,
      product: { ...b.product, currentStock: Number(b.product.currentStock), salePrice: Number(b.product.salePrice) },
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

  /* ── Lotes: entrada, salida e historial ─────────────────────────────────── */

  /** Crea un lote y deja su entrada en el historial. */
  async createBatch(tx: Prisma.TransactionClient, data: {
    productId: string; quantity: number; expiryDate: Date | null; batchNumber?: string | null;
    purchaseOrderId?: string | null; supplierId?: string | null; unitCost?: number | null;
    type?: 'RECEIVED' | 'MANUAL'; userId?: string | null; notes?: string | null;
  }) {
    const batch = await tx.batch.create({
      data: {
        productId: data.productId,
        batchNumber: data.batchNumber || null,
        quantity: data.quantity,
        initialQuantity: data.quantity,
        expiryDate: data.expiryDate,
        purchaseOrderId: data.purchaseOrderId ?? null,
        supplierId: data.supplierId ?? null,
        unitCost: data.unitCost ?? null,
      },
    });
    await tx.batchMovement.create({
      data: {
        batchId: batch.id, type: data.type ?? 'RECEIVED', quantity: data.quantity, quantityAfter: data.quantity,
        referenceType: data.purchaseOrderId ? 'PURCHASE' : null, referenceId: data.purchaseOrderId ?? null,
        userId: data.userId ?? null, notes: data.notes ?? null,
      },
    });
    return batch;
  }

  /** Saca una cantidad de un lote puntual (sin pasar por FEFO). */
  async consumeBatch(
    tx: Prisma.TransactionClient, batch: { id: string; quantity: Prisma.Decimal | number }, quantity: number,
    type: BatchMovementType, ref?: BatchRef,
  ) {
    const take = Math.min(quantity, Number(batch.quantity));
    if (take > 0) await this.moveBatch(tx, batch, -take, type, ref);
  }

  async moveBatch(
    tx: Prisma.TransactionClient, batch: { id: string; quantity: Prisma.Decimal | number }, delta: number,
    type: BatchMovementType, ref?: BatchRef,
  ) {
    const after = Math.round((Number(batch.quantity) + delta) * 1000) / 1000;
    await tx.batch.update({ where: { id: batch.id }, data: { quantity: after } });
    await tx.batchMovement.create({
      data: {
        batchId: batch.id, type, quantity: delta, quantityAfter: after,
        referenceType: ref?.referenceType ?? null, referenceId: ref?.referenceId ?? null,
        userId: ref?.userId ?? null, notes: ref?.notes ?? null,
      },
    });
  }

  // Descuenta del lote que vence primero (FEFO) lo que se vendió — así el
  // lote vendido deja de aparecer como "por vencer" sin que nadie tenga que
  // resolverlo a mano, y las alertas solo muestran lo que realmente sigue en
  // el estante. Cada descuento queda en el historial del lote con su venta.
  async consumeBatchesFefo(
    tx: Prisma.TransactionClient, productId: string, quantity: number,
    type: BatchMovementType = 'SALE', ref?: BatchRef,
  ) {
    let remaining = quantity;
    if (remaining <= 0) return;
    const batches = await tx.batch.findMany({
      where: { productId, resolvedAt: null, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    for (const b of batches) {
      if (remaining <= 0.0005) break;
      const take = Math.min(remaining, Number(b.quantity));
      await this.moveBatch(tx, b, -take, type, ref);
      remaining -= take;
    }
  }

  // Al anular una venta (o una devolución al proveedor) la mercadería vuelve
  // al lote del que salió, según el historial. Lo que no tenga historial
  // (ventas anteriores a la Fase 3) vuelve al lote que vence primero.
  async restoreBatchesOnVoid(
    tx: Prisma.TransactionClient, productId: string, quantity: number,
    origin?: { type: BatchMovementType; referenceId: string }, voidType: BatchMovementType = 'SALE_VOID', ref?: BatchRef,
  ) {
    let remaining = quantity;
    if (remaining <= 0) return;
    if (origin) {
      const taken = await tx.batchMovement.findMany({
        where: { type: origin.type, referenceId: origin.referenceId, batch: { productId } },
        include: { batch: true },
        orderBy: { createdAt: 'desc' },
      });
      for (const m of taken) {
        if (remaining <= 0.0005) break;
        const back = Math.min(remaining, -Number(m.quantity));
        if (back <= 0) continue;
        const fresh = await tx.batch.findUniqueOrThrow({ where: { id: m.batchId } });
        await this.moveBatch(tx, fresh, back, voidType, ref);
        remaining -= back;
      }
    }
    if (remaining <= 0.0005) return;
    const batch = await tx.batch.findFirst({
      where: { productId, resolvedAt: null },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    if (!batch) return;
    await this.moveBatch(tx, batch, remaining, voidType, ref);
  }

  /** Detalle de un lote: de qué compra vino y todo lo que le pasó. */
  async getBatchHistory(batchId: string) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        product: { select: { id: true, name: true, costPrice: true } },
        purchaseOrder: { select: { id: true, orderNumber: true, supplierInvoice: true, receivedDate: true } },
        supplier: { select: { id: true, businessName: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!batch) throw new BusinessError('Lote no encontrado.');
    const saleIds = batch.movements.filter((m) => m.referenceType === 'SALE' && m.referenceId).map((m) => m.referenceId!);
    const sales = saleIds.length
      ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, saleNumber: true } })
      : [];
    const saleNumbers = new Map(sales.map((x) => [x.id, x.saleNumber]));
    return {
      ...batch,
      movements: batch.movements.map((m) => ({
        ...m,
        referenceLabel: m.referenceType === 'SALE' && m.referenceId ? saleNumbers.get(m.referenceId) ?? null : null,
      })),
    };
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
      await this.moveBatch(tx, b, -cut, 'RECONCILE', { notes: 'Ajuste para que los lotes no sumen más que el stock' });
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

  // Ventas hechas con "vender aunque el sistema diga sin stock": cada una dejó
  // un ajuste automático en el kardex. Sirve para ver qué compras no se están
  // registrando y quién las hace — es un tema de proceso, no del sistema.
  async getAutoAdjustments(days = 30) {
    const since = new Date(Date.now() - days * DAY_MS);
    const rows = await prisma.inventoryMovement.findMany({
      where: { referenceType: 'SALE_AUTO_ADJUST', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { id: true, name: true, barcode: true, costPrice: true, lastPurchaseCost: true } } },
    });
    const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))];
    const saleIds = [...new Set(rows.map((r) => r.referenceId).filter((s): s is string => !!s))];
    const [users, sales] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
      prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, saleNumber: true } }),
    ]);
    const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    const saleNumber = new Map(sales.map((s) => [s.id, s.saleNumber]));

    const entries = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      productId: r.productId,
      productName: r.product.name,
      barcode: r.product.barcode,
      quantity: Number(r.quantity),
      stockBefore: Number(r.quantityBefore),
      unitCost: r.unitCost != null ? Number(r.unitCost) : null,
      userName: r.userId ? userName.get(r.userId) ?? null : null,
      saleNumber: r.referenceId ? saleNumber.get(r.referenceId) ?? null : null,
    }));

    const byProduct = new Map<string, { productId: string; productName: string; times: number; units: number }>();
    for (const e of entries) {
      const cur = byProduct.get(e.productId) ?? { productId: e.productId, productName: e.productName, times: 0, units: 0 };
      cur.times += 1;
      cur.units += e.quantity;
      byProduct.set(e.productId, cur);
    }
    return {
      days,
      totalTimes: entries.length,
      totalUnits: entries.reduce((s, e) => s + e.quantity, 0),
      byProduct: [...byProduct.values()].sort((a, b) => b.times - a.times),
      entries,
    };
  }

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
