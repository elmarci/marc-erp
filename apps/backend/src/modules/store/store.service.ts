import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { emitEvent } from '../../config/socket';
import { redis } from '../../config/redis';
import { getSettingValues } from '../../utils/settings';

export class StoreService {

  /* ── Configuración de portada (hero) ──────────────────────────────────── */
  async getDisplaySettings() {
    const values = await getSettingValues(['store_hero_video_url', 'store_hero_poster_url']);
    return {
      heroVideoUrl: values['store_hero_video_url'] || null,
      heroPosterUrl: values['store_hero_poster_url'] || null,
    };
  }

  /* ── Catálogo público ─────────────────────────────────────────────────── */
  async getProducts(filters: {
    search?: string; categoryId?: string; excludeId?: string; page: number; limit: number;
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
    if (filters.categoryId) {
      // Si la categoría tiene subcategorías, filtrar también por sus productos
      // — así "Bebidas" muestra lo que está en "Gaseosas", "Jugos", etc. sin
      // que el cliente tenga que entrar a cada subcategoría por separado.
      const children = await prisma.category.findMany({
        where: { parentId: filters.categoryId }, select: { id: true },
      });
      where['categoryId'] = children.length > 0
        ? { in: [filters.categoryId, ...children.map(c => c.id)] }
        : filters.categoryId;
    }
    if (filters.excludeId) where['id'] = { not: filters.excludeId };

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true, name: true, barcode: true, salePrice: true,
          currentStock: true, imageUrl: true, description: true, isBulk: true, bulkUnit: true,
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

  // "Más vendidos" real, no solo los primeros N alfabéticamente — se basa en
  // unidades vendidas (ventas de tienda física + web) en los últimos 30 días.
  // Si no hay suficiente historial (tienda nueva, producto recién creado) se
  // completa con los productos activos más recientes para nunca mostrar menos
  // de `limit` productos.
  async getFeaturedProducts(limit = 8) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const topSelling = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: 'COMPLETED', createdAt: { gte: since } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit * 2, // margen por si algunos ya no están activos / sin stock
    });

    const baseWhere = { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 } } as const;
    const productSelect = {
      id: true, name: true, barcode: true, salePrice: true,
      currentStock: true, imageUrl: true, description: true, isBulk: true, bulkUnit: true,
      category: { select: { id: true, name: true } },
    } as const;

    const topIds = topSelling.map(t => t.productId);
    const bestSellers = topIds.length > 0
      ? await prisma.product.findMany({ where: { id: { in: topIds }, ...baseWhere }, select: productSelect })
      : [];
    const bestSellersOrdered = topIds
      .map(id => bestSellers.find(p => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, limit);

    let result = bestSellersOrdered;
    if (result.length < limit) {
      const excludeIds = result.map(p => p.id);
      const fillers = await prisma.product.findMany({
        where: { ...baseWhere, id: { notIn: excludeIds } },
        select: productSelect,
        orderBy: { createdAt: 'desc' },
        take: limit - result.length,
      });
      result = [...result, ...fillers];
    }

    return result.map(p => ({ ...p, salePrice: Number(p.salePrice) }));
  }

  async getProductById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true, name: true, barcode: true, salePrice: true,
        currentStock: true, imageUrl: true, description: true, isBulk: true, bulkUnit: true,
        category: {
          select: {
            id: true, name: true,
            parent: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundError('Producto');
    return { ...product, salePrice: Number(product.salePrice) };
  }

  async getCategories() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, description: true, imageUrl: true, parentId: true, sortOrder: true,
        _count: { select: { products: { where: { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 } } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const byParent = new Map<string, typeof categories>();
    for (const c of categories) {
      const key = c.parentId ?? '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    }

    // Solo se listan subcategorías con productos propios — de lo contrario
    // el cliente ve una lista de filtros que no traen nada al tocarlos.
    const topLevel = (byParent.get('') ?? []).map(cat => {
      const children = (byParent.get(cat.id) ?? [])
        .filter(child => child._count.products > 0)
        .map(({ parentId: _parentId, ...child }) => child);
      const totalCount = cat._count.products + children.reduce((s, ch) => s + ch._count.products, 0);
      const { parentId: _parentId, ...rest } = cat;
      return { ...rest, _count: { products: totalCount }, children, childIds: children.map(c => c.id) };
    });

    const visible = topLevel.filter(c => c._count.products > 0);

    // La categoría casi nunca tiene su propia foto cargada — se usa la de un
    // producto representativo (con imagen) dentro de ella para que la grilla
    // de "Categorías" no se vea genérica en el home.
    const withImages = await Promise.all(visible.map(async ({ childIds, ...cat }) => {
      if (cat.imageUrl) return cat;
      const sample = await prisma.product.findFirst({
        where: {
          categoryId: { in: [cat.id, ...childIds] },
          deletedAt: null, status: 'ACTIVE', imageUrl: { not: null },
        },
        select: { imageUrl: true },
        orderBy: { updatedAt: 'desc' },
      });
      return { ...cat, imageUrl: sample?.imageUrl ?? null };
    }));

    return withImages;
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
    storeCustomerId?: string;
    items: Array<{ productId: string; quantity: number; unitPrice?: number; name?: string }>;
  }) {
    // Extraer IDs reales
    // Bundle format: "bundle-{offerId36chars}-{productId36chars}"
    // "bundle-" = 7 chars, offerId UUID = 36 chars, "-" = 1 char, productId = rest
    // Total prefix antes del productId = 7 + 36 + 1 = 44 chars
    const resolvedItems = data.items.map(item => {
      if (item.productId.startsWith('bundle-')) {
        const realProductId = item.productId.slice(44); // extrae el UUID del producto exactamente
        return { ...item, realProductId };
      }
      return { ...item, realProductId: item.productId };
    });

    const realProductIds = [...new Set(resolvedItems.map(i => i.realProductId))];
    const products = await prisma.product.findMany({
      where: { id: { in: realProductIds }, deletedAt: null, status: 'ACTIVE' },
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    // Verificar que todos los productos existen
    for (const item of resolvedItems) {
      if (!productMap.has(item.realProductId)) {
        throw new NotFoundError(`Producto no disponible`);
      }
    }

    // Verificar stock disponible — este endpoint es público (lo llama
    // cualquier visitante de la tienda sin autenticarse), así que es la única
    // línea de defensa real contra pedir más de lo que hay; el carrito del
    // navegador es solo una ayuda visual, nunca la fuente de verdad.
    const requestedByProduct = new Map<string, number>();
    for (const item of resolvedItems) {
      requestedByProduct.set(
        item.realProductId,
        (requestedByProduct.get(item.realProductId) ?? 0) + item.quantity,
      );
    }
    for (const [productId, requestedQty] of requestedByProduct) {
      const product = productMap.get(productId)!;
      if (Number(product.currentStock) < requestedQty) {
        throw new BusinessError(
          `Stock insuficiente para "${product.name}". Disponible: ${product.currentStock}, solicitado: ${requestedQty}.`,
        );
      }
    }

    // Calculate totals — para bundles se usa el unitPrice enviado por el frontend
    let subtotal = 0;
    const orderItems = resolvedItems.map(item => {
      const product = productMap.get(item.realProductId)!;
      // Si viene unitPrice del frontend (bundle con precio especial), usarlo
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : Number(product.salePrice);
      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;
      return {
        productId: item.realProductId,  // siempre guardar el ID real del producto
        name: item.name ?? product.name, // nombre con badge de oferta si viene del frontend
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
        storeCustomerId: data.storeCustomerId,
        subtotal,
        deliveryCost,
        total,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    emitEvent('store:new-order', {
      id: order.id, orderNumber: order.orderNumber,
      customerName: order.customerName, total: Number(order.total),
      paymentMethod: order.paymentMethod, deliveryType: order.deliveryType,
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

  /* ── Confirmar pedido → crear Venta en ERP ────────────────────────────── */
  async confirmOrder(id: string, cashSessionId: string, userId: string) {
    const order = await prisma.storeOrder.findUnique({
      where: { id }, include: { items: true },
    });
    if (!order) throw new NotFoundError('Pedido');
    if (order.status !== 'PENDING') throw new Error('Solo se pueden confirmar pedidos pendientes.');
    if (order.saleId) throw new Error('Este pedido ya tiene una venta asociada.');

    // Verify cash session
    const session = await prisma.cashSession.findFirst({
      where: { id: cashSessionId, status: 'OPEN' },
    });
    if (!session) throw new Error('No hay una sesión de caja abierta con ese ID.');

    // Map payment method
    const paymentMethodMap: Record<string, string> = {
      YAPE: 'YAPE', PLIN: 'PLIN', CASH: 'CASH',
    };
    const paymentMethod = paymentMethodMap[order.paymentMethod] ?? 'CASH';

    // Si el pedido lo hizo un cliente registrado, la venta queda a su nombre
    // en el ERP — mismo historial y puntos que una compra hecha en tienda.
    let customerId: string | null = null;
    if (order.storeCustomerId) {
      const storeCustomer = await prisma.storeCustomer.findUnique({ where: { id: order.storeCustomerId } });
      customerId = storeCustomer?.customerId ?? null;
    }
    const loyaltyConfig = customerId ? await getSettingValues(['loyalty_points_per_sol']) : {};
    const pointsPerSol = Number(loyaltyConfig['loyalty_points_per_sol'] ?? 1);
    const pointsEarned = customerId ? Math.floor(Number(order.total) * pointsPerSol) : 0;

    return prisma.$transaction(async (tx) => {
      // Fetch products and validate stock
      const productIds = order.items.map(i => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map(p => [p.id, p]));

      // Calculate sale totals
      let subtotal = 0;
      const saleItems = order.items.map(item => {
        subtotal += Number(item.subtotal);
        return {
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          originalPrice: Number(item.unitPrice),
          discountAmount: 0,
          discountPercent: 0,
          subtotal: Number(item.subtotal),
        };
      });

      const taxRate = 0.18;
      const netAmount = subtotal / (1 + taxRate);
      const taxAmount = subtotal - netAmount;

      // Generate sale number
      const saleCount = await tx.sale.count();
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const saleNumber = `V${year}${month}${String(saleCount + 1).padStart(6, '0')}`;

      // Create the sale
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          cashSessionId,
          cashierId: userId,
          createdById: userId,
          customerId,
          documentType: 'NOTA_VENTA',
          subtotal: netAmount,
          taxAmount,
          totalAmount: subtotal,
          discountAmount: 0,
          status: 'COMPLETED',
          pointsEarned,
          notes: `Pedido web ${order.orderNumber} — ${order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo en tienda'}`,
          items: {
            create: saleItems,
          },
          payments: {
            create: [{
              method: paymentMethod as never,
              amount: subtotal,
            }],
          },
        },
      });

      if (customerId && pointsEarned > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
      }

      // Decrement stock + inventory movements
      for (const item of order.items) {
        const product = productMap.get(item.productId);
        if (!product) continue;
        const stockBefore = Number(product.currentStock);
        const newStock = stockBefore - Number(item.quantity);

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: Math.max(0, newStock) },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE_OUT',
            quantity: Number(item.quantity),
            quantityBefore: stockBefore,
            quantityAfter: Math.max(0, newStock),
            unitCost: product.costPrice,
            referenceType: 'STORE_ORDER',
            referenceId: order.id,
            userId,
            notes: `Pedido web ${order.orderNumber}`,
          },
        });
      }

      // Update store order: CONFIRMED + link to sale
      const updated = await tx.storeOrder.update({
        where: { id },
        data: { status: 'CONFIRMED', saleId: sale.id },
        include: { items: true },
      });

      // Notify customer
      emitEvent(`store:order-updated:${order.orderNumber}`, { status: 'CONFIRMED', paymentStatus: order.paymentStatus });

      const result = { order: updated, saleId: sale.id, saleNumber: sale.saleNumber };
      // Invalidate dashboard cache so it reflects the new web sale
      await redis.del('reports:dashboard').catch(() => {});
      return result;
    });
  }

  async updateOrderStatus(id: string, status: string, paymentStatus?: string) {
    const order = await prisma.storeOrder.update({
      where: { id },
      data: { status, ...(paymentStatus ? { paymentStatus } : {}) },
      include: { items: true },
    });

    // Notificar al cliente en tiempo real
    emitEvent(`store:order-updated:${order.orderNumber}`, {
      status: order.status,
      paymentStatus: order.paymentStatus,
    });

    return order;
  }
}

export const storeService = new StoreService();
