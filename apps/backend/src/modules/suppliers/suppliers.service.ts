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
}

export const suppliersService = new SuppliersService();
