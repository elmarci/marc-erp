import { prisma } from '../../database/client';
import { NotFoundError } from '../../utils/errors';

export class InventoryService {

  /* ── Dashboard KPIs ─────────────────────────────────────────────────────── */
  async getDashboard() {
    const [
      totalProducts,
      outOfStock,
      lowStock,
      valueRaw,
      byCategory,
      recentMovements,
    ] = await Promise.all([
      prisma.product.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.product.count({ where: { deletedAt: null, status: 'ACTIVE', currentStock: 0 } }),
      prisma.product.count({
        where: { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 }, AND: [{ currentStock: { lte: prisma.product.fields.minStock } }] },
      }).catch(() => 0), // fallback if complex query fails
      prisma.$queryRaw<[{ cost_value: number; sale_value: number }]>`
        SELECT
          SUM(current_stock * cost_price::numeric)::float AS cost_value,
          SUM(current_stock * sale_price::numeric)::float AS sale_value
        FROM products
        WHERE deleted_at IS NULL AND status = 'ACTIVE'
      `,
      prisma.$queryRaw<{ category: string; products: number; total_stock: number; cost_value: number; sale_value: number }[]>`
        SELECT
          c.name as category,
          COUNT(p.id)::int as products,
          SUM(p.current_stock)::int as total_stock,
          SUM(p.current_stock * p.cost_price::numeric)::float as cost_value,
          SUM(p.current_stock * p.sale_price::numeric)::float as sale_value
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
        GROUP BY c.name
        ORDER BY cost_value DESC
      `,
      prisma.inventoryMovement.findMany({
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    // Low stock count via raw query (more reliable)
    const lowStockRaw = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count FROM products
      WHERE deleted_at IS NULL AND status = 'ACTIVE'
        AND current_stock > 0 AND current_stock <= min_stock
    `;

    return {
      kpis: {
        totalProducts,
        outOfStock,
        lowStock: Number(lowStockRaw[0].count),
        costValue: Number(valueRaw[0]?.cost_value ?? 0),
        saleValue: Number(valueRaw[0]?.sale_value ?? 0),
        margin: Number(valueRaw[0]?.sale_value ?? 0) - Number(valueRaw[0]?.cost_value ?? 0),
      },
      byCategory: byCategory.map(c => ({
        category: c.category,
        products: Number(c.products),
        totalStock: Number(c.total_stock),
        costValue: Number(c.cost_value),
        saleValue: Number(c.sale_value),
      })),
      recentMovements: recentMovements.map(m => ({
        ...m,
        quantity: Number(m.quantity),
        quantityBefore: Number(m.quantityBefore),
        quantityAfter: Number(m.quantityAfter),
      })),
    };
  }

  /* ── Stock Overview (todos los productos con stock) ─────────────────────── */
  async getStockOverview(filters: {
    search?: string;
    categoryId?: string;
    status?: 'all' | 'ok' | 'low' | 'out';
    page: number;
    limit: number;
  }) {
    const conditions: string[] = ["p.deleted_at IS NULL AND p.status = 'ACTIVE'"];

    if (filters.search) {
      conditions.push(`(p.name ILIKE '%${filters.search.replace(/'/g, "''")}%' OR p.barcode ILIKE '%${filters.search.replace(/'/g, "''")}%')`);
    }
    if (filters.categoryId) {
      conditions.push(`p.category_id = '${filters.categoryId}'`);
    }
    if (filters.status === 'out') {
      conditions.push('p.current_stock = 0');
    } else if (filters.status === 'low') {
      conditions.push('p.current_stock > 0 AND p.current_stock <= p.min_stock');
    } else if (filters.status === 'ok') {
      conditions.push('p.current_stock > p.min_stock');
    }

    const where = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.limit;

    const [data, countRaw] = await Promise.all([
      prisma.$queryRawUnsafe<{
        id: string; name: string; barcode: string | null; sku: string | null;
        current_stock: number; min_stock: number; max_stock: number | null;
        cost_price: number; sale_price: number;
        category: string; category_id: string;
        last_movement: string | null;
      }[]>(`
        SELECT p.id, p.name, p.barcode, p.sku,
          p.current_stock, p.min_stock, p.max_stock,
          p.cost_price::float, p.sale_price::float,
          c.name as category, c.id as category_id,
          (SELECT MAX(im.created_at)::text FROM inventory_movements im WHERE im.product_id = p.id) as last_movement
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE ${where}
        ORDER BY
          CASE WHEN p.current_stock = 0 THEN 0
               WHEN p.current_stock <= p.min_stock THEN 1
               ELSE 2 END,
          p.name ASC
        LIMIT ${filters.limit} OFFSET ${offset}
      `),
      prisma.$queryRawUnsafe<[{ count: bigint }]>(`
        SELECT COUNT(*)::bigint as count FROM products p WHERE ${where}
      `),
    ]);

    const total = Number(countRaw[0].count);
    return {
      data: data.map(p => ({
        ...p,
        current_stock: Number(p.current_stock),
        min_stock: Number(p.min_stock),
        max_stock: p.max_stock != null ? Number(p.max_stock) : null,
        cost_price: Number(p.cost_price),
        sale_price: Number(p.sale_price),
        stockStatus: p.current_stock === 0 ? 'out' : p.current_stock <= p.min_stock ? 'low' : 'ok',
        stockValue: Number(p.current_stock) * Number(p.cost_price),
      })),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /* ── Exportar stock a Excel (mismos filtros que getStockOverview, sin paginar) ── */
  async exportStock(filters: { search?: string; categoryId?: string; status?: 'all' | 'ok' | 'low' | 'out' }) {
    const conditions: string[] = ["p.deleted_at IS NULL AND p.status = 'ACTIVE'"];

    if (filters.search) {
      conditions.push(`(p.name ILIKE '%${filters.search.replace(/'/g, "''")}%' OR p.barcode ILIKE '%${filters.search.replace(/'/g, "''")}%')`);
    }
    if (filters.categoryId) {
      conditions.push(`p.category_id = '${filters.categoryId}'`);
    }
    if (filters.status === 'out') {
      conditions.push('p.current_stock = 0');
    } else if (filters.status === 'low') {
      conditions.push('p.current_stock > 0 AND p.current_stock <= p.min_stock');
    } else if (filters.status === 'ok') {
      conditions.push('p.current_stock > p.min_stock');
    }

    const where = conditions.join(' AND ');

    return prisma.$queryRawUnsafe<{
      name: string; barcode: string | null; sku: string | null;
      current_stock: number; min_stock: number; max_stock: number | null;
      cost_price: number; sale_price: number; category: string;
    }[]>(`
      SELECT p.name, p.barcode, p.sku,
        p.current_stock, p.min_stock, p.max_stock,
        p.cost_price::float, p.sale_price::float,
        c.name as category
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE ${where}
      ORDER BY p.name ASC
    `);
  }

  /* ── Movimientos (con filtros) ───────────────────────────────────────────── */
  async listMovements(filters: {
    productId?: string;
    type?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.productId) where['productId'] = filters.productId;
    if (filters.type) where['type'] = filters.type;
    if (filters.from || filters.to) {
      where['createdAt'] = {};
      if (filters.from) (where['createdAt'] as Record<string, unknown>)['gte'] = filters.from;
      if (filters.to) (where['createdAt'] as Record<string, unknown>)['lte'] = filters.to;
    }

    const [data, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: { product: { select: { id: true, name: true, barcode: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  /* ── Ajuste rápido de un producto ─────────────────────────────────────────── */
  async quickAdjust(userId: string, productId: string, newQuantity: number, reason: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    const diff = newQuantity - product.currentStock;

    return prisma.$transaction(async (tx) => {
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          userId, reason,
          items: {
            create: [{
              productId,
              systemQuantity: product.currentStock,
              physicalQuantity: newQuantity,
              difference: diff,
              unitCost: product.costPrice,
            }],
          },
        },
      });

      await tx.product.update({ where: { id: productId }, data: { currentStock: newQuantity } });

      if (diff !== 0) {
        await tx.inventoryMovement.create({
          data: {
            productId,
            type: diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            quantity: Math.abs(diff),
            quantityBefore: product.currentStock,
            quantityAfter: newQuantity,
            unitCost: product.costPrice,
            referenceType: 'ADJUSTMENT',
            referenceId: adjustment.id,
            userId, notes: reason,
          },
        });
      }

      return { productId, before: product.currentStock, after: newQuantity, diff };
    });
  }

  /* ── Ajuste masivo ──────────────────────────────────────────────────────── */
  async createAdjustment(userId: string, reason: string, notes: string | undefined, items: Array<{ productId: string; physicalQuantity: number }>) {
    const products = await prisma.product.findMany({ where: { id: { in: items.map(i => i.productId) } } });
    const productMap = new Map(products.map(p => [p.id, p]));
    for (const item of items) {
      if (!productMap.has(item.productId)) throw new NotFoundError(`Producto ${item.productId}`);
    }

    return prisma.$transaction(async (tx) => {
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          userId, reason, notes,
          items: {
            create: items.map(item => {
              const product = productMap.get(item.productId)!;
              return {
                productId: item.productId,
                systemQuantity: product.currentStock,
                physicalQuantity: item.physicalQuantity,
                difference: item.physicalQuantity - product.currentStock,
                unitCost: product.costPrice,
              };
            }),
          },
        },
        include: { items: true },
      });

      for (const item of items) {
        const product = productMap.get(item.productId)!;
        const diff = item.physicalQuantity - product.currentStock;
        if (diff === 0) continue;
        await tx.product.update({ where: { id: item.productId }, data: { currentStock: item.physicalQuantity } });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            quantity: Math.abs(diff),
            quantityBefore: product.currentStock,
            quantityAfter: item.physicalQuantity,
            unitCost: product.costPrice,
            referenceType: 'ADJUSTMENT',
            referenceId: adjustment.id,
            userId, notes: reason,
          },
        });
      }
      return adjustment;
    });
  }

  /* ── Listado de ajustes ─────────────────────────────────────────────────── */
  async listAdjustments(filters: { page: number; limit: number }) {
    const [data, total] = await Promise.all([
      prisma.inventoryAdjustment.findMany({
        include: {
          user: { select: { firstName: true, lastName: true } },
          items: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.inventoryAdjustment.count(),
    ]);

    const productIds = [...new Set(data.flatMap(a => a.items.map(i => i.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    const productMap = new Map(products.map(p => [p.id, p.name]));

    return {
      data: data.map(a => ({
        ...a,
        items: a.items.map(i => ({ ...i, productName: productMap.get(i.productId) ?? i.productId })),
      })),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /* ── Low Stock ──────────────────────────────────────────────────────────── */
  // El proveedor "elegido" por producto ya no depende solo del campo fijo
  // Product.supplierId: si hay catálogo real (SupplierProduct), manda el
  // proveedor marcado como preferido, o si no el que vende más barato — así
  // los pedidos sugeridos usan lógica de abastecimiento real, no un dato fijo.
  async getLowStockProducts() {
    const products = await prisma.$queryRaw<{
      id: string; name: string; barcode: string | null; current_stock: number; min_stock: number;
      max_stock: number | null; category: string; cost_price: number;
      supplier_id: string | null; supplier_name: string | null;
    }[]>`
      SELECT
        p.id, p.name, p.barcode, p.current_stock, p.min_stock, p.max_stock, c.name as category,
        p.cost_price::float as cost_price, p.supplier_id, s.business_name as supplier_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE' AND p.current_stock <= p.min_stock
      ORDER BY (p.current_stock::float / NULLIF(p.min_stock, 0)) ASC, p.name ASC
    `;

    if (products.length === 0) return [];

    const catalogRows = await prisma.supplierProduct.findMany({
      where: { productId: { in: products.map(p => p.id) } },
      include: { supplier: { select: { businessName: true } } },
    });
    const byProduct = new Map<string, typeof catalogRows>();
    for (const row of catalogRows) {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    }

    return products.map(p => {
      const candidates = byProduct.get(p.id) ?? [];
      const preferred = candidates.find(c => c.isPreferred);
      const cheapest = candidates.length > 0
        ? candidates.reduce((min, c) => (Number(c.price) < Number(min.price) ? c : min))
        : null;
      const best = preferred ?? cheapest;

      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        current_stock: Number(p.current_stock),
        min_stock: Number(p.min_stock),
        category: p.category,
        cost_price: best ? Number(best.price) : Number(p.cost_price),
        supplier_id: best?.supplierId ?? p.supplier_id,
        supplier_name: best?.supplier.businessName ?? p.supplier_name,
        supplier_source: preferred ? 'preferred' as const : cheapest ? 'cheapest' as const : p.supplier_id ? 'legacy' as const : null,
        alternatives_count: candidates.length,
        suggested_qty: Math.max((p.max_stock != null ? Number(p.max_stock) : Number(p.min_stock) * 2) - Number(p.current_stock), 1),
      };
    });
  }
}

export const inventoryService = new InventoryService();
