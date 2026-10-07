import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { pushService } from '../push/push.service';
import { logger } from '../../config/logger';

interface ComboItemInput { productId: string; quantity: number; asPack?: boolean }

// Lo que las ofertas necesitan saber de cada producto — incluye la presentación
// por paquete/caja para poder armar promos sobre cajetillas, cajas, etc.
const PRODUCT_SELECT = {
  id: true, name: true, salePrice: true, imageUrl: true, currentStock: true, barcode: true, isBulk: true, bulkUnit: true,
  packSize: true, packPrice: true, packLabel: true, packBarcode: true,
} as const;

export class PromotionsService {
  // Hora feliz ya notificada en el minuto exacto en que arrancó — evita
  // reenviar el aviso si checkAndNotifyHappyHours corre más de una vez
  // dentro del mismo minuto (ej. al reiniciar el proceso). Se vacía sola
  // cuando crece demasiado; no necesita persistir entre despliegues.
  private notifiedHappyHourMinutes = new Set<string>();

  async list(filters: { active?: boolean; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) where['isActive'] = filters.active;

    const [data, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        include: {
          products: { include: { product: { select: PRODUCT_SELECT } } },
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
        products: { include: { product: { select: PRODUCT_SELECT } } },
      },
    });
    if (!promo) throw new NotFoundError('Oferta');
    return promo;
  }

  // Arma las filas de PromotionProduct: cada producto puede entrar por unidad o
  // por paquete/caja (asPack). Un paquete solo se puede usar si el producto
  // realmente tiene paquete configurado.
  private async buildProducts(
    type: string | undefined,
    productIds: string[] | undefined,
    packProductIds: string[] | undefined,
    comboItems: ComboItemInput[] | undefined,
  ) {
    const rows = comboItems && comboItems.length > 0
      ? comboItems.map(i => ({ productId: i.productId, quantity: i.quantity, asPack: !!i.asPack }))
      : productIds?.map(productId => ({ productId, quantity: 1, asPack: !!packProductIds?.includes(productId) }));
    if (!rows) return undefined;

    if (type === 'HAPPY_HOUR' && rows.some(r => r.asPack)) {
      throw new BusinessError('La hora feliz se aplica a unidades sueltas, no a paquetes.');
    }
    const packIds = rows.filter(r => r.asPack).map(r => r.productId);
    if (packIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: packIds } }, select: { id: true, name: true, packSize: true, packPrice: true },
      });
      const invalid = products.filter(p => !p.packSize || p.packPrice == null).map(p => p.name);
      if (invalid.length > 0) {
        throw new BusinessError(`Estos productos no tienen paquete/caja configurado: ${invalid.join(', ')}.`);
      }
    }
    return rows;
  }

  async create(data: {
    name: string; description?: string; type: string; value: number;
    valueType?: string; buyQuantity?: number; getQuantity?: number;
    startTime?: string; endTime?: string; daysOfWeek?: number[];
    startDate: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; storeVideo?: string; storeFullDesign?: boolean; priority?: number;
    productIds?: string[];
    packProductIds?: string[];
    comboItems?: ComboItemInput[];
  }) {
    const { productIds, packProductIds, comboItems, ...promoData } = data;
    // COMBO usa comboItems (con cantidad por producto); los demás tipos
    // siguen usando productIds simple (cantidad implícita = 1 cada uno).
    const products = await this.buildProducts(promoData.type, productIds, packProductIds, comboItems);

    const promo = await prisma.promotion.create({
      data: {
        ...promoData,
        type: promoData.type as never,
        valueType: promoData.valueType as never,
        products: products ? { create: products } : undefined,
      },
      include: {
        products: { include: { product: { select: PRODUCT_SELECT } } },
      },
    });

    // Avisa a quien activó notificaciones en la tienda — no bloquea la
    // respuesta ni hace fallar la creación si el envío push tiene algún
    // problema (ver push.service.ts).
    if (promo.isActive && promo.showInStore) {
      pushService.broadcast({
        title: '🎉 Nueva oferta en Tienda Marc',
        body: promo.description ? `${promo.name} — ${promo.description}` : promo.name,
        url: '/ofertas',
      }).catch(err => logger.error({ err }, 'Error notificando nueva oferta por push'));
    }

    return promo;
  }

  async update(id: string, data: {
    name?: string; description?: string; type?: string; value?: number;
    valueType?: string; buyQuantity?: number; getQuantity?: number;
    startTime?: string; endTime?: string; daysOfWeek?: number[];
    startDate?: Date; endDate?: Date;
    isActive?: boolean; showInStore?: boolean;
    storeBadge?: string; storeImage?: string; storeVideo?: string; storeFullDesign?: boolean; priority?: number;
    productIds?: string[];
    packProductIds?: string[];
    comboItems?: ComboItemInput[];
  }) {
    const existing = await this.get(id);
    const { productIds, packProductIds, comboItems, ...promoData } = data;
    const products = await this.buildProducts(promoData.type ?? existing.type, productIds, packProductIds, comboItems);

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
        products: { include: { product: { select: PRODUCT_SELECT } } },
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

  // Se llama cada minuto desde server.ts — busca horas felices cuyo
  // startTime coincide con el minuto actual (hora Lima) y avisa por push
  // justo cuando arrancan, no sólo cuando alguien las crea en el ERP.
  async checkAndNotifyHappyHours() {
    const lima = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const hhmm = lima.toISOString().slice(11, 16);
    const dow = lima.getUTCDay();
    const dateKey = lima.toISOString().slice(0, 10);

    const promos = await prisma.promotion.findMany({
      where: { type: 'HAPPY_HOUR', isActive: true, showInStore: true, startTime: hhmm },
    });

    for (const promo of promos) {
      if (promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(dow)) continue;
      const key = `${promo.id}-${dateKey}-${hhmm}`;
      if (this.notifiedHappyHourMinutes.has(key)) continue;
      this.notifiedHappyHourMinutes.add(key);

      pushService.broadcast({
        title: `⏰ ¡${promo.name} ya empezó!`,
        body: promo.description || 'Precio especial por tiempo limitado — aprovecha ahora.',
        url: '/ofertas',
      }).catch(err => logger.error({ err }, 'Error notificando activación de hora feliz por push'));
    }

    if (this.notifiedHappyHourMinutes.size > 500) this.notifiedHappyHourMinutes.clear();
  }
}

export const promotionsService = new PromotionsService();
