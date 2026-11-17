import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { emitEvent } from '../../config/socket';
import { redis } from '../../config/redis';
import { getSettingValues } from '../../utils/settings';
import { withOrderNumber, withSaleNumber } from '../../utils/sequence';
import { deliveryService } from '../delivery/delivery.service';
import { storeDeliveryFee, cardFee, CARD_FEE_PERCENT, DELIVERY_MIN_ORDER } from './deliveryFee';
import { buildTracking } from './orderTracking';
import { discountPrices, packInfo, pickPrice } from './storePricing';
import { orderAccessKey, isValidOrderKey } from './orderAccess';
import { loadOptionGroups, groupsForProduct, optionsText, type OptionGroup } from './storeOptions';

// Datos que la tienda necesita además del producto: la presentación
// paquete/caja (la misma que vende el POS) y las opciones de despacho que
// aplican (pierna/pecho, helada/sin helar…).
type StoreProductRow = {
  id: string; salePrice: unknown; categoryId?: string;
  packSize?: number | null; packPrice?: unknown; packLabel?: string | null;
  category?: { id?: string; parentId?: string | null; parent?: { id: string } | null } | null;
};
function toStoreProduct<T extends StoreProductRow>(p: T, groups: OptionGroup[]) {
  const { packSize, packPrice, packLabel, ...rest } = p;
  const hasPack = packSize != null && packSize >= 2 && packPrice != null && Number(packPrice) > 0;
  return {
    ...rest,
    salePrice: Number(p.salePrice),
    pack: hasPack ? { size: packSize!, price: Number(packPrice), label: packLabel || 'Paquete' } : null,
    options: groupsForProduct(groups, p),
  };
}

export class StoreService {

  // Mismo criterio que storeAuthService.findOrCreateErpCustomer al
  // registrarse — el teléfono es el identificador real del cliente en el
  // ERP, con o sin cuenta en la tienda.
  private async findOrCreateCustomerByPhone(name: string, phone: string) {
    const existing = await prisma.customer.findFirst({ where: { phone } });
    if (existing) return existing.id;

    const [firstName, ...rest] = name.trim().split(/\s+/);
    const created = await prisma.customer.create({
      data: {
        firstName: firstName || name,
        lastName: rest.join(' ') || null,
        phone,
        type: 'REGULAR',
        notes: 'Creado automáticamente al confirmar un pedido de la tienda online.',
      },
    });
    return created.id;
  }

  /* ── Configuración de portada (hero) ──────────────────────────────────── */
  async getDisplaySettings() {
    const values = await getSettingValues(['store_hero_video_url', 'store_hero_poster_url', 'loyalty_point_value', 'loyalty_points_per_sol']);
    return {
      heroVideoUrl: values['store_hero_video_url'] || null,
      heroPosterUrl: values['store_hero_poster_url'] || null,
      // Cuánto vale un punto en soles — la misma cifra que ya usa el POS del
      // ERP (sales.service.ts), para que el checkout pueda mostrar "tienes
      // N puntos = S/ X de descuento" sin inventar su propia tasa.
      loyaltyPointValue: Number(values['loyalty_point_value'] ?? 0.03),
      // Puntos que gana por cada sol (misma regla que confirmOrder): la
      // tienda muestra "con este pedido sumas N puntos".
      loyaltyPointsPerSol: Number(values['loyalty_points_per_sol'] ?? 1),
    };
  }

  /* ── Catálogo público ─────────────────────────────────────────────────── */
  async getProducts(filters: {
    search?: string; categoryId?: string; excludeId?: string; page: number; limit: number;
  }) {
    const where: Record<string, unknown> = {
      // isMiscItem: el producto comodín "Otros/Venta varios" del POS — es un
      // artificio para cobrar algo fuera de catálogo (precio libre, sin
      // costo real), no algo que un cliente pueda pedir por la tienda.
      deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 }, isMiscItem: false,
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
          categoryId: true, packSize: true, packPrice: true, packLabel: true,
          category: { select: { id: true, name: true, parentId: true } },
        },
        // storeFeatured primero (palanca manual del dueño), luego categoría
        // padre e hija (el sort_order de las subcategorías solo es único
        // dentro de su propio padre — hay que anclar primero al padre o
        // "Lácteos" y "Gaseosas" quedan empatadas y se intercalan), luego
        // familia de producto (sizeGroup) con tamaño ascendente dentro de
        // cada familia — así "500ml" sale antes que "1.5L" del mismo
        // producto en vez de ordenarse como texto ("1" < "5"). Los productos
        // sin tamaño detectable (sizeValue null) van al final de su familia.
        orderBy: [
          { storeFeatured: 'desc' },
          { category: { parent: { sortOrder: 'asc' } } },
          { category: { sortOrder: 'asc' } },
          { sizeGroup: 'asc' },
          { sizeValue: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
        ],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.product.count({ where }),
    ]);

    const groups = await loadOptionGroups();
    return {
      data: data.map(p => toStoreProduct(p, groups)),
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

    const baseWhere = { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 }, isMiscItem: false } as const;
    const productSelect = {
      id: true, name: true, barcode: true, salePrice: true,
      currentStock: true, imageUrl: true, description: true, isBulk: true, bulkUnit: true,
          categoryId: true, packSize: true, packPrice: true, packLabel: true,
      category: { select: { id: true, name: true, parentId: true } },
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

    const groups = await loadOptionGroups();
    return result.map(p => toStoreProduct(p, groups));
  }

  async getProductById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null, status: 'ACTIVE', isMiscItem: false },
      select: {
        id: true, name: true, barcode: true, salePrice: true,
        currentStock: true, imageUrl: true, description: true, isBulk: true, bulkUnit: true,
          categoryId: true, packSize: true, packPrice: true, packLabel: true,
        category: {
          select: {
            id: true, name: true,
            parent: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundError('Producto');
    return toStoreProduct(product, await loadOptionGroups());
  }

  async getCategories() {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, description: true, imageUrl: true, parentId: true, sortOrder: true,
        _count: { select: { products: { where: { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 }, isMiscItem: false } } } },
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
          deletedAt: null, status: 'ACTIVE', imageUrl: { not: null }, isMiscItem: false,
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
        // La tienda online vende unidades sueltas: una promo armada sobre
        // paquetes/cajas se aplica solo en el punto de venta.
        products: { none: { asPack: true } },
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: {
        products: {
          include: {
            product: {
              // category: para poder segmentar "Ofertas" por categoría en la
              // tienda sin depender de PromotionCategory (esa tabla no tiene
              // una relación Prisma armada hacia Category todavía, y no
              // todas las promos la usan) — se deriva de los productos
              // reales que trae cada oferta, que sí siempre están.
              select: { id: true, name: true, salePrice: true, imageUrl: true, category: { select: { id: true, name: true } } },
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
    paymentMethod: 'YAPE' | 'PLIN' | 'CASH' | 'YAPE_CONTRAENTREGA' | 'CARD_CONTRAENTREGA';
    express?: boolean;
    latitude?: number; longitude?: number;
    storeCustomerId?: string;
    pointsToRedeem?: number;
    items: Array<{ productId: string; quantity: number; unitPrice?: number; name?: string; pack?: boolean; options?: Record<string, string> }>;
  }) {
    // Extraer IDs reales
    // Bundle format: "bundle-{offerId36chars}-{productId36chars}"
    // "bundle-" = 7 chars, offerId UUID = 36 chars, "-" = 1 char, productId = rest
    // Total prefix antes del productId = 7 + 36 + 1 = 44 chars
    const resolvedItems = data.items.map(item => {
      if (item.productId.startsWith('bundle-')) {
        const realProductId = item.productId.slice(44); // extrae el UUID del producto exactamente
        return { ...item, realProductId, offerId: item.productId.slice(7, 43) };
      }
      return { ...item, realProductId: item.productId, offerId: undefined as string | undefined };
    });

    const realProductIds = [...new Set(resolvedItems.map(i => i.realProductId))];
    const products = await prisma.product.findMany({
      // isMiscItem: false — no es un producto real de catálogo, no se puede
      // pedir por acá aunque alguien arme el request a mano con su id.
      where: { id: { in: realProductIds }, deletedAt: null, status: 'ACTIVE', isMiscItem: false },
    });

    const productMap = new Map(products.map(p => [p.id, p]));

    // Verificar que todos los productos existen
    for (const item of resolvedItems) {
      if (!productMap.has(item.realProductId)) {
        throw new NotFoundError(`Producto no disponible`);
      }
    }

    // Presentación paquete/caja (ej. Golden x20 a S/ 3.50): solo si el
    // producto la tiene configurada en el ERP; nunca en paquetes de ofertas.
    const unitsPerSaleOf = (item: (typeof resolvedItems)[number]) => {
      if (!item.pack || item.offerId) return 1;
      const product = productMap.get(item.realProductId)!;
      if (!product.packSize || product.packSize < 2 || product.packPrice == null) {
        throw new BusinessError(`"${product.name}" ya no se vende por paquete. Quítalo del carrito y agrégalo de nuevo.`);
      }
      return product.packSize;
    };

    // Verificar stock disponible — este endpoint es público (lo llama
    // cualquier visitante de la tienda sin autenticarse), así que es la única
    // línea de defensa real contra pedir más de lo que hay; el carrito del
    // navegador es solo una ayuda visual, nunca la fuente de verdad.
    const requestedByProduct = new Map<string, number>();
    for (const item of resolvedItems) {
      requestedByProduct.set(
        item.realProductId,
        (requestedByProduct.get(item.realProductId) ?? 0) + item.quantity * unitsPerSaleOf(item),
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

    // Solo los productos a granel se venden por fracción (kg, L).
    for (const item of resolvedItems) {
      const product = productMap.get(item.realProductId)!;
      if ((!product.isBulk || item.pack) && !Number.isInteger(item.quantity)) {
        throw new BusinessError(`La cantidad de "${product.name}" debe ser un número entero.`);
      }
    }

    // Precios: los decide el servidor (ver storePricing.ts). Las ofertas son
    // las mismas que muestra la tienda (getActiveOffers).
    const promos = (await this.getActiveOffers()).map(p => ({
      ...p, products: p.products.map(pp => ({ productId: pp.productId, quantity: pp.quantity, product: { salePrice: pp.product.salePrice } })),
    }));
    const promoById = new Map(promos.map(p => [p.id, p]));
    // Unidades pedidas por paquete: solo valen paquetes completos.
    const bundleUnits = new Map<string, number>();
    for (const item of resolvedItems) {
      if (item.offerId) bundleUnits.set(item.offerId, (bundleUnits.get(item.offerId) ?? 0) + item.quantity);
    }

    const optionGroups = await loadOptionGroups();
    const categories = await prisma.category.findMany({
      where: { id: { in: [...new Set(products.map(p => p.categoryId))] } },
      select: { id: true, parentId: true },
    });
    const parentOf = new Map(categories.map(c => [c.id, c.parentId]));

    let subtotal = 0;
    const orderItems = resolvedItems.map(item => {
      const product = productMap.get(item.realProductId)!;
      const salePrice = Number(product.salePrice);
      const unitsPerSale = unitsPerSaleOf(item);
      let unitPrice: number;
      if (unitsPerSale > 1) {
        // Mismo precio de paquete que cobra el POS.
        unitPrice = Number(product.packPrice);
      } else if (item.offerId) {
        const promo = promoById.get(item.offerId);
        const pack = promo && promo.products.some(pp => pp.productId === item.realProductId) ? packInfo(promo) : null;
        const complete = pack && (bundleUnits.get(item.offerId)! % pack.totalQty === 0);
        unitPrice = pack && complete ? Math.min(pack.perUnit, salePrice) : salePrice;
      } else {
        const candidates = promos
          .filter(p => p.products.some(pp => pp.productId === item.realProductId))
          .flatMap(p => discountPrices(salePrice, p));
        unitPrice = pickPrice(item.unitPrice, candidates, salePrice);
      }
      const itemSubtotal = Math.round(unitPrice * item.quantity * 100) / 100;
      subtotal += itemSubtotal;
      // El nombre puede traer el peso elegido ("Pollo (0.5 kg)"), pero
      // siempre empieza con el nombre real del producto.
      const name = unitsPerSale > 1
        ? `${product.name} (${product.packLabel || 'Paquete'} x${unitsPerSale})`
        : item.name && item.name.startsWith(product.name) ? item.name.slice(0, 160) : product.name;
      // Opciones de despacho (pierna/pecho, helada…). En productos que
      // vienen dentro de una oferta no se exige elegir: el combo ya se armó.
      const applicable = groupsForProduct(optionGroups, {
        id: product.id, categoryId: product.categoryId, category: { parentId: parentOf.get(product.categoryId) ?? null },
      });
      const options = optionsText(
        item.offerId ? applicable.map(g => ({ ...g, required: false })) : applicable,
        item.options, product.name,
      );
      return {
        productId: item.realProductId,  // siempre guardar el ID real del producto
        name,
        imageUrl: product.imageUrl,
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        unitsPerSale,
        options,
      };
    });
    subtotal = Math.round(subtotal * 100) / 100;
    if (data.deliveryType === 'DELIVERY' && subtotal < DELIVERY_MIN_ORDER) {
      throw new BusinessError(`La compra mínima para delivery es S/ ${DELIVERY_MIN_ORDER.toFixed(2)} en productos.`);
    }

    // Envío: gratis al recoger; en delivery, por distancia a la tienda (GPS)
    // o por zona si no hay GPS útil. Ver deliveryFee.ts.
    const deliveryCost = data.deliveryType === 'DELIVERY'
      ? storeDeliveryFee({ latitude: data.latitude, longitude: data.longitude, district: data.district, express: data.express })
      : 0;

    // Canje de puntos — mismo valor por punto que el POS (loyalty_point_value).
    // Solo se VALIDA acá (saldo suficiente ahora); el descuento real de
    // puntos ocurre recién al confirmar el pedido (mismo momento en que se
    // suman los ganados), con el mismo resguardo atómico que el POS para
    // evitar canjear el mismo punto dos veces en pedidos simultáneos.
    // En la tienda online los puntos ya no se canjean como descuento en soles
    // (dueño, 2026-11-15): se canjearán por productos de un catálogo de
    // premios. Se ignora lo que mande el navegador (incluso una versión vieja
    // de la app guardada en el celular).
    const pointsToRedeem = 0;
    let pointsDiscountAmount = 0;
    if (pointsToRedeem > 0) {
      if (!data.storeCustomerId) {
        throw new BusinessError('Debes iniciar sesión para canjear puntos.');
      }
      const storeCustomer = await prisma.storeCustomer.findUnique({ where: { id: data.storeCustomerId } });
      const customer = storeCustomer?.customerId
        ? await prisma.customer.findUnique({ where: { id: storeCustomer.customerId } })
        : null;
      if (!customer || customer.loyaltyPoints < pointsToRedeem) {
        throw new BusinessError('No tienes suficientes puntos disponibles para canjear esa cantidad.');
      }
      const { loyalty_point_value } = await getSettingValues(['loyalty_point_value']);
      const pointValue = Number(loyalty_point_value ?? 0.03);
      pointsDiscountAmount = Math.min(pointsToRedeem * pointValue, subtotal + deliveryCost);
    }

    // Comisión por tarjeta: 3.5 % sobre lo que se va a cobrar. No tiene
    // columna propia en el pedido: entra en `total` y se puede recuperar
    // como total − subtotal − envío + descuento por puntos (así la lee
    // confirmOrder). También queda escrita en la nota para la tienda.
    const beforeCard = subtotal + deliveryCost - pointsDiscountAmount;
    const cardCommission = data.paymentMethod === 'CARD_CONTRAENTREGA' ? cardFee(beforeCard) : 0;
    const total = beforeCard + cardCommission;
    const notes = cardCommission > 0
      ? [`COMISIÓN TARJETA ${CARD_FEE_PERCENT}%: S/ ${cardCommission.toFixed(2)}`, data.notes].filter(Boolean).join(' | ')
      : data.notes;

    // Número de pedido: el siguiente al último. Antes era count()+1, y dos
    // pedidos en el mismo instante recibían el mismo número: uno fallaba con
    // "order_number ya existe" (28 de 30 en la prueba de carga). Ahora, si
    // choca, se reintenta con el siguiente número.
    const createWithNumber = (orderNumber: string) => prisma.storeOrder.create({
      data: {
        orderNumber,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        deliveryType: data.deliveryType,
        address: data.address,
        district: data.district,
        reference: data.reference,
        notes,
        paymentMethod: data.paymentMethod,
        storeCustomerId: data.storeCustomerId,
        latitude: data.latitude,
        longitude: data.longitude,
        pointsRedeemed: pointsToRedeem,
        pointsDiscountAmount,
        subtotal,
        deliveryCost,
        total,
        items: { create: orderItems },
      },
      include: { items: true },
    });
    const order = await withOrderNumber(createWithNumber);

    emitEvent('store:new-order', {
      id: order.id, orderNumber: order.orderNumber,
      customerName: order.customerName, total: Number(order.total),
      paymentMethod: order.paymentMethod, deliveryType: order.deliveryType,
    });

    return { ...order, accessKey: orderAccessKey(order.orderNumber) };
  }

  // "Mis pedidos" de una cuenta: solo los pedidos hechos con esa sesión.
  // Antes se buscaba por teléfono en una ruta pública, así que bastaba saber
  // el celular de alguien para ver sus pedidos y su dirección.
  async getOrdersForCustomer(storeCustomerId: string) {
    const orders = await prisma.storeOrder.findMany({
      where: { storeCustomerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map(({ tarifaReparto: _t, liquidacionId: _l, ...o }) => ({ ...o, accessKey: orderAccessKey(o.orderNumber) }));
  }

  // Pedido público por número. Completo solo con la clave del enlace o con
  // la sesión de quien lo hizo; sin eso, una versión sin datos personales
  // (sirve para enlaces viejos sin clave: el cliente ve el estado, pero un
  // extraño no ve nombre completo, teléfono, dirección ni la moto).
  async getOrderForViewer(orderNumber: string, key: unknown, storeCustomerId?: string) {
    const order = await this.getOrder(orderNumber);
    if (isValidOrderKey(orderNumber, key) || (storeCustomerId && order.storeCustomerId === storeCustomerId)) {
      return { ...order, accessKey: orderAccessKey(orderNumber), limited: false };
    }
    const { tracking } = order;
    return {
      ...order,
      customerName: order.customerName.split(/\s+/)[0],
      customerPhone: '', customerEmail: null, address: null, district: null, reference: null, notes: null,
      latitude: null, longitude: null, paymentProof: null, storeCustomerId: null, riderId: null,
      tracking: { ...tracking, rider: null, riderLocation: null, destination: null, receiver: null, schedule: null, kmLeft: null },
      limited: true,
    };
  }

  async getOrder(orderNumber: string) {
    const order = await prisma.storeOrder.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        // Solo lo que el cliente puede ver del repartidor (sin teléfono ni PIN).
        rider: { select: { nombre: true, motoModelo: true, motoPlaca: true, calificacion: true, lastLat: true, lastLng: true, lastLocationAt: true } },
        deliveryEvents: { select: { type: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundError('Pedido');
    // Lo que se le paga al biker y su liquidación son internos: no salen
    // en este endpoint público.
    const { rider: _rider, deliveryEvents: _events, tarifaReparto: _tarifa, liquidacionId: _liq, ...rest } = order;
    return { ...rest, tracking: buildTracking(order) };
  }

  /* ── Gestión de pedidos (ERP admin) ──────────────────────────────────── */
  async listOrders(filters: { status?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;

    const [data, total] = await Promise.all([
      prisma.storeOrder.findMany({
        where,
        include: { items: true, rider: { select: { id: true, nombre: true } } },
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

    // Map payment method — YAPE_CONTRAENTREGA sigue siendo un pago por Yape
    // en la contabilidad del ERP, sólo cambia CUÁNDO se cobra (no antes de
    // entregar), así que cae en el mismo enum PaymentMethod.YAPE de la venta.
    const paymentMethodMap: Record<string, string> = {
      YAPE: 'YAPE', PLIN: 'PLIN', CASH: 'CASH', YAPE_CONTRAENTREGA: 'YAPE',
      // El pedido no sabe si será débito o crédito; se registra como débito
      // y caja puede corregirlo en la venta si hace falta.
      CARD_CONTRAENTREGA: 'DEBIT_CARD',
    };
    const paymentMethod = paymentMethodMap[order.paymentMethod] ?? 'CASH';

    // Si el pedido lo hizo un cliente registrado, la venta queda a su nombre
    // en el ERP — mismo historial y puntos que una compra hecha en tienda.
    let customerId: string | null = null;
    if (order.storeCustomerId) {
      const storeCustomer = await prisma.storeCustomer.findUnique({ where: { id: order.storeCustomerId } });
      customerId = storeCustomer?.customerId ?? null;
    }
    // Pedido como invitado (sin sesión iniciada) — antes la venta quedaba
    // sin cliente aunque el teléfono fuera el de alguien ya registrado (bug
    // real: el reporte de consumos y los puntos dependen de este vínculo,
    // y "Mis pedidos" sí encuentra el pedido por teléfono aunque la venta no
    // tenga dueño, así que se veía en el historial pero no en el reporte).
    // Se busca un Customer con ese teléfono igual que al registrarse en la
    // tienda; si tampoco existe ahí, se crea uno — ningún pedido queda sin
    // cliente asociado en el ERP, sea que haya iniciado sesión o no.
    if (!customerId) {
      customerId = await this.findOrCreateCustomerByPhone(order.customerName, order.customerPhone);
    }
    const loyaltyConfig = customerId ? await getSettingValues(['loyalty_points_per_sol']) : {};
    const pointsPerSol = Number(loyaltyConfig['loyalty_points_per_sol'] ?? 1);
    const pointsEarned = customerId ? Math.floor(Number(order.total) * pointsPerSol) : 0;

    // El número de venta se reparte fuera de la transacción; si choca, se
    // repite toda la transacción con otro número (ver utils/sequence.ts).
    return withSaleNumber((saleNumber) => prisma.$transaction(async (tx) => {
      const stockWarnings: string[] = [];
      // Tomar el pedido de forma atómica: si dos personas pulsan "Confirmar" a
      // la vez (o hay doble clic), solo una crea la venta.
      const claimed = await tx.storeOrder.updateMany({
        where: { id, status: 'PENDING', saleId: null },
        data: { status: 'CONFIRMED' },
      });
      if (claimed.count === 0) throw new BusinessError('Este pedido ya fue confirmado o ya no está pendiente.');

      // Fetch products and validate stock
      const productIds = order.items.map(i => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map(p => [p.id, p]));

      // Calculate sale totals
      let subtotal = 0;
      const saleItems = order.items.map(item => {
        subtotal += Number(item.subtotal);
        const product = productMap.get(item.productId);
        return {
          productId: item.productId,
          // La opción elegida viaja en el nombre para que salga en el ticket.
          productName: item.options ? `${item.name} — ${item.options}`.slice(0, 250) : item.name,
          unitsPerSale: item.unitsPerSale,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          originalPrice: Number(item.unitPrice),
          discountAmount: 0,
          discountPercent: 0,
          subtotal: Number(item.subtotal),
          // Costo en el momento de la venta — sin esto (bug real, ya
          // corregido) toda venta generada desde un pedido web quedaba con
          // costPrice vacío, y el reporte de margen la trata como costo 0
          // (100% margen), inflando el profit de CUALQUIER pedido online.
          // Mismo criterio que el POS (sales.service.ts): el producto
          // comodín no tiene costo real, se asume 15% de margen en vez de
          // 0 de costo — no debería llegar a vender por acá (no aparece en
          // la tienda), pero por si acaso queda igual de protegido.
          costPrice: product ? (product.isMiscItem ? Number(item.unitPrice) * 0.85 : Number(product.costPrice) * item.unitsPerSale) : null,
          // Para el ticket si se reimprime desde el ERP: columna "Unidad"
          // clara (kg/g/l/ml o "und"), igual que sales.service.ts.
          unit: product ? (product.isBulk && item.unitsPerSale === 1 ? (product.bulkUnit ?? 'kg') : 'und') : 'und',
        };
      });

      // El descuento por puntos ya se calculó (y mostró) al crear el
      // pedido — acá se aplica de verdad a la venta del ERP, igual que
      // cualquier otro descuento de una venta hecha en el POS.
      const pointsDiscountAmount = Number(order.pointsDiscountAmount);
      const discountedSubtotal = subtotal - pointsDiscountAmount;
      // Comisión de tarjeta cobrada en el pedido web: se guarda aparte del
      // total de la venta, igual que hace el POS (no infla ventas ni NRUS).
      const cardCommission = order.paymentMethod === 'CARD_CONTRAENTREGA'
        ? Math.max(0, Math.round((Number(order.total) - Number(order.subtotal) - Number(order.deliveryCost) + pointsDiscountAmount) * 100) / 100)
        : 0;

      const taxRate = 0.18;
      const netAmount = discountedSubtotal / (1 + taxRate);
      const taxAmount = discountedSubtotal - netAmount;

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
          totalAmount: discountedSubtotal,
          discountAmount: pointsDiscountAmount,
          commissionAmount: cardCommission,
          commissionPercent: cardCommission > 0 ? CARD_FEE_PERCENT : 0,
          status: 'COMPLETED',
          pointsEarned,
          notes: `Pedido web ${order.orderNumber} — ${order.deliveryType === 'DELIVERY' ? 'Delivery' : 'Recojo en tienda'}`
            + (order.pointsRedeemed > 0 ? ` — canjeó ${order.pointsRedeemed} pts (S/ ${pointsDiscountAmount.toFixed(2)})` : ''),
          items: {
            create: saleItems,
          },
          payments: {
            create: [{
              method: paymentMethod as never,
              amount: discountedSubtotal,
              commissionAmount: cardCommission,
            }],
          },
        },
      });

      // Canje de puntos: resta atómica con resguardo — si por cualquier
      // motivo el cliente ya no tiene suficientes puntos al momento de
      // confirmar (ej. se le canjearon en otra venta mientras el pedido
      // esperaba confirmación), se corta toda la transacción en vez de
      // dejar puntos en negativo. Mismo mecanismo que usa el POS.
      if (customerId && Number(order.pointsRedeemed) > 0) {
        const redemption = await tx.customer.updateMany({
          where: { id: customerId, loyaltyPoints: { gte: order.pointsRedeemed } },
          data: { loyaltyPoints: { decrement: order.pointsRedeemed } },
        });
        if (redemption.count === 0) {
          throw new BusinessError('El cliente ya no tiene suficientes puntos disponibles para este pedido — confírmalo sin canjear puntos.');
        }
      }

      if (customerId && pointsEarned > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
      }

      // Descontar stock con una resta dentro de la misma consulta (antes se
      // escribía un valor calculado antes y, si el POS vendía el mismo producto
      // a la vez, uno de los dos descuentos se perdía). Si el sistema no tiene
      // suficiente, se hace el mismo ajuste automático que en el POS (venta sin
      // stock con auto-ajuste) y se avisa a quien confirma, en vez de dejar el
      // stock en 0 sin decir nada. Orden fijo por producto para no bloquearse
      // con otra venta que toque los mismos productos.
      const unitsByProduct = new Map<string, number>();
      for (const item of order.items) {
        unitsByProduct.set(item.productId, (unitsByProduct.get(item.productId) ?? 0) + Number(item.quantity) * item.unitsPerSale);
      }
      for (const productId of [...unitsByProduct.keys()].sort()) {
        const product = productMap.get(productId);
        if (!product || product.isMiscItem) continue;
        const units = unitsByProduct.get(productId)!;
        const after = await tx.product.update({
          where: { id: productId },
          data: { currentStock: { decrement: units } },
          select: { currentStock: true },
        });
        let stockAfter = Number(after.currentStock);
        let stockBefore = stockAfter + units;

        if (stockAfter < 0) {
          const shortage = -stockAfter;
          await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: shortage } } });
          await tx.inventoryMovement.create({
            data: {
              productId,
              type: 'ADJUSTMENT_IN',
              quantity: shortage,
              quantityBefore: stockBefore,
              quantityAfter: stockBefore + shortage,
              unitCost: product.costPrice,
              referenceType: 'SALE_AUTO_ADJUST',
              referenceId: order.id,
              userId,
              notes: `Ajuste automático por pedido web sin stock registrado (${order.orderNumber})`,
            },
          });
          stockWarnings.push(`${product.name}: el sistema tenía ${stockBefore}, se vendieron ${units}. Se ajustó ${shortage} automáticamente; revisa el físico.`);
          stockBefore += shortage;
          stockAfter = 0;
        }

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: 'SALE_OUT',
            quantity: units,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
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
        data: { saleId: sale.id },
        include: { items: true },
      });

      // Notify customer
      emitEvent(`store:order-updated:${order.orderNumber}`, { status: 'CONFIRMED', paymentStatus: order.paymentStatus });

      const result = { order: updated, saleId: sale.id, saleNumber: sale.saleNumber, stockWarnings };
      // Invalidate dashboard cache so it reflects the new web sale
      await redis.del('reports:dashboard').catch(() => {});
      return result;
    }));
  }

  async updateOrderStatus(id: string, status: string, paymentStatus?: string) {
    const current = await prisma.storeOrder.findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Pedido');
    // Una vez que el biker cerró el ciclo (o lo tiene en curso), el admin ya
    // no puede pisarlo marcando DELIVERED a mano — eso lo cierra el biker
    // desde apps/delivery, que es quien de verdad hizo la entrega.
    if (status === 'DELIVERED' && current.riderId && current.deliveryStatus !== 'ENTREGADO') {
      throw new BusinessError('Este pedido tiene un repartidor asignado — la entrega la confirma él desde su app.');
    }

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

    // Si ya hay un biker tomando el pedido, avisarle por push que puede
    // pasar a recogerlo apenas el staff lo marca listo.
    if (status === 'READY' && order.riderId) {
      await deliveryService.notifyReadyForPickup(order.id, order.riderId, order.orderNumber);
    }

    return order;
  }

  /* ── Datos del paquete físico (los llena el staff al preparar) ────────── */
  async updateOrderPackage(id: string, data: {
    packageTamano?: string; packageTipo?: string; packagePesoKg?: number; packageFragil?: boolean;
  }) {
    const order = await prisma.storeOrder.update({ where: { id }, data });
    return order;
  }
}

export const storeService = new StoreService();
