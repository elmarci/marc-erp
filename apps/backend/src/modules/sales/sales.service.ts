import { PaymentMethod, DocumentType, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { io } from '../../server';

interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
}

interface SalePaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  cardLast4?: string;
}

export interface CreateSaleInput {
  cashSessionId: string;
  cashierId: string;
  customerId?: string;
  documentType?: DocumentType;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  discountAmount?: number;
  discountPercent?: number;
  isCredit?: boolean;
  notes?: string;
}

export interface ReturnSaleInput {
  reason: string;
  refundMethod: PaymentMethod;
  items: { saleItemId: string; quantity: number }[];
  notes?: string;
}

export interface ListSalesQuery {
  page: number;
  limit: number;
  cashSessionId?: string;
  cashierId?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}

export class SalesService {
  async create(input: CreateSaleInput) {
    // Verificar sesión de caja abierta
    const cashSession = await prisma.cashSession.findFirst({
      where: { id: input.cashSessionId, status: 'OPEN' },
    });
    if (!cashSession) {
      throw new BusinessError('No hay una sesión de caja abierta. Abra la caja para procesar ventas.');
    }

    // Obtener productos con lock para concurrencia
    const productIds = input.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, status: 'ACTIVE' },
      include: { taxRate: true },
    });

    if (products.length !== productIds.length) {
      const found = products.map((p) => p.id);
      const missing = productIds.filter((id) => !found.includes(id));
      throw new BusinessError(`Productos no encontrados: ${missing.join(', ')}`);
    }

    // Verificar stock suficiente
    for (const item of input.items) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.currentStock < item.quantity) {
        throw new BusinessError(
          `Stock insuficiente para "${product.name}". Disponible: ${product.currentStock}, solicitado: ${item.quantity}.`,
        );
      }
    }

    // Calcular totales
    let subtotal = 0;
    const saleItems = input.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const unitPrice = item.unitPrice ?? Number(product.salePrice);
      const discountAmt = item.discountAmount ?? (unitPrice * (item.discountPercent ?? 0)) / 100;
      const effectivePrice = unitPrice - discountAmt;
      const itemSubtotal = effectivePrice * item.quantity;
      subtotal += itemSubtotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: effectivePrice,
        originalPrice: unitPrice,
        discountAmount: discountAmt,
        discountPercent: item.discountPercent ?? 0,
        taxRate: product.taxRate ? Number(product.taxRate.rate) : 0.18,
        subtotal: itemSubtotal,
        productName: product.name,
        productBarcode: product.barcode,
      };
    });

    const saleDiscountAmt = input.discountAmount ?? (subtotal * (input.discountPercent ?? 0)) / 100;
    const discountedSubtotal = subtotal - saleDiscountAmt;

    // Calcular IGV
    const taxAmount = saleItems.reduce((sum, item) => {
      const itemNet = item.subtotal * (1 - saleDiscountAmt / subtotal);
      return sum + itemNet - itemNet / (1 + item.taxRate);
    }, 0);

    const totalAmount = discountedSubtotal;

    // Verificar que los pagos cubren el total (excepto crédito)
    if (!input.isCredit) {
      const totalPaid = input.payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPaid < totalAmount - 0.01) {
        throw new BusinessError(
          `El monto pagado (S/ ${totalPaid.toFixed(2)}) es insuficiente para el total (S/ ${totalAmount.toFixed(2)}).`,
        );
      }
    }

    // Verificar crédito del cliente
    if (input.isCredit && input.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundError('Cliente');
      const available = Number(customer.creditLimit) - Number(customer.currentBalance);
      if (totalAmount > available) {
        throw new BusinessError(
          `Límite de crédito insuficiente. Disponible: S/ ${available.toFixed(2)}, requerido: S/ ${totalAmount.toFixed(2)}.`,
        );
      }
    }

    // Generar número de venta
    const saleNumber = await this.generateSaleNumber();

    // Procesar venta en transacción
    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          saleNumber,
          cashSessionId: input.cashSessionId,
          cashierId: input.cashierId,
          createdById: input.cashierId,
          customerId: input.customerId,
          documentType: input.documentType ?? 'TICKET',
          subtotal: subtotal,
          discountAmount: saleDiscountAmt,
          discountPercent: input.discountPercent ?? 0,
          taxAmount,
          totalAmount,
          amountTendered: input.payments.reduce((sum, p) => sum + p.amount, 0),
          changeAmount: Math.max(
            0,
            input.payments.reduce((sum, p) => sum + p.amount, 0) - totalAmount,
          ),
          isCredit: input.isCredit ?? false,
          notes: input.notes,
          items: {
            create: saleItems,
          },
          payments: {
            create: input.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              cardLast4: p.cardLast4,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true } } } },
          payments: true,
          customer: true,
          cashier: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // Reducir stock y registrar movimientos
      for (const item of saleItems) {
        const product = products.find((p) => p.id === item.productId)!;
        const newStock = product.currentStock - item.quantity;

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: newStock },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE_OUT',
            quantity: -Number(item.quantity),
            quantityBefore: product.currentStock,
            quantityAfter: newStock,
            unitCost: product.costPrice,
            referenceType: 'SALE',
            referenceId: newSale.id,
            userId: input.cashierId,
          },
        });

        // Actualizar alerta de stock
        if (newStock <= product.minStock && newStock > 0) {
          await tx.stockAlert.upsert({
            where: { productId_alertType: { productId: item.productId, alertType: 'LOW_STOCK' } } as never,
            create: { productId: item.productId, alertType: 'LOW_STOCK', threshold: product.minStock },
            update: { isActive: true, resolvedAt: null },
          } as never);
        } else if (newStock === 0) {
          await tx.stockAlert.upsert({
            where: { productId_alertType: { productId: item.productId, alertType: 'OUT_OF_STOCK' } } as never,
            create: { productId: item.productId, alertType: 'OUT_OF_STOCK' },
            update: { isActive: true, resolvedAt: null },
          } as never);
        }
      }

      // Actualizar saldo de crédito del cliente
      if (input.isCredit && input.customerId) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: { currentBalance: { increment: totalAmount } },
        });
      }

      return newSale;
    });

    logger.info({ saleId: sale.id, total: totalAmount, cashierId: input.cashierId }, 'Sale completed');
    await redis.del('reports:dashboard').catch(() => {});
    // Notificar en tiempo real: venta creada
    io.emit('erp:sale-created', { cashSessionId: input.cashSessionId });
    return sale;
  }

  async getById(id: string) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, barcode: true, imageUrl: true } },
          },
        },
        payments: true,
        customer: true,
        cashier: { select: { id: true, firstName: true, lastName: true } },
        returns: { include: { items: true } },
        cashSession: { include: { cashRegister: true } },
        documentSeries: true,
      },
    });

    if (!sale) throw new NotFoundError('Venta');
    return sale;
  }

  async list(query: ListSalesQuery) {
    const { page, limit, cashSessionId, cashierId, customerId, dateFrom, dateTo, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      ...(cashSessionId ? { cashSessionId } : {}),
      ...(cashierId ? { cashierId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const [sales, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        include: {
          cashier: { select: { firstName: true, lastName: true } },
          customer: { select: { firstName: true, lastName: true } },
          payments: { select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return {
      data: sales,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async void(id: string, reason: string, voidedById: string) {
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) throw new NotFoundError('Venta');
    if (sale.status === 'CANCELLED') throw new BusinessError('La venta ya fue anulada.');
    if (sale.status === 'RETURNED') throw new BusinessError('La venta ya fue devuelta completamente.');

    const hoursSince = (Date.now() - sale.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      throw new BusinessError('Solo se pueden anular ventas del mismo día (dentro de 24 horas).');
    }

    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          voidedAt: new Date(),
          voidedById,
          voidReason: reason,
        },
      });

      // Reintegrar stock
      for (const item of sale.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const newStock = product.currentStock + Number(item.quantity);
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: newStock },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'RETURN_IN',
            quantity: Number(item.quantity),
            quantityBefore: product.currentStock,
            quantityAfter: newStock,
            unitCost: product.costPrice,
            referenceType: 'SALE_VOID',
            referenceId: id,
            userId: voidedById,
            notes: `Anulación de venta ${sale.saleNumber}`,
          },
        });
      }

      // Revertir crédito si aplica
      if (sale.isCredit && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { currentBalance: { decrement: Number(sale.totalAmount) } },
        });
      }
    });

    // Invalidar caché del dashboard
    await redis.del('reports:dashboard').catch(() => {});
  }

  async processReturn(saleId: string, input: ReturnSaleInput, processedById: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, returns: { include: { items: true } } },
    });

    if (!sale) throw new NotFoundError('Venta');
    if (sale.status === 'CANCELLED') throw new BusinessError('No se puede devolver una venta anulada.');

    // Calcular cantidades ya devueltas
    const returnedQty: Record<string, number> = {};
    for (const ret of sale.returns) {
      for (const retItem of ret.items) {
        returnedQty[retItem.saleItemId] = (returnedQty[retItem.saleItemId] ?? 0) + Number(retItem.quantity);
      }
    }

    let totalRefund = 0;
    const returnItems: { saleItemId: string; quantity: number; refundAmount: number; productId: string }[] = [];

    for (const retInput of input.items) {
      const saleItem = sale.items.find((i) => i.id === retInput.saleItemId);
      if (!saleItem) throw new NotFoundError(`Ítem de venta ${retInput.saleItemId}`);

      const alreadyReturned = returnedQty[retInput.saleItemId] ?? 0;
      const available = Number(saleItem.quantity) - alreadyReturned;

      if (retInput.quantity > available) {
        throw new BusinessError(
          `Solo puede devolver ${available} unidades del producto "${saleItem.productName}".`,
        );
      }

      const refundAmount = (Number(saleItem.unitPrice) * retInput.quantity);
      totalRefund += refundAmount;

      returnItems.push({
        saleItemId: retInput.saleItemId,
        quantity: retInput.quantity,
        refundAmount,
        productId: saleItem.productId,
      });
    }

    const saleReturn = await prisma.$transaction(async (tx) => {
      const ret = await tx.saleReturn.create({
        data: {
          saleId,
          reason: input.reason,
          totalAmount: totalRefund,
          refundMethod: input.refundMethod,
          notes: input.notes,
          items: {
            create: returnItems.map(({ productId: _, ...item }) => item),
          },
        },
        include: { items: true },
      });

      // Reintegrar stock
      for (const retItem of returnItems) {
        const product = await tx.product.findUnique({ where: { id: retItem.productId } });
        if (!product) continue;

        await tx.product.update({
          where: { id: retItem.productId },
          data: { currentStock: { increment: retItem.quantity } },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: retItem.productId,
            type: 'RETURN_IN',
            quantity: retItem.quantity,
            quantityBefore: product.currentStock,
            quantityAfter: product.currentStock + retItem.quantity,
            unitCost: product.costPrice,
            referenceType: 'RETURN',
            referenceId: ret.id,
            userId: processedById,
          },
        });
      }

      // Actualizar estado de venta
      const totalOriginal = Number(sale.totalAmount);
      const totalReturnedBefore = sale.returns.reduce((s, r) => s + Number(r.totalAmount), 0);
      const totalReturnedNow = totalReturnedBefore + totalRefund;

      if (totalReturnedNow >= totalOriginal - 0.01) {
        await tx.sale.update({ where: { id: saleId }, data: { status: 'RETURNED' } });
      } else {
        await tx.sale.update({ where: { id: saleId }, data: { status: 'PARTIALLY_RETURNED' } });
      }

      return ret;
    });

    return saleReturn;
  }

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();
    const prefix = `V${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const lastSale = await prisma.sale.findFirst({
      where: { saleNumber: { startsWith: prefix } },
      orderBy: { saleNumber: 'desc' },
    });

    const lastNum = lastSale ? parseInt(lastSale.saleNumber.slice(-5)) : 0;
    return `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
  }
}

export const salesService = new SalesService();
