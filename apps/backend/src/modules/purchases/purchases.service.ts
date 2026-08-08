import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { treasuryService, methodToAccount } from '../treasury/treasury.service';
import { emitEvent } from '../../config/socket';
import type { Prisma, PurchaseOrderStatus } from '@prisma/client';

interface DirectPurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  isBonus?: boolean;
  batchNumber?: string;
  expiryDate?: Date;
}

export interface PurchasePaymentLeg {
  amount: number;
  method: string;
  // Solo aplica con method === 'CASH': si viene una sesión de caja abierta,
  // el dinero sale del cajón físico de esa caja (afecta su arqueo). Si se
  // omite, sale de Caja General (Treasury) — igual que antes de esta función.
  cashSessionId?: string;
}

interface PurchasePaymentInput {
  paid: boolean;
  legs?: PurchasePaymentLeg[];
}

export class PurchasesService {
  private async nextOrderNumber(): Promise<string> {
    const count = await prisma.purchaseOrder.count();
    return `OC-${String(count + 1).padStart(6, '0')}`;
  }

  private buildOrdersWhere(filters: {
    status?: string; supplierId?: string; search?: string; dateFrom?: Date; dateTo?: Date;
  }): Prisma.PurchaseOrderWhereInput {
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (filters.status) where.status = filters.status as PurchaseOrderStatus;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }
    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { supplierInvoice: { contains: filters.search, mode: 'insensitive' } },
        { supplier: { businessName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async listOrders(filters: {
    status?: string; supplierId?: string; search?: string; dateFrom?: Date; dateTo?: Date;
    page: number; limit: number; sortBy?: 'createdAt' | 'totalAmount' | 'orderNumber'; sortOrder?: 'asc' | 'desc';
  }) {
    const where = this.buildOrdersWhere(filters);
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    const [data, total, aggregate] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { businessName: true } },
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({ where, _sum: { totalAmount: true, paidAmount: true } }),
    ]);

    return {
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
      totals: {
        totalAmount: Number(aggregate._sum.totalAmount ?? 0),
        paidAmount: Number(aggregate._sum.paidAmount ?? 0),
      },
    };
  }

  // Mismos filtros que listOrders(), sin paginar — para exportar a Excel.
  async exportOrders(filters: { status?: string; supplierId?: string; search?: string; dateFrom?: Date; dateTo?: Date }) {
    const where = this.buildOrdersWhere(filters);

    return prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { businessName: true } },
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Liquidación consolidada de pagos a un proveedor en un rango de fechas —
  // agrupa todos los SupplierPayment (uno por cada vez que se pagó una OC)
  // para poder entregarle al proveedor un resumen de lo que se le ha pagado.
  async getSupplierSettlement(filters: { supplierId: string; dateFrom?: Date; dateTo?: Date }) {
    const supplier = await prisma.supplier.findUnique({ where: { id: filters.supplierId } });
    if (!supplier) throw new NotFoundError('Proveedor');

    const payments = await prisma.supplierPayment.findMany({
      where: {
        purchaseOrder: { supplierId: filters.supplierId },
        ...(filters.dateFrom || filters.dateTo
          ? { paidAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
      include: {
        purchaseOrder: { select: { orderNumber: true, totalAmount: true, supplierInvoice: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { paidAt: 'asc' },
    });

    const totalsByMethod: Record<string, number> = {};
    let grandTotal = 0;
    for (const p of payments) {
      const amount = Number(p.amount);
      totalsByMethod[p.method] = (totalsByMethod[p.method] ?? 0) + amount;
      grandTotal += amount;
    }

    return {
      supplier: { id: supplier.id, businessName: supplier.businessName, taxId: supplier.taxId },
      payments: payments.map((p) => ({
        id: p.id,
        paidAt: p.paidAt,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        orderNumber: p.purchaseOrder.orderNumber,
        orderTotal: Number(p.purchaseOrder.totalAmount),
        supplierInvoice: p.purchaseOrder.supplierInvoice,
        user: `${p.user.firstName} ${p.user.lastName}`,
      })),
      totalsByMethod,
      grandTotal,
      count: payments.length,
    };
  }

  async getOrder(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        user: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        voidedBy: { select: { firstName: true, lastName: true } },
        items: {
          include: { product: { select: { id: true, name: true, barcode: true, currentStock: true } } },
        },
        receipts: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    return order;
  }

  async createOrder(userId: string, data: {
    supplierId: string;
    expectedDate?: Date;
    notes?: string;
    supplierInvoice?: string;
    includeTax?: boolean;
    items: Array<{ productId: string; orderedQty: number; unitCost: number }>;
  }) {
    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, deletedAt: null } });
    if (!supplier) throw new NotFoundError('Proveedor');

    let subtotal = 0;
    for (const item of data.items) {
      subtotal += item.orderedQty * item.unitCost;
    }
    // Muchos proveedores (mercados, abastos) no facturan ni desglosan IGV —
    // el costo unitario ya ES el total pagado, así que el IGV es opcional.
    const taxAmount = data.includeTax ? subtotal * 0.18 : 0;
    const totalAmount = subtotal + taxAmount;

    const order = await prisma.purchaseOrder.create({
      data: {
        orderNumber: await this.nextOrderNumber(),
        supplierId: data.supplierId,
        userId,
        expectedDate: data.expectedDate,
        notes: data.notes,
        supplierInvoice: data.supplierInvoice,
        status: 'PENDING_APPROVAL',
        subtotal,
        taxAmount,
        totalAmount,
        items: {
          create: data.items.map(i => ({
            productId: i.productId,
            orderedQty: i.orderedQty,
            unitCost: i.unitCost,
            subtotal: i.orderedQty * i.unitCost,
          })),
        },
      },
      include: {
        supplier: { select: { businessName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });

    // Registra/actualiza el catálogo del proveedor con el precio cotizado,
    // para que el sistema ya sepa que este proveedor vende estos productos
    // aunque la orden todavía no se haya recibido.
    await Promise.all(data.items.map(i => this.trackSupplierProduct(data.supplierId, i.productId, i.unitCost)));

    return order;
  }

  /**
   * Aplica un pago (parcial o total) contra el saldo pendiente de una compra
   * ya recibida, en la misma transacción — así el dinero sale de la cuenta
   * correcta en el momento exacto en que realmente se le paga al proveedor,
   * no cuando se registra la mercadería.
   *
   * Cada "leg" retira de una fuente distinta: si es efectivo y trae una
   * sesión de caja abierta, sale del cajón físico de esa caja (afecta su
   * arqueo del día); si no, sale de Caja General (Treasury). Esto permite
   * pagar todo desde la caja del día, todo desde Caja General, o fraccionado
   * entre ambas y distintos métodos (efectivo/Yape/Plin) a la vez.
   */
  private async applyPurchasePaymentLegs(
    tx: Prisma.TransactionClient,
    orderId: string,
    totalAmount: number,
    legs: PurchasePaymentLeg[],
    userId: string,
    description: string,
  ) {
    const amount = legs.reduce((sum, l) => sum + l.amount, 0);
    if (amount <= 0) return;

    for (const leg of legs) {
      if (leg.amount <= 0) continue;

      let cashSession = null;
      if (leg.method === 'CASH' && leg.cashSessionId) {
        cashSession = await tx.cashSession.findFirst({ where: { id: leg.cashSessionId, status: 'OPEN' } });
      }

      if (cashSession) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: cashSession.id, type: 'WITHDRAWAL', amount: leg.amount, reason: description,
            referenceType: 'PURCHASE', referenceId: orderId,
          },
        });
      } else {
        await treasuryService.recordMovementInTx(
          tx, 'WITHDRAWAL', leg.amount, description, userId, 'PURCHASE', orderId, methodToAccount(leg.method),
        );
      }
    }

    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    const newPaidAmount = Number(order.paidAmount) + amount;
    const newStatus = newPaidAmount >= totalAmount - 0.009 ? 'PAID' : newPaidAmount > 0 ? 'PARTIAL' : 'CREDIT';

    await tx.purchaseOrder.update({
      where: { id: orderId },
      data: { paidAmount: newPaidAmount, paymentStatus: newStatus },
    });
  }

  private async trackSupplierProduct(supplierId: string, productId: string, price: number, confirmed = false) {
    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      create: { supplierId, productId, price, lastPurchaseAt: confirmed ? new Date() : undefined },
      update: { price, ...(confirmed ? { lastPurchaseAt: new Date() } : {}) },
    });
  }

  /**
   * Corrige cantidad y/o costo cotizado de una línea ANTES de recibir la
   * mercadería — para errores de tipeo (ej. "1" en vez de "20") sin tener que
   * anular y rehacer toda la orden. Una vez que la orden tiene algo recibido,
   * la línea ya no se puede tocar aquí (usa "corregir línea recibida", que sí
   * revierte costo/stock con exactitud).
   */
  async updateOrderItem(orderId: string, itemId: string, data: { orderedQty?: number; unitCost?: number }) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Orden de compra');
    if (order.voidedAt) throw new BusinessError('Esta compra ya fue anulada.');
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(order.status)) {
      throw new BusinessError('Solo se puede editar la cantidad o costo de una orden que todavía no tiene mercadería recibida.');
    }

    const item = await prisma.purchaseOrderItem.findFirst({ where: { id: itemId, purchaseOrderId: orderId } });
    if (!item) throw new NotFoundError('Línea de la orden');

    const newQty = data.orderedQty ?? Number(item.orderedQty);
    const newUnitCost = data.unitCost ?? Number(item.unitCost);
    if (newQty <= 0) throw new BusinessError('La cantidad debe ser mayor a 0.');
    if (newUnitCost < 0) throw new BusinessError('El costo unitario no puede ser negativo.');

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.update({
        where: { id: itemId },
        data: { orderedQty: newQty, unitCost: newUnitCost, subtotal: newQty * newUnitCost },
      });
      await this.recalcOrderTotals(tx, orderId);
    });

    return this.getOrder(orderId);
  }

  async approveOrder(id: string, approverId: string) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, status: 'PENDING_APPROVAL' } });
    if (!order) throw new BusinessError('Solo se pueden aprobar órdenes en estado PENDING_APPROVAL.');
    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approverId },
    });
  }

  async cancelOrder(id: string) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Orden de compra');
    if (['RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED'].includes(order.status)) {
      throw new BusinessError('Esta orden ya tiene mercadería recibida — usa "Anular compra" para revertir el stock y costo correctamente.');
    }
    return prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /**
   * Núcleo del Costo Promedio Ponderado: recalcula stock y costo de un
   * producto por UNA línea de compra (o bonificación), y deja el rastro en
   * el kardex (InventoryMovement) con el costo de antes/después para poder
   * revertirlo con exactitud si la compra se anula más adelante.
   *
   * El costo de una bonificación se fuerza a 0 aquí, sin importar lo que
   * llegue en unitCost — así ninguna llamada externa puede saltarse la regla.
   * La cantidad bonificada sí suma al stock, así que el promedio baja, pero
   * el costo total pagado no cambia.
   */
  private async applyPurchaseLine(
    tx: Prisma.TransactionClient,
    input: { productId: string; quantity: number; unitCost: number; isBonus: boolean },
    context: { userId: string; supplierId: string; referenceId: string; notes: string },
  ) {
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new NotFoundError(`Producto ${input.productId}`);

    const effectiveCost = input.isBonus ? 0 : input.unitCost;
    const stockBefore = Number(product.currentStock);
    const avgCostBefore = Number(product.costPrice);
    const stockAfter = stockBefore + input.quantity;
    const avgCostAfter = stockAfter > 0
      ? (stockBefore * avgCostBefore + input.quantity * effectiveCost) / stockAfter
      : avgCostBefore;

    await tx.product.update({
      where: { id: input.productId },
      data: { currentStock: stockAfter, costPrice: avgCostAfter },
    });

    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type: 'PURCHASE_IN',
        quantity: input.quantity,
        quantityBefore: stockBefore,
        quantityAfter: stockAfter,
        unitCost: effectiveCost,
        avgCostBefore,
        avgCostAfter,
        referenceType: 'PURCHASE',
        referenceId: context.referenceId,
        userId: context.userId,
        notes: context.notes,
      },
    });

    // El catálogo de precios del proveedor no debe ensuciarse con
    // bonificaciones (costo forzado a 0) — solo se registra con líneas pagadas.
    if (!input.isBonus) {
      await tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: context.supplierId, productId: input.productId } },
        create: { supplierId: context.supplierId, productId: input.productId, price: input.unitCost, lastPurchaseAt: new Date() },
        update: { price: input.unitCost, lastPurchaseAt: new Date() },
      });
    }
  }

  /**
   * Encuentra o crea la línea de la orden para un producto recibido — una
   * bonificación puede ser de un producto que nunca estuvo en la orden
   * original (ej. compras atún y te regalan mermelada), así que no siempre
   * hay una línea previa que incrementar.
   *
   * Si la línea ya existía (venía de la orden original), también hay que
   * actualizar su costo/bonificación/subtotal a lo que realmente se recibió
   * — antes solo se incrementaba receivedQty, así que si el almacenero
   * marcaba "es bonificación" al recibir, esa corrección se perdía y la
   * orden seguía cobrando el costo original cotizado (lo que le debía
   * quedar al proveedor terminaba mal calculado).
   */
  private async upsertOrderItemReceipt(
    tx: Prisma.TransactionClient,
    orderId: string,
    existingItems: Array<{ id: string; productId: string; receivedQty: Prisma.Decimal | number }>,
    item: { productId: string; receivedQty: number; unitCost: number; isBonus: boolean },
  ) {
    const existing = existingItems.find(oi => oi.productId === item.productId);
    if (existing) {
      const newReceivedQty = Number(existing.receivedQty) + item.receivedQty;
      await tx.purchaseOrderItem.update({
        where: { id: existing.id },
        data: {
          receivedQty: newReceivedQty,
          unitCost: item.isBonus ? 0 : item.unitCost,
          isBonus: item.isBonus,
          subtotal: item.isBonus ? 0 : newReceivedQty * item.unitCost,
        },
      });
    } else {
      await tx.purchaseOrderItem.create({
        data: {
          purchaseOrderId: orderId,
          productId: item.productId,
          orderedQty: item.receivedQty,
          receivedQty: item.receivedQty,
          unitCost: item.isBonus ? 0 : item.unitCost,
          isBonus: item.isBonus,
          subtotal: item.isBonus ? 0 : item.receivedQty * item.unitCost,
        },
      });
    }
  }

  /**
   * Recalcula subtotal/IGV/total de la orden a partir de sus líneas — se usa
   * después de recibir mercadería o de corregir una línea, para que "cuánto
   * se le debe al proveedor" siempre refleje lo realmente recibido (costo y
   * bonificación reales), no solo lo cotizado en la orden original.
   */
  private async recalcOrderTotals(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: orderId } });

    const newSubtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
    const oldSubtotal = Number(order.subtotal);
    const taxRatio = oldSubtotal > 0 ? Number(order.taxAmount) / oldSubtotal : 0;
    const newTaxAmount = Math.round(newSubtotal * taxRatio * 100) / 100;
    const newTotalAmount = Math.round((newSubtotal + newTaxAmount) * 100) / 100;

    const paidAmount = Number(order.paidAmount);
    const newPaymentStatus = paidAmount <= 0 ? 'CREDIT' : paidAmount >= newTotalAmount - 0.009 ? 'PAID' : 'PARTIAL';

    await tx.purchaseOrder.update({
      where: { id: orderId },
      data: { subtotal: newSubtotal, taxAmount: newTaxAmount, totalAmount: newTotalAmount, paymentStatus: newPaymentStatus },
    });
  }

  async receiveOrder(
    orderId: string,
    userId: string,
    items: Array<{ productId: string; receivedQty: number; unitCost: number; isBonus?: boolean; batchNumber?: string; expiryDate?: Date }>,
    notes?: string,
    payment?: PurchasePaymentInput,
  ) {
    const order = await this.getOrder(orderId);
    if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new BusinessError('Solo se puede recibir mercadería en órdenes aprobadas o enviadas.');
    }

    // Lo que realmente se le debe al proveedor por ESTA recepción (una orden
    // puede recibirse en varias partes, cada una con su propio pago o no).
    const receiptTotal = items.reduce((sum, i) => sum + (i.isBonus ? 0 : i.receivedQty * i.unitCost), 0);

    const receipt = await prisma.$transaction(async (tx) => {
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: orderId,
          notes,
          items: {
            create: items.map(i => ({
              productId: i.productId,
              orderedQty: order.items.find(oi => oi.productId === i.productId)?.orderedQty ?? 0,
              receivedQty: i.receivedQty,
              unitCost: i.isBonus ? 0 : i.unitCost,
              isBonus: i.isBonus ?? false,
              batchNumber: i.batchNumber,
              expiryDate: i.expiryDate,
            })),
          },
        },
      });

      for (const item of items) {
        if (item.receivedQty <= 0) continue;

        await this.applyPurchaseLine(tx, {
          productId: item.productId,
          quantity: item.receivedQty,
          unitCost: item.unitCost,
          isBonus: item.isBonus ?? false,
        }, {
          userId,
          supplierId: order.supplierId,
          referenceId: orderId,
          notes: `Recepción OC ${order.orderNumber}${item.isBonus ? ' (bonificación)' : ''}`,
        });

        await this.upsertOrderItemReceipt(tx, orderId, order.items, {
          productId: item.productId,
          receivedQty: item.receivedQty,
          unitCost: item.unitCost,
          isBonus: item.isBonus ?? false,
        });
      }

      // El total de la orden se recalcula desde las líneas ya actualizadas —
      // así, si al recibir se marcó algo como bonificación o con otro costo,
      // "cuánto se le debe al proveedor" queda reflejando la realidad y no
      // lo originalmente cotizado.
      await this.recalcOrderTotals(tx, orderId);

      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: orderId } });
      const allReceived = updatedItems.every(i => Number(i.receivedQty) >= Number(i.orderedQty));
      const anyReceived = updatedItems.some(i => Number(i.receivedQty) > 0);
      const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : order.status;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: newStatus, receivedDate: allReceived ? new Date() : undefined },
      });

      if (payment?.paid && receiptTotal > 0) {
        const legs = payment.legs ?? [];
        const legsSum = legs.reduce((sum, l) => sum + l.amount, 0);
        if (Math.abs(legsSum - receiptTotal) > 0.01) {
          throw new BusinessError(
            `La suma de las formas de pago (S/ ${legsSum.toFixed(2)}) no coincide con el total a pagar (S/ ${receiptTotal.toFixed(2)}).`,
          );
        }
        const freshOrder = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
        await this.applyPurchasePaymentLegs(
          tx, orderId, Number(freshOrder.totalAmount), legs, userId,
          `Pago de compra: OC ${order.orderNumber} — ${order.supplier.businessName}`,
        );
      }

      return receipt;
    });

    if (payment?.paid) emitEvent('erp:cash-updated');
    return receipt;
  }

  /**
   * "Registrar Compra" — cuando la mercadería ya llegó con factura/guía en
   * mano, no hace falta el ciclo orden→aprobación→recepción: se registra y
   * se aplica todo de inmediato (stock, CPP, kardex) en una sola transacción.
   */
  async createDirectPurchase(userId: string, data: {
    supplierId: string;
    documentNumber?: string;
    date?: Date;
    notes?: string;
    includeTax?: boolean;
    items: DirectPurchaseItemInput[];
    payment?: PurchasePaymentInput;
  }) {
    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, deletedAt: null } });
    if (!supplier) throw new NotFoundError('Proveedor');
    if (data.items.length === 0) throw new BusinessError('La compra debe tener al menos un producto.');

    let subtotal = 0;
    for (const item of data.items) {
      if (!item.isBonus) subtotal += item.quantity * item.unitCost;
    }
    // Igual que en las órdenes de compra: el IGV es opcional, porque casi
    // siempre este flujo se usa para compras sin factura (mercado/abastos)
    // donde el costo ingresado ya es el total real pagado.
    const taxAmount = data.includeTax ? subtotal * 0.18 : 0;
    const totalAmount = subtotal + taxAmount;
    const now = data.date ?? new Date();

    const { orderId } = await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          orderNumber: await this.nextOrderNumber(),
          supplierId: data.supplierId,
          userId,
          status: 'RECEIVED',
          receivedDate: now,
          supplierInvoice: data.documentNumber,
          notes: data.notes,
          subtotal,
          taxAmount,
          totalAmount,
          items: {
            create: data.items.map(i => ({
              productId: i.productId,
              orderedQty: i.quantity,
              receivedQty: i.quantity,
              unitCost: i.isBonus ? 0 : i.unitCost,
              isBonus: i.isBonus ?? false,
              subtotal: i.isBonus ? 0 : i.quantity * i.unitCost,
            })),
          },
        },
      });

      await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: order.id,
          notes: 'Registrado directamente (compra ya recibida).',
          items: {
            create: data.items.map(i => ({
              productId: i.productId,
              orderedQty: i.quantity,
              receivedQty: i.quantity,
              unitCost: i.isBonus ? 0 : i.unitCost,
              isBonus: i.isBonus ?? false,
              batchNumber: i.batchNumber,
              expiryDate: i.expiryDate,
            })),
          },
        },
      });

      for (const item of data.items) {
        await this.applyPurchaseLine(tx, {
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          isBonus: item.isBonus ?? false,
        }, {
          userId,
          supplierId: data.supplierId,
          referenceId: order.id,
          notes: `Compra ${order.orderNumber}${item.isBonus ? ' (bonificación)' : ''}`,
        });
      }

      if (data.payment?.paid && totalAmount > 0) {
        const legs = data.payment.legs ?? [];
        const legsSum = legs.reduce((sum, l) => sum + l.amount, 0);
        if (Math.abs(legsSum - totalAmount) > 0.01) {
          throw new BusinessError(
            `La suma de las formas de pago (S/ ${legsSum.toFixed(2)}) no coincide con el total a pagar (S/ ${totalAmount.toFixed(2)}).`,
          );
        }
        await this.applyPurchasePaymentLegs(
          tx, order.id, totalAmount, legs, userId,
          `Pago de compra: OC ${order.orderNumber} — ${supplier.businessName}`,
        );
      }

      return { orderId: order.id };
    });

    if (data.payment?.paid) emitEvent('erp:cash-updated');
    return this.getOrder(orderId);
  }

  /**
   * Antes de anular, avisa si ya se vendieron esos productos después de la
   * compra — revertir el costo en ese caso podría no reflejar la realidad
   * actual del inventario (regla de negocio pedida explícitamente).
   */
  async checkVoidWarnings(orderId: string) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundError('Orden de compra');

    const productIds = [...new Set(order.items.map(i => i.productId))];
    const cutoff = order.receivedDate ?? order.createdAt;

    const salesAfter = await prisma.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: { createdAt: { gt: cutoff }, status: 'COMPLETED' },
      },
      distinct: ['productId'],
      include: { product: { select: { name: true } } },
    });

    return {
      hasWarning: salesAfter.length > 0,
      affectedProducts: salesAfter.map(s => s.product.name),
    };
  }

  async voidPurchase(orderId: string, userId: string, reason: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { supplier: { select: { businessName: true } } },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    if (order.status !== 'RECEIVED') throw new BusinessError('Solo se pueden anular compras que ya fueron recibidas por completo.');
    if (order.voidedAt) throw new BusinessError('Esta compra ya fue anulada.');

    // Se revierte en orden inverso al que se aplicó, para que cada paso
    // regrese el costo exactamente al valor que tenía justo antes de esa
    // línea (así, al deshacer todo, el producto queda igual que antes de
    // esta compra, sin importar cuántas líneas tocaron el mismo producto).
    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'PURCHASE_IN' },
      orderBy: { createdAt: 'desc' },
    });
    if (movements.length === 0) throw new BusinessError('No se encontraron movimientos de esta compra para revertir.');

    // Si ya se le había pagado algo a este proveedor por esta compra, ese
    // dinero tiene que volver — si no, quedaría retirado para siempre por una
    // compra que ya no existe. Puede haber salido de Caja General o de una
    // caja del día específica (según cómo se pagó), así que hay que revisar
    // ambas fuentes. Si el pago ya se revirtió antes (revertPurchasePayment
    // dejó paidAmount en 0), no hay nada pendiente que devolver — evita
    // devolver el mismo dinero dos veces.
    const paidTreasuryMovements = Number(order.paidAmount) > 0
      ? await prisma.treasuryMovement.findMany({
        where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'WITHDRAWAL' },
      })
      : [];
    const paidCashMovements = Number(order.paidAmount) > 0
      ? await prisma.cashMovement.findMany({
        where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'WITHDRAWAL' },
      })
      : [];

    await prisma.$transaction(async (tx) => {
      for (const m of movements) {
        const product = await tx.product.findUnique({ where: { id: m.productId } });
        if (!product) continue;

        const stockBefore = Number(product.currentStock);
        const stockAfter = stockBefore - Number(m.quantity);
        const avgCostAfter = m.avgCostBefore != null ? Number(m.avgCostBefore) : Number(product.costPrice);

        await tx.product.update({
          where: { id: m.productId },
          data: { currentStock: stockAfter, costPrice: avgCostAfter },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: m.productId,
            type: 'PURCHASE_VOID',
            quantity: -Number(m.quantity),
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: m.unitCost,
            avgCostBefore: Number(product.costPrice),
            avgCostAfter,
            referenceType: 'PURCHASE',
            referenceId: orderId,
            userId,
            notes: `Anulación OC ${order.orderNumber} — ${reason}`,
          },
        });
      }

      for (const pm of paidTreasuryMovements) {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', Number(pm.amount),
          `Reversión pago (compra anulada): OC ${order.orderNumber} — ${order.supplier.businessName}`,
          userId, 'PURCHASE_VOID', orderId, pm.account,
        );
      }

      for (const cm of paidCashMovements) {
        // Si esa caja sigue abierta, el dinero vuelve a su cajón físico
        // (mismo arqueo del que salió). Si ya se cerró, no se le puede tocar
        // el conteo — se deposita a Caja General para no perder el dinero.
        const session = await tx.cashSession.findUnique({ where: { id: cm.cashSessionId } });
        if (session?.status === 'OPEN') {
          await tx.cashMovement.create({
            data: {
              cashSessionId: cm.cashSessionId, type: 'DEPOSIT', amount: cm.amount,
              reason: `Reversión pago (compra anulada): OC ${order.orderNumber} — ${order.supplier.businessName}`,
              referenceType: 'PURCHASE_VOID', referenceId: orderId,
            },
          });
        } else {
          await treasuryService.recordMovementInTx(
            tx, 'DEPOSIT', Number(cm.amount),
            `Reversión pago (compra anulada, caja ya cerrada): OC ${order.orderNumber} — ${order.supplier.businessName}`,
            userId, 'PURCHASE_VOID', orderId, 'CASH',
          );
        }
      }

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', voidedAt: new Date(), voidedById: userId, voidReason: reason },
      });
    });

    if (paidTreasuryMovements.length > 0 || paidCashMovements.length > 0) emitEvent('erp:cash-updated');

    return this.getOrder(orderId);
  }

  /**
   * Corrige un error de registro donde una compra se marcó como pagada
   * (efectivo/Yape/etc.) cuando en realidad quedó a crédito — sin tocar
   * stock ni costo, que ya se aplicaron correctamente y pueden tener ventas
   * encima. Revierte solo el dinero: le devuelve a Caja General (o a la caja
   * del día, si de ahí salió) lo que se había retirado, borra cualquier pago
   * registrado en Cuentas por Pagar, y deja la orden en CREDIT con saldo
   * pendiente completo, tal como debió quedar desde el inicio.
   */
  async revertPurchasePayment(orderId: string, userId: string, reason: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { supplier: { select: { businessName: true } } },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    if (order.voidedAt) throw new BusinessError('Esta compra ya fue anulada.');
    if (Number(order.paidAmount) <= 0) throw new BusinessError('Esta compra no tiene ningún pago registrado.');

    const paidTreasuryMovements = await prisma.treasuryMovement.findMany({
      where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'WITHDRAWAL' },
    });
    const paidCashMovements = await prisma.cashMovement.findMany({
      where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'WITHDRAWAL' },
    });

    await prisma.$transaction(async (tx) => {
      for (const pm of paidTreasuryMovements) {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', Number(pm.amount),
          `Reversión de pago (corrección — ${reason}): OC ${order.orderNumber} — ${order.supplier.businessName}`,
          userId, 'PURCHASE_PAYMENT_REVERT', orderId, pm.account,
        );
      }

      for (const cm of paidCashMovements) {
        const session = await tx.cashSession.findUnique({ where: { id: cm.cashSessionId } });
        if (session?.status === 'OPEN') {
          await tx.cashMovement.create({
            data: {
              cashSessionId: cm.cashSessionId, type: 'DEPOSIT', amount: cm.amount,
              reason: `Reversión de pago (corrección — ${reason}): OC ${order.orderNumber} — ${order.supplier.businessName}`,
              referenceType: 'PURCHASE_PAYMENT_REVERT', referenceId: orderId,
            },
          });
        } else {
          await treasuryService.recordMovementInTx(
            tx, 'DEPOSIT', Number(cm.amount),
            `Reversión de pago (corrección, caja ya cerrada): OC ${order.orderNumber} — ${order.supplier.businessName}`,
            userId, 'PURCHASE_PAYMENT_REVERT', orderId, 'CASH',
          );
        }
      }

      // Los pagos contra saldo pendiente (Cuentas por Pagar) también quedan
      // sin efecto — ya se devolvió el dinero arriba, dejarlos crearía un
      // historial de "pagos" que en realidad nunca ocurrieron.
      await tx.supplierPayment.deleteMany({ where: { purchaseOrderId: orderId } });

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { paidAmount: 0, paymentStatus: 'CREDIT' },
      });
    });

    emitEvent('erp:cash-updated');
    return this.getOrder(orderId);
  }

  /**
   * Corrige una línea ya recibida: el producto, el costo unitario y/o si es
   * bonificación — sin necesidad de anular toda la orden ni tocar las demás
   * líneas correctas. Cubre casos como "se recibió mal el producto" (ej.
   * "Mayonesa 8g" cuando era "Mayonesa 50g") y también "se marcó con costo
   * cuando en realidad era una bonificación del proveedor" (o viceversa).
   *
   * Revierte el stock/costo de la línea tal como estaba (misma matemática
   * que anular, pero solo para esta línea) y vuelve a aplicarlo con los
   * valores corregidos. También recalcula el total de la orden — si el
   * costo o la bonificación cambia, lo que se le debe al proveedor cambia
   * con eso.
   */
  async correctReceivedLine(
    orderId: string,
    userId: string,
    productId: string,
    reason: string,
    changes: { toProductId?: string; unitCost?: number; isBonus?: boolean },
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { supplier: { select: { businessName: true } } },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    if (order.voidedAt) throw new BusinessError('Esta compra ya fue anulada.');

    const toProductId = changes.toProductId ?? productId;

    const orderItem = await prisma.purchaseOrderItem.findFirst({
      where: { purchaseOrderId: orderId, productId },
    });
    if (!orderItem) throw new BusinessError('Esta orden no tiene ninguna línea de ese producto.');

    const newUnitCost = changes.unitCost ?? Number(orderItem.unitCost);
    const newIsBonus = changes.isBonus ?? orderItem.isBonus;
    if (toProductId === productId && newUnitCost === Number(orderItem.unitCost) && newIsBonus === orderItem.isBonus) {
      throw new BusinessError('No hay ningún cambio que aplicar — elige otro producto, costo o marca de bonificación.');
    }

    const toProduct = await prisma.product.findUnique({ where: { id: toProductId } });
    if (!toProduct) throw new NotFoundError('Producto correcto');

    const fromProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!fromProduct) throw new NotFoundError(`Producto ${productId}`);

    // Más nuevo primero — si hubiera más de una recepción de este producto en
    // esta orden, cada una se revierte contra el costo que tenía justo antes
    // de ella (igual criterio que anular compra).
    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceType: 'PURCHASE', referenceId: orderId, productId, type: 'PURCHASE_IN' },
      orderBy: { createdAt: 'desc' },
    });
    if (movements.length === 0) throw new BusinessError('Esta orden no tiene mercadería recibida de ese producto.');

    // Si ese producto tuvo OTRA compra o ajuste después de este, el
    // promedio ponderado ya avanzó sobre esos datos — revertir aquí
    // dejaría el costo actual mal calculado. Más seguro bloquear que
    // adivinar.
    const laterMovements = await prisma.inventoryMovement.findMany({
      where: {
        productId,
        type: { in: ['PURCHASE_IN', 'PURCHASE_VOID', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] },
        createdAt: { gt: movements[0].createdAt },
      },
    });
    if (laterMovements.length > 0) {
      throw new BusinessError('Este producto tuvo otra compra o ajuste de stock después de esta orden — no se puede corregir automáticamente sin arriesgar el costo promedio. Contacta soporte para revisarlo a mano.');
    }

    const totalQty = movements.reduce((s, m) => s + Number(m.quantity), 0);
    if (Number(fromProduct.currentStock) < totalQty) {
      throw new BusinessError(
        `No se puede corregir: el stock actual de "${fromProduct.name}" (${Number(fromProduct.currentStock)}) es menor a la cantidad de esta compra (${totalQty}) — probablemente ya se vendió de más sin contar con esta corrección.`,
      );
    }

    const changeNotes: string[] = [];
    if (toProductId !== productId) changeNotes.push(`producto → "${toProduct.name}"`);
    if (newUnitCost !== Number(orderItem.unitCost)) changeNotes.push(`costo unit. → S/ ${newUnitCost.toFixed(2)}`);
    if (newIsBonus !== orderItem.isBonus) changeNotes.push(newIsBonus ? 'ahora es bonificación' : 'ya no es bonificación');
    const changeSummary = changeNotes.join(', ');

    await prisma.$transaction(async (tx) => {
      for (const m of movements) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) continue;

        const stockBefore = Number(product.currentStock);
        const stockAfter = stockBefore - Number(m.quantity);
        const avgCostAfter = m.avgCostBefore != null ? Number(m.avgCostBefore) : Number(product.costPrice);

        await tx.product.update({
          where: { id: productId },
          data: { currentStock: stockAfter, costPrice: avgCostAfter },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: 'PURCHASE_VOID',
            quantity: -Number(m.quantity),
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: m.unitCost,
            avgCostBefore: Number(product.costPrice),
            avgCostAfter,
            referenceType: 'PURCHASE',
            referenceId: orderId,
            userId,
            notes: `Corrección de línea OC ${order.orderNumber} — ${reason} (${changeSummary})`,
          },
        });

        await this.applyPurchaseLine(tx, {
          productId: toProductId, quantity: Number(m.quantity), unitCost: newUnitCost, isBonus: newIsBonus,
        }, {
          userId, supplierId: order.supplierId, referenceId: orderId,
          notes: `Corrección de línea OC ${order.orderNumber} — ${reason} (${changeSummary})`,
        });
      }

      const newSubtotal = newIsBonus ? 0 : Number(orderItem.receivedQty) * newUnitCost;

      await tx.purchaseOrderItem.update({
        where: { id: orderItem.id },
        data: {
          productId: toProductId,
          unitCost: newIsBonus ? 0 : newUnitCost,
          isBonus: newIsBonus,
          subtotal: newSubtotal,
        },
      });
      await tx.purchaseReceiptItem.updateMany({
        where: { receipt: { purchaseOrderId: orderId }, productId },
        data: {
          productId: toProductId,
          unitCost: newIsBonus ? 0 : newUnitCost,
          isBonus: newIsBonus,
        },
      });

      // Lo que se le debe al proveedor por esta orden depende de sus líneas
      // — si esta corrección cambió el costo o la bonificación, el total
      // adeudado también debe cambiar.
      await this.recalcOrderTotals(tx, orderId);
    });

    emitEvent('erp:cash-updated');
    return this.getOrder(orderId);
  }

  /** Compras recibidas que todavía le deben algo al proveedor. */
  async listPayable(filters: { supplierId?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {
      status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] },
      paymentStatus: { not: 'PAID' },
    };
    if (filters.supplierId) where['supplierId'] = filters.supplierId;

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { businessName: true } },
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: data.map((o) => ({ ...o, outstanding: Number(o.totalAmount) - Number(o.paidAmount) })),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /**
   * Registra el pago (total o parcial) de una compra a crédito ya recibida
   * — retira de la fuente elegida en cada "leg" (caja del día o Caja General,
   * y puede fraccionarse entre varias) en el momento real en que sale el
   * dinero, usando el registro histórico (SupplierPayment) para trazabilidad.
   */
  async payOrder(orderId: string, userId: string, legs: PurchasePaymentLeg[], reference?: string, notes?: string) {
    const amount = legs.reduce((sum, l) => sum + l.amount, 0);
    if (amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (legs.some((l) => l.amount <= 0)) {
      throw new BusinessError('Cada forma de pago debe tener un monto mayor a 0.');
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { supplier: { select: { businessName: true } } },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    if (!['RECEIVED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new BusinessError('Solo se pueden pagar compras que ya fueron recibidas.');
    }

    const outstanding = Number(order.totalAmount) - Number(order.paidAmount);
    if (outstanding <= 0.009) throw new BusinessError('Esta compra ya está pagada por completo.');
    if (amount > outstanding + 0.009) {
      throw new BusinessError(`El monto excede el saldo pendiente (S/ ${outstanding.toFixed(2)}).`);
    }

    await prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        await tx.supplierPayment.create({
          data: { purchaseOrderId: orderId, userId, amount: leg.amount, method: leg.method as never, reference, notes },
        });
      }
      await this.applyPurchasePaymentLegs(
        tx, orderId, Number(order.totalAmount), legs, userId,
        `Pago a proveedor: OC ${order.orderNumber} — ${order.supplier.businessName}`,
      );
    });

    emitEvent('erp:cash-updated');
    return this.getOrder(orderId);
  }
}

export const purchasesService = new PurchasesService();
