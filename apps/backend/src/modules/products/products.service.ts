import { ProductStatus, UnitOfMeasure, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { redis, CACHE_TTL } from '../../config/redis';
import { NotFoundError, ConflictError, BusinessError } from '../../utils/errors';

export interface CreateProductInput {
  name: string;
  description?: string;
  barcode?: string;
  internalCode?: string;
  sku?: string;
  categoryId: string;
  brandId?: string;
  supplierId?: string;
  taxRateId?: string;
  unitOfMeasure: UnitOfMeasure;
  costPrice: number;
  salePrice: number;
  wholesalePrice?: number;
  minStock: number;
  maxStock?: number;
  currentStock?: number;
  trackExpiry?: boolean;
  trackBatch?: boolean;
  isBulk?: boolean;
  bulkUnit?: string;
  imageUrl?: string;
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
  page: number;
  limit: number;
  sortBy?: 'name' | 'salePrice' | 'currentStock' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export class ProductsService {
  async create(input: CreateProductInput) {
    if (input.barcode) {
      const existing = await prisma.product.findUnique({ where: { barcode: input.barcode } });
      if (existing) throw new ConflictError(`El código de barras ${input.barcode} ya está registrado.`);
    }

    if (input.internalCode) {
      const existing = await prisma.product.findUnique({ where: { internalCode: input.internalCode } });
      if (existing) throw new ConflictError(`El código interno ${input.internalCode} ya está registrado.`);
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
        imageUrl: input.imageUrl,
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

  async search(query: SearchProductsQuery) {
    const { q, categoryId, supplierId, status, lowStock, page, limit, sortBy = 'name', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status ? { status } : { status: { not: 'DISCONTINUED' } }),
      ...(categoryId ? { categoryId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(lowStock ? { currentStock: { lte: prisma.product.fields.minStock } } : {}),
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
          category: { select: { id: true, name: true } },
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

  async update(id: string, input: UpdateProductInput) {
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    if (input.barcode && input.barcode !== product.barcode) {
      const existing = await prisma.product.findFirst({
        where: { barcode: input.barcode, id: { not: id } },
      });
      if (existing) throw new ConflictError(`El código de barras ${input.barcode} ya está registrado.`);
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
        imageUrl: input.imageUrl,
        status: input.status,
      },
      include: { category: true, brand: true },
    });

    await redis.del('products:search:*');
    return updated;
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

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
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

    const difference = physicalQuantity - product.currentStock;
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
              systemQuantity: product.currentStock,
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
          quantityBefore: product.currentStock,
          quantityAfter: physicalQuantity,
          unitCost: product.costPrice,
          referenceType: 'ADJUSTMENT',
          referenceId: adjustment.id,
          notes: reason,
          userId,
        },
      });

      // Actualizar alerta de stock bajo
      if (physicalQuantity <= product.minStock) {
        await tx.stockAlert.upsert({
          where: {
            productId_alertType: { productId, alertType: 'LOW_STOCK' } as never,
          },
          create: { productId, alertType: 'LOW_STOCK', threshold: product.minStock, isActive: true },
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
          minStock: parseInt(row['stock_minimo']) || 0,
          currentStock: parseInt(row['stock_actual']) || 0,
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
}

export const productsService = new ProductsService();
