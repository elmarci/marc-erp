import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';

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
    if (['RECEIVED', 'CANCELLED'].includes(order.status)) {
      throw new BusinessError('No se puede cancelar una orden recibida o ya cancelada.');
    }
    return prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async receiveOrder(
    orderId: string,
    userId: string,
    items: Array<{ productId: string; receivedQty: number; unitCost: number; batchNumber?: string; expiryDate?: Date }>,
    notes?: string,
  ) {
    const order = await this.getOrder(orderId);
    if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new BusinessError('Solo se puede recibir mercadería en órdenes aprobadas o enviadas.');
    }

    // Create receipt + update inventory in a transaction
    return prisma.$transaction(async (tx) => {
      // Create receipt record
      const receipt = await tx.purchaseReceipt.create({
        data: {
          purchaseOrderId: orderId,
          notes,
          items: {
            create: items.map(i => ({
              productId: i.productId,
              orderedQty: order.items.find(oi => oi.productId === i.productId)?.orderedQty ?? 0,
              receivedQty: i.receivedQty,
              unitCost: i.unitCost,
              batchNumber: i.batchNumber,
              expiryDate: i.expiryDate,
            })),
          },
        },
      });

      // Update products stock and cost + inventory movements
      for (const item of items) {
        if (item.receivedQty <= 0) continue;

        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        // Update stock and cost price
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.receivedQty },
            costPrice: item.unitCost, // Update to latest cost
          },
        });

        // Record inventory movement
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE_IN',
            quantity: item.receivedQty,
            quantityBefore: product.currentStock,
            quantityAfter: product.currentStock + item.receivedQty,
            unitCost: item.unitCost,
            referenceType: 'PURCHASE',
            referenceId: orderId,
            userId,
            notes: `Recepción OC ${order.orderNumber}`,
          },
        });

        // Update ordered qty received in purchase order items
        await tx.purchaseOrderItem.updateMany({
          where: { purchaseOrderId: orderId, productId: item.productId },
          data: { receivedQty: { increment: item.receivedQty } },
        });

        // El precio recibido y confirmado es más confiable que el cotizado
        // al crear la orden — actualiza el catálogo del proveedor con este.
        await tx.supplierProduct.upsert({
          where: { supplierId_productId: { supplierId: order.supplierId, productId: item.productId } },
          create: { supplierId: order.supplierId, productId: item.productId, price: item.unitCost, lastPurchaseAt: new Date() },
          update: { price: item.unitCost, lastPurchaseAt: new Date() },
        });
      }

      // Determine new order status
      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: orderId } });
      const allReceived = updatedItems.every(i => i.receivedQty >= i.orderedQty);
      const anyReceived = updatedItems.some(i => i.receivedQty > 0);
      const newStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : order.status;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: newStatus, receivedDate: allReceived ? new Date() : undefined },
      });

      return receipt;
    });
  }
}

export const purchasesService = new PurchasesService();
