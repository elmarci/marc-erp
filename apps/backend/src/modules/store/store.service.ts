import { prisma } from '../../database/client';
import { NotFoundError } from '../../utils/errors';
import { io } from '../../server';

export class StoreService {

  /* ── Catálogo público ─────────────────────────────────────────────────── */
  async getProducts(filters: {
    search?: string; categoryId?: string; page: number; limit: number;
  }) {
    const where: Record<string, unknown> = {
      deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 },
    };
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search } },
      ];
    }
    if (filters.categoryId) where['categoryId'] = filters.categoryId;

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true, name: true, barcode: true, salePrice: true,
          currentStock: true, imageUrl: true, description: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      data: data.map(p => ({ ...p, salePrice: Number(p.salePrice) })),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  async getCategories() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, description: true,
        _count: { select: { products: { where: { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 } } } } },
      },
      orderBy: { name: 'asc' },
    });
    return categories.filter(c => c._count.products > 0);
  }

  async getActiveOffers() {
    const now = new Date();
    return prisma.promotion.findMany({
      where: {
        isActive: true, showInStore: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        products: {
          include: {
            product: {
              select: { id: true, name: true, salePrice: true, imageUrl: true },
            },
          },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  /* ── Pedidos ──────────────────────────────────────────────────────────── */
  async createOrder(data: {
    customerName: string; customerPhone: string; customerEmail?: string;
    deliveryType: 'DELIVERY' | 'PICKUP';
    address?: string; district?: string; reference?: string; notes?: string;
    paymentMethod: 'YAPE' | 'PLIN' | 'CASH';
    items: Array<{ productId: string; quantity: number }>;
  }) {
    // Fetch products
    const productIds = data.items.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, status: 'ACTIVE' },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundError('Uno o más productos no están disponibles');
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = data.items.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      const unitPrice = Number(product.salePrice);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      return {
        productId: item.productId,
        name: product.name,
        imageUrl: product.imageUrl,
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal,
      };
    });

    const deliveryCost = data.deliveryType === 'DELIVERY' ? 0 : 0; // free for now
    const total = subtotal + deliveryCost;

    // Generate order number
    const count = await prisma.storeOrder.count();
    const orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;

    const order = await prisma.storeOrder.create({
      data: {
        orderNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        deliveryType: data.deliveryType,
        address: data.address,
        district: data.district,
        reference: data.reference,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        subtotal,
        deliveryCost,
        total,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    // Notificar en tiempo real al ERP
    io.emit('store:new-order', {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      paymentMethod: order.paymentMethod,
      deliveryType: order.deliveryType,
    });

    return order;
  }

  async getOrdersByPhone(phone: string) {
    return prisma.storeOrder.findMany({
      where: { customerPhone: phone },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(orderNumber: string) {
    const order = await prisma.storeOrder.findUnique({
      where: { orderNumber },
      include: { items: true },
    });
    if (!order) throw new NotFoundError('Pedido');
    return order;
  }

  /* ── Gestión de pedidos (ERP admin) ──────────────────────────────────── */
  async listOrders(filters: { status?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;

    const [data, total] = await Promise.all([
      prisma.storeOrder.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.storeOrder.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  async updateOrderStatus(id: string, status: string, paymentStatus?: string) {
    const order = await prisma.storeOrder.update({
      where: { id },
      data: { status, ...(paymentStatus ? { paymentStatus } : {}) },
      include: { items: true },
    });

    // Notificar al cliente en tiempo real
    io.emit(`store:order-updated:${order.orderNumber}`, {
      status: order.status,
      paymentStatus: order.paymentStatus,
    });

    return order;
  }
}

export const storeService = new StoreService();
