import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { treasuryService, methodToAccount } from '../treasury/treasury.service';
import { emitEvent } from '../../config/socket';
import type { Prisma } from '@prisma/client';

interface DirectPurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  isBonus?: boolean;
  batchNumber?: string;
  expiryDate?: Date;
}

interface PurchasePaymentInput {
  paid: boolean;
  method?: string;
}

export class PurchasesService {
  private async nextOrderNumber(): Promise<string> {
    const count = await prisma.purchaseOrder.count();
    return `OC-${String(count + 1).padStart(6, '0')}`;
  }

  async listOrders(filters: { status?: string; supplierId?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.supplierId) where['supplierId'] = filters.supplierId;

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { businessName: true } },
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  // Mismos filtros que listOrders(), sin paginar — para exportar a Excel.
  async exportOrders(filters: { status?: string; supplierId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.supplierId) where['supplierId'] = filters.supplierId;

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
    items: Array<{ productId: string; orderedQty: number; unitCost: number }>;
  }) {
    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, deletedAt: null } });
    if (!supplier) throw new NotFoundError('Proveedor');

    let subtotal = 0;
    for (const item of data.items) {
      subtotal += item.orderedQty * item.unitCost;
    }
    const taxAmount = subtotal * 0.18;
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
   * ya recibida, y lo retira de Caja General en la misma transacción — así
   * el dinero sale de la cuenta correcta (efectivo/Yape/Plin) en el momento
   * exacto en que realmente se le paga al proveedor, no cuando se registra
   * la mercadería.
   */
  private async applyPurchasePayment(
    tx: Prisma.TransactionClient,
    orderId: string,
    totalAmount: number,
    amount: number,
    method: string | undefined,
    userId: string,
    description: string,
  ) {
    if (amount <= 0) return;

    await treasuryService.recordMovementInTx(
      tx, 'WITHDRAWAL', amount, description, userId, 'PURCHASE', orderId, methodToAccount(method),
    );

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
   */
  private async upsertOrderItemReceipt(
    tx: Prisma.TransactionClient,
    orderId: string,
    existingItems: Array<{ id: string; productId: string }>,
    item: { productId: string; receivedQty: number; unitCost: number; isBonus: boolean },
  ) {
    const existing = existingItems.find(oi => oi.productId === item.productId);
    if (existing) {
      await tx.purchaseOrderItem.update({
        where: { id: existing.id },
        data: { receivedQty: { increment: item.receivedQty } },
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

      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: orderId } });
      const allReceived = updatedItems.every(i => Number(i.receivedQty) >= Number(i.orderedQty));
      const anyReceived = updatedItems.some(i => Number(i.receivedQty) > 0);
      const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : order.status;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: newStatus, receivedDate: allReceived ? new Date() : undefined },
      });

      if (payment?.paid && receiptTotal > 0) {
        await this.applyPurchasePayment(
          tx, orderId, Number(order.totalAmount), receiptTotal, payment.method, userId,
          `Pago de compra: OC ${order.orderNumber}`,
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
    const taxAmount = subtotal * 0.18;
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
        await this.applyPurchasePayment(
          tx, order.id, totalAmount, totalAmount, data.payment.method, userId,
          `Pago de compra: OC ${order.orderNumber}`,
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
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
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
    // dinero tiene que volver a Caja General — si no, quedaría retirado para
    // siempre por una compra que ya no existe.
    const paidMovements = await prisma.treasuryMovement.findMany({
      where: { referenceType: 'PURCHASE', referenceId: orderId, type: 'WITHDRAWAL' },
    });

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

      for (const pm of paidMovements) {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', Number(pm.amount), `Reversión pago (compra anulada): OC ${order.orderNumber}`,
          userId, 'PURCHASE_VOID', orderId, pm.account,
        );
      }

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', voidedAt: new Date(), voidedById: userId, voidReason: reason },
      });
    });

    if (paidMovements.length > 0) emitEvent('erp:cash-updated');

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
   * — retira de Caja General en el momento real en que sale el dinero,
   * usando el registro histórico (SupplierPayment) para trazabilidad.
   */
  async payOrder(orderId: string, userId: string, amount: number, method: string, reference?: string, notes?: string) {
    if (amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
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
      await tx.supplierPayment.create({
        data: { purchaseOrderId: orderId, userId, amount, method: method as never, reference, notes },
      });
      await this.applyPurchasePayment(
        tx, orderId, Number(order.totalAmount), amount, method, userId,
        `Pago a proveedor: OC ${order.orderNumber}`,
      );
    });

    emitEvent('erp:cash-updated');
    return this.getOrder(orderId);
  }
}

export const purchasesService = new PurchasesService();
