import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';

export class SuppliersService {
  async list(filters: { search?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.search) {
      where['OR'] = [
        { businessName: { contains: filters.search, mode: 'insensitive' } },
        { taxId: { contains: filters.search } },
        { contactName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: { select: { purchaseOrders: true } },
        },
        orderBy: { businessName: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  // Mismo filtro de búsqueda que list(), sin paginar — para exportar a Excel.
  async exportAll(filters: { search?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.search) {
      where['OR'] = [
        { businessName: { contains: filters.search, mode: 'insensitive' } },
        { taxId: { contains: filters.search } },
        { contactName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return prisma.supplier.findMany({
      where,
      include: { _count: { select: { purchaseOrders: true } } },
      orderBy: { businessName: 'asc' },
    });
  }

  async get(id: string) {
    const supplier = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw new NotFoundError('Proveedor');
    return supplier;
  }

  async create(data: {
    businessName: string; taxId?: string; contactName?: string;
    email?: string; phone?: string; address?: string; city?: string;
    paymentTermDays?: number; notes?: string;
  }) {
    if (data.taxId) {
      const existing = await prisma.supplier.findFirst({ where: { taxId: data.taxId, deletedAt: null } });
      if (existing) throw new BusinessError('Ya existe un proveedor con ese RUC.');
    }
    return prisma.supplier.create({ data });
  }

  async update(id: string, data: {
    businessName?: string; taxId?: string; contactName?: string;
    email?: string; phone?: string; address?: string; city?: string;
    paymentTermDays?: number; notes?: string; isActive?: boolean;
  }) {
    await this.get(id);
    if (data.taxId) {
      const existing = await prisma.supplier.findFirst({ where: { taxId: data.taxId, deletedAt: null, NOT: { id } } });
      if (existing) throw new BusinessError('Ya existe un proveedor con ese RUC.');
    }
    return prisma.supplier.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.get(id);
    // Soft delete
    return prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  /* ── Catálogo de productos por proveedor ─────────────────────────────────── */
  async listProducts(supplierId: string) {
    await this.get(supplierId);
    const rows = await prisma.supplierProduct.findMany({
      where: { supplierId },
      include: { product: { select: { id: true, name: true, barcode: true, currentStock: true, minStock: true, costPrice: true } } },
      orderBy: [{ isPreferred: 'desc' }, { product: { name: 'asc' } }],
    });
    // Decimal se serializa como string en JSON — el frontend espera number.
    return rows.map(r => ({ ...r, price: Number(r.price), product: { ...r.product, costPrice: Number(r.product.costPrice) } }));
  }

  async upsertProduct(supplierId: string, data: { productId: string; price: number; supplierSku?: string; isPreferred?: boolean }) {
    await this.get(supplierId);
    const product = await prisma.product.findFirst({ where: { id: data.productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    // Solo un proveedor preferido por producto — si se marca este, se
    // desmarca cualquier otro para no tener dos "preferidos" en simultáneo.
    if (data.isPreferred) {
      await prisma.supplierProduct.updateMany({
        where: { productId: data.productId, NOT: { supplierId } },
        data: { isPreferred: false },
      });
    }

    return prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: data.productId } },
      create: { supplierId, productId: data.productId, price: data.price, supplierSku: data.supplierSku, isPreferred: data.isPreferred ?? false },
      update: { price: data.price, supplierSku: data.supplierSku, isPreferred: data.isPreferred },
      include: { product: { select: { id: true, name: true, barcode: true } } },
    });
  }

  async removeProduct(supplierId: string, productId: string) {
    const existing = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId } } });
    if (!existing) throw new NotFoundError('Producto en el catálogo del proveedor');
    return prisma.supplierProduct.delete({ where: { supplierId_productId: { supplierId, productId } } });
  }
}

export const suppliersService = new SuppliersService();
