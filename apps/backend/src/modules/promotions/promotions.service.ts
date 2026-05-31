import { prisma } from '../../database/client';
import { NotFoundError } from '../../utils/errors';

export class PromotionsService {
  async list(filters: { active?: boolean; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) where['isActive'] = filters.active;

    const [data, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        include: {
          products: { include: { product: { select: { id: true, name: true, imageUrl: true } } } },
        },
        orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.promotion.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  async get(id: string) {
    const promo = await prisma.promotion.findUnique({
      where: { id },
      include: {
        products: { include: { product: { select: { id: true, name: true, salePrice: true, imageUrl: true } } } },
      },
    });
    if (!promo) throw new NotFoundError('Oferta');
    return promo;
  }

  async create(data: {
    name: string; description?: string; type: string; value: number;
    startDate: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; priority?: number;
    productIds?: string[];
  }) {
    const { productIds, ...promoData } = data;
    return prisma.promotion.create({
      data: {
        ...promoData,
        type: promoData.type as never,
        products: productIds ? {
          create: productIds.map(productId => ({ productId })),
        } : undefined,
      },
      include: {
        products: { include: { product: { select: { id: true, name: true } } } },
      },
    });
  }

  async update(id: string, data: {
    name?: string; description?: string; type?: string; value?: number;
    startDate?: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; priority?: number;
    productIds?: string[];
  }) {
    await this.get(id);
    const { productIds, ...promoData } = data;

    // Update products if provided
    if (productIds !== undefined) {
      await prisma.promotionProduct.deleteMany({ where: { promotionId: id } });
      if (productIds.length > 0) {
        await prisma.promotionProduct.createMany({
          data: productIds.map(productId => ({ promotionId: id, productId })),
        });
      }
    }

    return prisma.promotion.update({
      where: { id },
      data: promoData as never,
      include: {
        products: { include: { product: { select: { id: true, name: true, imageUrl: true } } } },
      },
    });
  }

  async delete(id: string) {
    await this.get(id);
    await prisma.promotionProduct.deleteMany({ where: { promotionId: id } });
    await prisma.promotionCategory.deleteMany({ where: { promotionId: id } });
    return prisma.promotion.delete({ where: { id } });
  }

  async toggleActive(id: string) {
    const promo = await this.get(id);
    return prisma.promotion.update({
      where: { id },
      data: { isActive: !promo.isActive },
    });
  }
}

export const promotionsService = new PromotionsService();
