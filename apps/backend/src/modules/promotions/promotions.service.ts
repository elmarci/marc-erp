import { prisma } from '../../database/client';
import { NotFoundError } from '../../utils/errors';

interface ComboItemInput { productId: string; quantity: number }

export class PromotionsService {
  async list(filters: { active?: boolean; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) where['isActive'] = filters.active;

    const [data, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        include: {
          products: { include: { product: { select: { id: true, name: true, salePrice: true, imageUrl: true, currentStock: true, barcode: true, isBulk: true, bulkUnit: true } } } },
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
    valueType?: string; buyQuantity?: number; getQuantity?: number;
    startTime?: string; endTime?: string; daysOfWeek?: number[];
    startDate: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; storeVideo?: string; storeFullDesign?: boolean; priority?: number;
    productIds?: string[];
    comboItems?: ComboItemInput[];
  }) {
    const { productIds, comboItems, ...promoData } = data;
    // COMBO usa comboItems (con cantidad por producto); los demás tipos
    // siguen usando productIds simple (cantidad implícita = 1 cada uno).
    const products = comboItems && comboItems.length > 0
      ? comboItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
      : productIds?.map(productId => ({ productId }));

    return prisma.promotion.create({
      data: {
        ...promoData,
        type: promoData.type as never,
        valueType: promoData.valueType as never,
        products: products ? { create: products } : undefined,
      },
      include: {
        products: { include: { product: { select: { id: true, name: true, salePrice: true, imageUrl: true, currentStock: true, barcode: true, isBulk: true, bulkUnit: true } } } },
      },
    });
  }

  async update(id: string, data: {
    name?: string; description?: string; type?: string; value?: number;
    valueType?: string; buyQuantity?: number; getQuantity?: number;
    startTime?: string; endTime?: string; daysOfWeek?: number[];
    startDate?: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; storeVideo?: string; storeFullDesign?: boolean; priority?: number;
    productIds?: string[];
    comboItems?: ComboItemInput[];
  }) {
    await this.get(id);
    const { productIds, comboItems, ...promoData } = data;
    const products = comboItems && comboItems.length > 0
      ? comboItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
      : productIds?.map(productId => ({ productId }));

    // Update products if provided
    if (products !== undefined) {
      await prisma.promotionProduct.deleteMany({ where: { promotionId: id } });
      if (products.length > 0) {
        await prisma.promotionProduct.createMany({
          data: products.map(p => ({ promotionId: id, ...p })),
        });
      }
    }

    return prisma.promotion.update({
      where: { id },
      data: promoData as never,
      include: {
        products: { include: { product: { select: { id: true, name: true, salePrice: true, imageUrl: true, currentStock: true, barcode: true, isBulk: true, bulkUnit: true } } } },
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

  // Hora Feliz activa ahora mismo (hora Lima, sin horario de verano — Perú es
  // siempre UTC-5) — el POS la usa para aplicar el precio rebajado solo.
  async getActiveHappyHours() {
    const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const hhmm = lima.toISOString().slice(11, 16);
    const dow = lima.getUTCDay();
    const today = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));

    const promos = await prisma.promotion.findMany({
      where: {
        type: 'HAPPY_HOUR',
        isActive: true,
        startDate: { lte: lima },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: {
        products: { include: { product: { select: { id: true, name: true, salePrice: true } } } },
      },
      orderBy: { priority: 'desc' },
    });

    return promos.filter(p =>
      (p.daysOfWeek.length === 0 || p.daysOfWeek.includes(dow)) &&
      (!p.startTime || hhmm >= p.startTime) &&
      (!p.endTime || hhmm <= p.endTime),
    );
  }
}

export const promotionsService = new PromotionsService();
