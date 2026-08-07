import { ProductStatus, UnitOfMeasure, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { redis, CACHE_TTL } from '../../config/redis';
import { NotFoundError, ConflictError, BusinessError } from '../../utils/errors';

export interface CreateProductInput {
  name: string;
  description?: string | null;
  barcode?: string | null;
  internalCode?: string | null;
  sku?: string | null;
  categoryId: string;
  brandId?: string | null;
  supplierId?: string | null;
  taxRateId?: string | null;
  unitOfMeasure: UnitOfMeasure;
  costPrice: number;
  salePrice: number;
  wholesalePrice?: number | null;
  minStock: number;
  maxStock?: number | null;
  currentStock?: number;
  trackExpiry?: boolean;
  trackBatch?: boolean;
  isBulk?: boolean;
  bulkUnit?: string | null;
  bottleDeposit?: number;
  imageUrl?: string | null;
  isFavorite?: boolean;
}

interface UpdateProductInput extends Partial<CreateProductInput> {
  status?: ProductStatus;
}

export interface SearchProductsQuery {
  q?: string;
  categoryId?: string;
  supplierId?: string;
  status?: ProductStatus;
  lowStock?: boolean;
  isBulk?: boolean;
  favorite?: boolean;
  page: number;
  limit: number;
  sortBy?: 'name' | 'salePrice' | 'currentStock' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export class ProductsService {
  async create(input: CreateProductInput) {
    // Cadena vacía no es lo mismo que null para la restricción unique de
    // Postgres: dos productos sin código de barras con "" chocan entre sí,
    // mientras que con NULL no (NULL nunca es igual a NULL). Normalizamos acá
    // para que "dejar el campo en blanco" nunca produzca un falso conflicto.
    input.barcode = input.barcode || null;
    input.internalCode = input.internalCode || null;
    input.sku = input.sku || null;

    if (input.barcode) {
      const existing = await prisma.product.findFirst({ where: { barcode: input.barcode, deletedAt: null } });
      if (existing) throw new ConflictError(`El código de barras ${input.barcode} ya está registrado.`);
    }

    if (input.internalCode) {
      const existing = await prisma.product.findFirst({ where: { internalCode: input.internalCode, deletedAt: null } });
      if (existing) throw new ConflictError(`El código interno ${input.internalCode} ya está registrado.`);
    } else {
      // Sin código interno indicado: se asigna el siguiente correlativo
      // PROxxx automáticamente, para no depender de que alguien lo escriba.
      input.internalCode = await this.nextInternalCode();
    }

    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new NotFoundError('Categoría');

    const product = await prisma.product.create({
      data: {
        name: input.name,
        description: input.description,
        barcode: input.barcode,
        internalCode: input.internalCode,
        sku: input.sku,
        categoryId: input.categoryId,
        brandId: input.brandId,
        supplierId: input.supplierId,
        taxRateId: input.taxRateId,
        unitOfMeasure: input.unitOfMeasure,
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        wholesalePrice: input.wholesalePrice,
        minStock: input.minStock,
        maxStock: input.maxStock,
        currentStock: input.currentStock ?? 0,
        trackExpiry: input.trackExpiry ?? false,
        trackBatch: input.trackBatch ?? false,
        isBulk: input.isBulk ?? false,
        bulkUnit: input.bulkUnit,
        bottleDeposit: input.bottleDeposit ?? 0,
        imageUrl: input.imageUrl,
        isFavorite: input.isFavorite ?? false,
      },
      include: { category: true, brand: true, supplier: true },
    });

    if ((input.currentStock ?? 0) > 0) {
      await prisma.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'INITIAL_STOCK',
          quantity: input.currentStock ?? 0,
          quantityBefore: 0,
          quantityAfter: input.currentStock ?? 0,
          unitCost: input.costPrice,
          notes: 'Stock inicial',
        },
      });
    }

    await redis.del('products:search:*');
    return product;
  }

  // Código interno correlativo (PRO001, PRO002...) — se calcula a partir del
  // máximo ya usado en vez de contar filas, así no se rompe si alguno fue
  // liberado (producto eliminado) y deja un hueco en la secuencia.
  private async nextInternalCode(): Promise<string> {
    const rows = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(internal_code FROM 4) AS INTEGER)) as max
      FROM products WHERE internal_code ~ '^PRO[0-9]+$'
    `;
    const next = (rows[0]?.max ?? 0) + 1;
    return `PRO${String(next).padStart(3, '0')}`;
  }

  async search(query: SearchProductsQuery) {
    const { q, categoryId, supplierId, status, lowStock, isBulk, favorite, page, limit, sortBy = 'name', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;

    // Si la categoría filtrada tiene subcategorías, hay que incluir también
    // sus productos — las categorías "generales" (padre) casi nunca tienen
    // productos asignados directamente, todo vive en las subcategorías.
    let categoryFilter: Prisma.ProductWhereInput = {};
    if (categoryId) {
      const children = await prisma.category.findMany({
        where: { parentId: categoryId }, select: { id: true },
      });
      categoryFilter = { categoryId: children.length > 0 ? { in: [categoryId, ...children.map(c => c.id)] } : categoryId };
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status ? { status } : { status: { not: 'DISCONTINUED' } }),
      ...categoryFilter,
      ...(supplierId ? { supplierId } : {}),
      ...(lowStock ? { currentStock: { lte: prisma.product.fields.minStock } } : {}),
      ...(isBulk !== undefined ? { isBulk } : {}),
      ...(favorite !== undefined ? { isFavorite: favorite } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { barcode: { equals: q } },
              { internalCode: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, parent: { select: { name: true } } } },
          brand: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      data: products,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        brand: true,
        supplier: true,
        taxRate: true,
        variants: { where: { isActive: true } },
        batches: {
          orderBy: { expiryDate: 'asc' },
          take: 10,
        },
        stockAlerts: { where: { isActive: true } },
      },
    });

    if (!product) throw new NotFoundError('Producto');
    return product;
  }

  async getByBarcode(barcode: string) {
    const product = await prisma.product.findFirst({
      where: { barcode, deletedAt: null, status: 'ACTIVE' },
      include: {
        category: { select: { id: true, name: true } },
        taxRate: true,
      },
    });

    if (!product) throw new NotFoundError('Producto con código de barras ' + barcode);
    return product;
  }

  /* ── Comparación de precios entre proveedores ─────────────────────────────── */
  async getSuppliers(productId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    if (!product) throw new NotFoundError('Producto');

    const rows = await prisma.supplierProduct.findMany({
      where: { productId },
      include: { supplier: { select: { id: true, businessName: true, phone: true } } },
      orderBy: { price: 'asc' },
    });

    const cheapestPrice = rows.length > 0 ? Math.min(...rows.map(r => Number(r.price))) : null;

    return rows.map(r => ({
      supplierId: r.supplierId,
      supplierName: r.supplier.businessName,
      supplierPhone: r.supplier.phone,
      price: Number(r.price),
      supplierSku: r.supplierSku,
      isPreferred: r.isPreferred,
      isCheapest: cheapestPrice !== null && Number(r.price) === cheapestPrice,
      lastPurchaseAt: r.lastPurchaseAt,
    }));
  }

  // Kardex de costos: cómo fue variando el costo promedio ponderado de un
  // producto con cada compra o bonificación recibida (y sus anulaciones).
  async getCostHistory(productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, name: true, costPrice: true },
    });
    if (!product) throw new NotFoundError('Producto');

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId, avgCostAfter: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      productName: product.name,
      currentCost: Number(product.costPrice),
      history: movements.map((m) => ({
        id: m.id,
        date: m.createdAt,
        type: m.type,
        quantity: Number(m.quantity),
        unitCost: m.unitCost != null ? Number(m.unitCost) : null,
        avgCostBefore: m.avgCostBefore != null ? Number(m.avgCostBefore) : null,
        avgCostAfter: m.avgCostAfter != null ? Number(m.avgCostAfter) : null,
        notes: m.notes,
        referenceId: m.referenceId,
      })),
    };
  }

  async update(id: string, input: UpdateProductInput) {
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    if ('barcode' in input) input.barcode = input.barcode || null;
    if ('internalCode' in input) input.internalCode = input.internalCode || null;
    if ('sku' in input) input.sku = input.sku || null;

    if (input.barcode && input.barcode !== product.barcode) {
      const existing = await prisma.product.findFirst({
        where: { barcode: input.barcode, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictError(`El código de barras ${input.barcode} ya está registrado.`);
    }

    if (input.internalCode && input.internalCode !== product.internalCode) {
      const existing = await prisma.product.findFirst({
        where: { internalCode: input.internalCode, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictError(`El código interno ${input.internalCode} ya está registrado.`);
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        barcode: input.barcode,
        internalCode: input.internalCode,
        sku: input.sku,
        categoryId: input.categoryId,
        brandId: input.brandId,
        supplierId: input.supplierId,
        taxRateId: input.taxRateId,
        unitOfMeasure: input.unitOfMeasure,
        costPrice: input.costPrice !== undefined ? input.costPrice : undefined,
        salePrice: input.salePrice !== undefined ? input.salePrice : undefined,
        wholesalePrice: input.wholesalePrice,
        minStock: input.minStock,
        maxStock: input.maxStock,
        trackExpiry: input.trackExpiry,
        trackBatch: input.trackBatch,
        isBulk: input.isBulk,
        bulkUnit: input.bulkUnit,
        bottleDeposit: input.bottleDeposit,
        imageUrl: input.imageUrl,
        status: input.status,
        isFavorite: input.isFavorite,
      },
      include: { category: true, brand: true },
    });

    await redis.del('products:search:*');
    return updated;
  }

  // Reasignar categoría y/o estado a muchos productos a la vez — pensado
  // para reorganizar el catálogo en subcategorías nuevas sin editar producto
  // por producto.
  async bulkUpdate(productIds: string[], data: { categoryId?: string; status?: ProductStatus }) {
    if (data.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new NotFoundError('Categoría');
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: productIds }, deletedAt: null },
      data: {
        ...(data.categoryId ? { categoryId: data.categoryId } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await redis.del('products:search:*');
    return { updated: result.count };
  }

  async softDelete(id: string) {
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    const hasSales = await prisma.saleItem.count({ where: { productId: id } });
    if (hasSales > 0) {
      // Solo desactivar, no eliminar
      await prisma.product.update({
        where: { id },
        data: { status: 'DISCONTINUED' },
      });
      return { discontinued: true };
    }

    // Liberar barcode/internalCode/sku al eliminar — de lo contrario quedan
    // "atrapados" en esta fila (la restricción unique de Postgres no distingue
    // filas eliminadas lógicamente) y nadie puede volver a crear un producto
    // con ese mismo código hasta que alguien los limpie a mano.
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE', barcode: null, internalCode: null, sku: null },
    });

    return { deleted: true };
  }

  async adjustStock(
    productId: string,
    userId: string,
    physicalQuantity: number,
    reason: string,
    notes?: string,
  ) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Producto');

    const currentStock = Number(product.currentStock);
    const difference = physicalQuantity - currentStock;
    const movementType = difference >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          userId,
          reason,
          notes,
          items: {
            create: {
              productId,
              systemQuantity: currentStock,
              physicalQuantity,
              difference,
              unitCost: Number(product.costPrice),
            },
          },
        },
      });

      await tx.product.update({
        where: { id: productId },
        data: { currentStock: physicalQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          productId,
          type: movementType,
          quantity: Math.abs(difference),
          quantityBefore: currentStock,
          quantityAfter: physicalQuantity,
          unitCost: product.costPrice,
          referenceType: 'ADJUSTMENT',
          referenceId: adjustment.id,
          notes: reason,
          userId,
        },
      });

      // Actualizar alerta de stock bajo
      if (physicalQuantity <= Number(product.minStock)) {
        await tx.stockAlert.upsert({
          where: {
            productId_alertType: { productId, alertType: 'LOW_STOCK' } as never,
          },
          create: { productId, alertType: 'LOW_STOCK', threshold: Math.round(Number(product.minStock)), isActive: true },
          update: { isActive: true },
        } as never);
      } else {
        await tx.stockAlert.updateMany({
          where: { productId, alertType: 'LOW_STOCK' },
          data: { isActive: false, resolvedAt: new Date() },
        });
      }
    });

    return prisma.product.findUnique({ where: { id: productId } });
  }

  async getMovements(productId: string, page: number, limit: number) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    const skip = (page - 1) * limit;
    const [movements, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryMovement.count({ where: { productId } }),
    ]);

    return {
      product: { id: product.id, name: product.name, currentStock: product.currentStock },
      data: movements,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getLowStockAlerts() {
    return prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        currentStock: { lte: prisma.product.fields.minStock },
      },
      include: {
        category: { select: { name: true } },
        supplier: { select: { businessName: true, phone: true } },
      },
      orderBy: { currentStock: 'asc' },
    });
  }

  async importFromCSV(rows: Record<string, string>[], userId: string) {
    const results = { created: 0, errors: [] as { row: number; error: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const category = await prisma.category.findFirst({
          where: { name: { equals: row['categoria'], mode: 'insensitive' } },
        });
        if (!category) {
          results.errors.push({ row: i + 2, error: `Categoría '${row['categoria']}' no encontrada` });
          continue;
        }

        await this.create({
          name: row['nombre'],
          barcode: row['codigo_barras'] || undefined,
          internalCode: row['codigo_interno'] || undefined,
          categoryId: category.id,
          unitOfMeasure: (row['unidad'] as UnitOfMeasure) || 'UNIT',
          costPrice: parseFloat(row['precio_costo']) || 0,
          salePrice: parseFloat(row['precio_venta']) || 0,
          minStock: parseFloat(row['stock_minimo']) || 0,
          currentStock: parseFloat(row['stock_actual']) || 0,
        });
        results.created++;
      } catch (err) {
        results.errors.push({
          row: i + 2,
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }

    return results;
  }

  /* ── Códigos de barra internos ────────────────────────────────────────────
   * Prefijo "20" está reservado internacionalmente para uso interno/de
   * circulación restringida (nunca lo usa un fabricante real), así que estos
   * códigos jamás chocan con uno de fábrica y se leen con cualquier lector
   * estándar como un EAN-13 más. */

  private computeEan13CheckDigit(digits12: string): string {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = Number(digits12[i]);
      sum += i % 2 === 0 ? d : d * 3;
    }
    return String((10 - (sum % 10)) % 10);
  }

  private async nextInternalBarcode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await prisma.product.count({ where: { barcode: { startsWith: '20' } } });
      const seq = String(count + 1 + attempt).padStart(10, '0');
      const first12 = `20${seq}`;
      const candidate = `${first12}${this.computeEan13CheckDigit(first12)}`;
      const existing = await prisma.product.findUnique({ where: { barcode: candidate } });
      if (!existing) return candidate;
    }
    throw new BusinessError('No se pudo generar un código de barras único, intenta de nuevo.');
  }

  async generateBarcode(productId: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');
    if (product.barcode) throw new BusinessError('Este producto ya tiene un código de barras.');

    const barcode = await this.nextInternalBarcode();
    return prisma.product.update({ where: { id: productId }, data: { barcode } });
  }

  /** Genera códigos para todos los productos sin barcode, o solo los indicados. */
  async generateBarcodesBulk(productIds?: string[]) {
    const where: Prisma.ProductWhereInput = { deletedAt: null, barcode: null };
    if (productIds && productIds.length > 0) where.id = { in: productIds };

    const products = await prisma.product.findMany({ where, select: { id: true, name: true } });
    const results: { id: string; name: string; barcode: string }[] = [];
    for (const p of products) {
      const barcode = await this.nextInternalBarcode();
      await prisma.product.update({ where: { id: p.id }, data: { barcode } });
      results.push({ id: p.id, name: p.name, barcode });
    }
    return results;
  }
}

export const productsService = new ProductsService();
