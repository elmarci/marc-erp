import { prisma } from '../../database/client';
import { redis, CACHE_TTL } from '../../config/redis';

interface DateRange {
  from: Date;
  to: Date;
}

export class ReportsService {
  async getDashboard() {
    const cacheKey = 'reports:dashboard';
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Calcular fechas en zona horaria de Lima (UTC-5) para evitar desfase
    const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
    const nowUTC = new Date();
    // "Ahora" en Lima: desplazamos para obtener año/mes/día correctos
    const nowLima = new Date(nowUTC.getTime() + LIMA_OFFSET_MS);
    const y = nowLima.getUTCFullYear(), m = nowLima.getUTCMonth(), d = nowLima.getUTCDate();

    // Inicio y fin del día Lima expresados en UTC (para comparar con BD)
    const startOfDay = new Date(Date.UTC(y, m, d, 5, 0, 0, 0));       // Lima 00:00 = UTC 05:00
    const endOfDay   = new Date(Date.UTC(y, m, d + 1, 4, 59, 59, 999)); // Lima 23:59 = UTC 04:59+1d
    const startOfMonth     = new Date(Date.UTC(y, m, 1, 5, 0, 0, 0));
    const startOfPrevMonth = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0, 0));
    const endOfPrevMonth   = new Date(Date.UTC(y, m, 1, 4, 59, 59, 999));

    const [
      todaySales,
      monthSales,
      prevMonthSales,
      lowStockCount,
      pendingOrders,
      topProducts,
      salesLastWeek,
      recentSales,
    ] = await Promise.all([
      // Ventas de hoy
      prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfDay, lte: endOfDay } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Ventas del mes
      prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Ventas mes anterior
      prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Productos con stock bajo
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint as count FROM products
        WHERE deleted_at IS NULL AND status = 'ACTIVE' AND current_stock <= min_stock
      `,
      // Órdenes de compra pendientes
      prisma.purchaseOrder.count({
        where: { status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT'] } },
      }),
      // Top 10 productos del mes
      prisma.saleItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          sale: { status: 'COMPLETED', createdAt: { gte: startOfMonth } },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 10,
      }),
      // Ventas últimos 7 días (para gráfica) — agrupar por fecha en zona Lima
      prisma.$queryRaw<{ date: string; total: number; count: bigint }[]>`
        SELECT
          TO_CHAR(created_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') as date,
          SUM(total_amount)::float as total,
          COUNT(*)::bigint as count
        FROM sales
        WHERE status = 'COMPLETED'
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY TO_CHAR(created_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD')
        ORDER BY date ASC
      `,
      // Ventas recientes
      prisma.sale.findMany({
        where: { status: 'COMPLETED' },
        include: {
          cashier: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const todayTotal = Number(todaySales._sum.totalAmount ?? 0);
    const monthTotal = Number(monthSales._sum.totalAmount ?? 0);
    const prevMonthTotal = Number(prevMonthSales._sum.totalAmount ?? 0);
    const monthGrowth = prevMonthTotal > 0
      ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100
      : 0;

    const result = {
      kpis: {
        todaySales: { total: todayTotal, count: todaySales._count.id },
        monthSales: { total: monthTotal, count: monthSales._count.id, growth: monthGrowth },
        lowStockCount: Number((lowStockCount[0] as { count: bigint }).count),
        pendingOrders,
      },
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: Number(p._sum.quantity ?? 0),
        revenue: Number(p._sum.subtotal ?? 0),
      })),
      salesChart: salesLastWeek.map((d) => ({
        date: d.date,
        total: Number(d.total),
        count: Number(d.count),
      })),
      recentSales: recentSales.map((s) => ({
        ...s,
        totalAmount: Number(s.totalAmount),
        _count: { items: Number(s._count.items) },
      })),
    };

    await redis.setex(cacheKey, CACHE_TTL.DASHBOARD, JSON.stringify(result));
    return result;
  }

  async getSalesReport(range: DateRange, groupBy: 'day' | 'week' | 'month' = 'day') {
    const groupFormat = {
      day: 'YYYY-MM-DD',
      week: 'IYYY-IW',
      month: 'YYYY-MM',
    }[groupBy];

    const [summary, byCategory, byPaymentMethod, dailySales] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          status: { in: ['COMPLETED', 'PARTIALLY_RETURNED'] },
          createdAt: { gte: range.from, lte: range.to },
        },
        _sum: { totalAmount: true, discountAmount: true, taxAmount: true },
        _count: { id: true },
        _avg: { totalAmount: true },
      }),
      // Ventas por categoría
      prisma.$queryRaw<{ category: string; total: number; quantity: number }[]>`
        SELECT
          c.name as category,
          SUM(si.subtotal)::float as total,
          SUM(si.quantity)::float as quantity
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY c.name
        ORDER BY total DESC
      `,
      // Por método de pago
      prisma.$queryRaw<{ method: string; total: number; count: bigint }[]>`
        SELECT
          sp.method,
          SUM(sp.amount)::float as total,
          COUNT(*)::bigint as count
        FROM sale_payments sp
        JOIN sales s ON sp.sale_id = s.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY sp.method
        ORDER BY total DESC
      `,
      // Por período — agrupar en zona Lima para evitar desfase UTC
      prisma.$queryRaw<{ period: string; total: number; count: bigint }[]>`
        SELECT
          TO_CHAR(created_at AT TIME ZONE 'America/Lima', ${groupFormat}) as period,
          SUM(total_amount)::float as total,
          COUNT(*)::bigint as count
        FROM sales
        WHERE status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY period
        ORDER BY period ASC
      `,
    ]);

    return {
      range,
      summary: {
        total: Number(summary._sum.totalAmount ?? 0),
        count: summary._count.id,
        average: Number(summary._avg.totalAmount ?? 0),
        discounts: Number(summary._sum.discountAmount ?? 0),
        taxes: Number(summary._sum.taxAmount ?? 0),
      },
      byCategory,
      byPaymentMethod: byPaymentMethod.map((m) => ({ ...m, count: Number(m.count) })),
      byCashier: [],
      chart: dailySales.map((d) => ({ ...d, count: Number(d.count) })),
    };
  }

  async getInventoryReport() {
    const [totalValue, byCategory, lowStock, expiringSoon, noMovement] = await Promise.all([
      prisma.$queryRaw<{ cost_value: number; sale_value: number }[]>`
        SELECT
          SUM(current_stock * cost_price)::float as cost_value,
          SUM(current_stock * sale_price)::float as sale_value
        FROM products
        WHERE deleted_at IS NULL AND status = 'ACTIVE'
      `,
      prisma.$queryRaw<{ category: string; products: bigint; cost_value: number; sale_value: number }[]>`
        SELECT
          c.name as category,
          COUNT(p.id)::bigint as products,
          SUM(p.current_stock * p.cost_price)::float as cost_value,
          SUM(p.current_stock * p.sale_price)::float as sale_value
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
        GROUP BY c.name
        ORDER BY sale_value DESC
      `,
      prisma.product.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          currentStock: { lte: prisma.product.fields.minStock },
        },
        include: { category: { select: { name: true } } },
        orderBy: { currentStock: 'asc' },
        take: 50,
      }),
      prisma.batch.findMany({
        where: {
          expiryDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          product: { select: { name: true, currentStock: true } },
        },
        orderBy: { expiryDate: 'asc' },
      }),
      // Productos sin movimiento en 30 días
      prisma.$queryRaw<{ id: string; name: string; current_stock: number; last_movement: Date | null }[]>`
        SELECT
          p.id,
          p.name,
          p.current_stock,
          MAX(im.created_at) as last_movement
        FROM products p
        LEFT JOIN inventory_movements im ON p.id = im.product_id
        WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
        GROUP BY p.id, p.name, p.current_stock
        HAVING MAX(im.created_at) < NOW() - INTERVAL '30 days' OR MAX(im.created_at) IS NULL
        ORDER BY last_movement ASC NULLS FIRST
        LIMIT 50
      `,
    ]);

    return {
      totalValue: {
        cost: Number((totalValue[0] as { cost_value: number })?.cost_value ?? 0),
        sale: Number((totalValue[0] as { sale_value: number })?.sale_value ?? 0),
      },
      byCategory: byCategory.map((c) => ({ ...c, products: Number(c.products) })),
      lowStock,
      expiringSoon,
      noMovement,
    };
  }

  async getTopProducts(range: DateRange, limit = 20) {
    return prisma.$queryRaw<{
      product_id: string;
      name: string;
      barcode: string | null;
      category: string;
      quantity: number;
      revenue: number;
      transactions: bigint;
    }[]>`
      SELECT
        p.id as product_id,
        p.name,
        p.barcode,
        c.name as category,
        SUM(si.quantity)::float as quantity,
        SUM(si.subtotal)::float as revenue,
        COUNT(DISTINCT si.sale_id)::bigint as transactions
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
        AND s.created_at BETWEEN ${range.from} AND ${range.to}
      GROUP BY p.id, p.name, p.barcode, c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Margen/utilidad real por periodo: usa el costo promedio ponderado que
   * quedó guardado en cada línea de venta en el momento exacto de venderse
   * (SaleItem.costPrice), no el costo actual del producto — así el margen de
   * una venta pasada no cambia cuando el costo sigue moviéndose después.
   * Las ventas de antes de este cambio no tienen ese costo guardado; se
   * cuentan aparte (itemsWithoutCost) en vez de tratarlas como costo cero.
   */
  async getMarginReport(range: DateRange, groupBy: 'day' | 'week' | 'month' = 'day') {
    const groupFormat = {
      day: 'YYYY-MM-DD',
      week: 'IYYY-IW',
      month: 'YYYY-MM',
    }[groupBy];

    const [summaryRows, chart, byProduct] = await Promise.all([
      prisma.$queryRaw<{ revenue: number; cost: number; items_without_cost: bigint }[]>`
        SELECT
          SUM(si.subtotal)::float as revenue,
          SUM(si.quantity * COALESCE(si.cost_price, 0))::float as cost,
          COUNT(*) FILTER (WHERE si.cost_price IS NULL)::bigint as items_without_cost
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `,
      prisma.$queryRaw<{ period: string; revenue: number; cost: number }[]>`
        SELECT
          TO_CHAR(s.created_at AT TIME ZONE 'America/Lima', ${groupFormat}) as period,
          SUM(si.subtotal)::float as revenue,
          SUM(si.quantity * COALESCE(si.cost_price, 0))::float as cost
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY period
        ORDER BY period ASC
      `,
      prisma.$queryRaw<{ product_id: string; name: string; revenue: number; cost: number; quantity: number }[]>`
        SELECT
          p.id as product_id,
          p.name,
          SUM(si.subtotal)::float as revenue,
          SUM(si.quantity * COALESCE(si.cost_price, 0))::float as cost,
          SUM(si.quantity)::float as quantity
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY p.id, p.name
        ORDER BY (SUM(si.subtotal) - SUM(si.quantity * COALESCE(si.cost_price, 0))) DESC
        LIMIT 20
      `,
    ]);

    const row = summaryRows[0];
    const revenue = Number(row?.revenue ?? 0);
    const cost = Number(row?.cost ?? 0);
    const margin = revenue - cost;

    return {
      range,
      summary: {
        revenue,
        cost,
        margin,
        marginPercent: revenue > 0 ? (margin / revenue) * 100 : 0,
        itemsWithoutCost: Number(row?.items_without_cost ?? 0),
      },
      chart: chart.map((c) => ({
        period: c.period,
        revenue: Number(c.revenue ?? 0),
        cost: Number(c.cost ?? 0),
        margin: Number(c.revenue ?? 0) - Number(c.cost ?? 0),
      })),
      byProduct: byProduct.map((p) => {
        const pRevenue = Number(p.revenue ?? 0);
        const pCost = Number(p.cost ?? 0);
        return {
          productId: p.product_id,
          name: p.name,
          quantity: Number(p.quantity ?? 0),
          revenue: pRevenue,
          cost: pCost,
          margin: pRevenue - pCost,
          marginPercent: pRevenue > 0 ? ((pRevenue - pCost) / pRevenue) * 100 : 0,
        };
      }),
    };
  }

  /** Cuentas por cobrar: clientes con deuda y hace cuánto tienen su venta fiada más antigua sin pagar. */
  async getAccountsReceivable() {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null, currentBalance: { gt: 0 } },
      orderBy: { currentBalance: 'desc' },
      select: {
        id: true, firstName: true, lastName: true, phone: true, currentBalance: true,
        sales: {
          where: { isCredit: true, status: 'COMPLETED' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, saleNumber: true, createdAt: true, totalAmount: true, paidAmount: true },
          take: 100,
        },
      },
    });

    return customers.map((c) => {
      const unpaidSales = c.sales.filter((s) => Number(s.totalAmount) - Number(s.paidAmount) > 0.009);
      const oldest = unpaidSales[0];
      const daysOverdue = oldest ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 86_400_000) : 0;
      return {
        customerId: c.id,
        customerName: `${c.firstName} ${c.lastName ?? ''}`.trim(),
        phone: c.phone,
        balance: Number(c.currentBalance),
        unpaidSalesCount: unpaidSales.length,
        oldestUnpaidSale: oldest ? { id: oldest.id, saleNumber: oldest.saleNumber, createdAt: oldest.createdAt } : null,
        daysOverdue,
      };
    });
  }
}

export const reportsService = new ReportsService();
