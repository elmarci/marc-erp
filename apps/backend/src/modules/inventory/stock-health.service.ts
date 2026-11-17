import { prisma } from '../../database/client';
import { inventoryAlertsService } from './inventory-alerts.service';
import { inventoryService } from './inventory.service';

// Salud del inventario: lo que no se mueve, la hoja de conteo por categoría
// y los avisos del día que muestra la campana del ERP.
export class StockHealthService {
  /**
   * Productos con stock que no se venden hace `days` días (o nunca), con el
   * dinero que tienen parado al costo actual. Ordenados por ese dinero.
   */
  async getNoMovement(days: number, categoryId?: string) {
    const rows = await prisma.$queryRaw<Array<{
      id: string; name: string; category: string; stock: number; cost: number; price: number;
      last_sale: Date | null; last_purchase: Date | null; created_at: Date;
    }>>`
      SELECT p.id, p.name, c.name AS category, p.current_stock::float AS stock,
             p.cost_price::float AS cost, p.sale_price::float AS price,
             ls.last_sale, p.last_purchase_at AS last_purchase, p.created_at
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT MAX(m.created_at) AS last_sale FROM inventory_movements m
        WHERE m.product_id = p.id AND m.type = 'SALE_OUT'
      ) ls ON true
      WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE' AND p.current_stock > 0
        AND (${categoryId ?? null}::text IS NULL OR p.category_id = ${categoryId ?? null} OR c.parent_id = ${categoryId ?? null})
        AND COALESCE(ls.last_sale, p.created_at) < NOW() - make_interval(days => ${days}::int)
    `;
    const items = rows
      .map((r) => ({
        productId: r.id, name: r.name, category: r.category, stock: r.stock,
        costPrice: r.cost, salePrice: r.price, value: Math.round(r.stock * r.cost * 100) / 100,
        lastSaleAt: r.last_sale, lastPurchaseAt: r.last_purchase,
        daysWithoutSale: r.last_sale ? Math.floor((Date.now() - r.last_sale.getTime()) / 86_400_000) : null,
      }))
      .sort((a, b) => b.value - a.value);
    return {
      days,
      items,
      totals: { products: items.length, value: Math.round(items.reduce((s, i) => s + i.value, 0) * 100) / 100 },
    };
  }

  /** Productos activos de una categoría (y sus subcategorías) para contarlos. */
  async getCountSheet(categoryId: string) {
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null, status: 'ACTIVE',
        OR: [{ categoryId }, { category: { parentId: categoryId } }],
      },
      select: {
        id: true, name: true, barcode: true, currentStock: true, costPrice: true, isBulk: true, bulkUnit: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const lastCount = await prisma.inventoryMovement.findFirst({
      where: { reasonCode: 'COUNT', product: { OR: [{ categoryId }, { category: { parentId: categoryId } }] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return {
      lastCountAt: lastCount?.createdAt ?? null,
      products: products.map((p) => ({
        id: p.id, name: p.name, barcode: p.barcode, category: p.category.name,
        currentStock: Number(p.currentStock), costPrice: Number(p.costPrice),
        unit: p.isBulk ? (p.bulkUnit ?? 'kg') : 'und',
      })),
    };
  }

  /**
   * Avisos del día para la campana: vencidos y por vencer (7 días), stock
   * bajo y, para supervisores, gastos por pagar ya vencidos y compras vencidas.
   */
  async getDailyNotices(canSeeMoney: boolean) {
    const [expiry, lowStock] = await Promise.all([
      inventoryAlertsService.getExpiryControl(),
      inventoryService.getLowStockProducts(),
    ]);
    const soon = expiry.batches.filter((b) => b.daysLeft <= 7);
    const notices: Array<{ key: string; tone: 'danger' | 'warning' | 'info'; title: string; detail: string; link: string }> = [];

    const expired = soon.filter((b) => b.daysLeft < 0);
    const week = soon.filter((b) => b.daysLeft >= 0);
    if (expired.length) {
      notices.push({
        key: 'expired', tone: 'danger',
        title: `${expired.length} lote${expired.length === 1 ? '' : 's'} vencido${expired.length === 1 ? '' : 's'} en el estante`,
        detail: expired.slice(0, 3).map((b) => b.product.name).join(', '),
        link: '/inventory?tab=expiry',
      });
    }
    if (week.length) {
      notices.push({
        key: 'week', tone: 'warning',
        title: `${week.length} lote${week.length === 1 ? '' : 's'} vence${week.length === 1 ? '' : 'n'} en 7 días`,
        detail: week.slice(0, 3).map((b) => `${b.product.name} (${b.daysLeft === 0 ? 'hoy' : `${b.daysLeft} d`})`).join(', ')
          + '. Puedes ponerlos en oferta.',
        link: '/inventory?tab=expiry',
      });
    }
    if (lowStock.length) {
      notices.push({
        key: 'low', tone: 'info',
        title: `${lowStock.length} producto${lowStock.length === 1 ? '' : 's'} con stock bajo`,
        detail: (lowStock as Array<{ name: string }>).slice(0, 3).map((p) => p.name).join(', '),
        link: '/inventory?tab=alerts',
      });
    }

    if (canSeeMoney) {
      const now = new Date();
      const [pendingExpenses, overduePurchases] = await Promise.all([
        prisma.expense.aggregate({
          where: { voidedAt: null, isPending: true, expenseDate: { lte: now } },
          _sum: { amount: true }, _count: true,
        }),
        prisma.purchaseOrder.aggregate({
          where: {
            voidedAt: null, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }, paymentStatus: { not: 'PAID' },
            dueDate: { lt: now },
          },
          _count: true,
        }),
      ]);
      if (pendingExpenses._count) {
        notices.push({
          key: 'expenses', tone: 'warning',
          title: `${pendingExpenses._count} gasto${pendingExpenses._count === 1 ? '' : 's'} por pagar ya vencido${pendingExpenses._count === 1 ? '' : 's'}`,
          detail: `S/ ${Number(pendingExpenses._sum.amount ?? 0).toFixed(2)} en total`,
          link: '/cash?tab=general&section=gastos',
        });
      }
      if (overduePurchases._count) {
        notices.push({
          key: 'purchases', tone: 'warning',
          title: `${overduePurchases._count} compra${overduePurchases._count === 1 ? '' : 's'} con pago vencido al proveedor`,
          detail: 'Revisa Cuentas por pagar',
          link: '/purchases?tab=payable',
        });
      }
    }
    return { notices, count: notices.length };
  }
}

export const stockHealthService = new StockHealthService();
