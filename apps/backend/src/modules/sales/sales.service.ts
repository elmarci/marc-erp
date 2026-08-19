import { PaymentMethod, DocumentType, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { emitEvent } from '../../config/socket';
import { getSettingValues } from '../../utils/settings';
import { couponsService } from '../coupons/coupons.service';
import { nowInLima } from '../../utils/timezone';

interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
  productName?: string;
}

interface BottleDepositItemInput {
  productId: string;
  quantity: number;
  paid: boolean;
  debtorLabel?: string;
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
  couponCode?: string;
  pointsToRedeem?: number;
  isOfflineSync?: boolean;
  offlineCreatedAt?: Date;
  bottleDeposits?: BottleDepositItemInput[];
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
  search?: string;
  paymentMethod?: PaymentMethod;
  documentType?: DocumentType;
  isCredit?: boolean;
  minTotal?: number;
  maxTotal?: number;
  sortBy?: 'createdAt' | 'totalAmount' | 'saleNumber';
  sortOrder?: 'asc' | 'desc';
}

function buildSalesOrderBy(sortBy?: ListSalesQuery['sortBy'], sortOrder?: ListSalesQuery['sortOrder']): Prisma.SaleOrderByWithRelationInput {
  const order = sortOrder ?? 'desc';
  if (sortBy === 'totalAmount') return { totalAmount: order };
  if (sortBy === 'saleNumber') return { saleNumber: order };
  return { createdAt: order };
}

function buildSalesWhere(query: Omit<ListSalesQuery, 'page' | 'limit' | 'sortBy' | 'sortOrder'>): Prisma.SaleWhereInput {
  const { cashSessionId, cashierId, customerId, dateFrom, dateTo, status, search, paymentMethod, documentType, isCredit, minTotal, maxTotal } = query;

  return {
    ...(cashSessionId ? { cashSessionId } : {}),
    ...(cashierId ? { cashierId } : {}),
    ...(customerId ? { customerId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(documentType ? { documentType } : {}),
    ...(isCredit !== undefined ? { isCredit } : {}),
    ...(paymentMethod ? { payments: { some: { method: paymentMethod } } } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...((minTotal !== undefined || maxTotal !== undefined)
      ? {
          totalAmount: {
            ...(minTotal !== undefined ? { gte: minTotal } : {}),
            ...(maxTotal !== undefined ? { lte: maxTotal } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { saleNumber: { contains: search, mode: 'insensitive' } },
            { documentNumber: { contains: search, mode: 'insensitive' } },
            { customer: { firstName: { contains: search, mode: 'insensitive' } } },
            { customer: { lastName: { contains: search, mode: 'insensitive' } } },
            { customer: { businessName: { contains: search, mode: 'insensitive' } } },
            { customer: { taxId: { contains: search, mode: 'insensitive' } } },
            { cashier: { firstName: { contains: search, mode: 'insensitive' } } },
            { cashier: { lastName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

export class SalesService {
  async create(input: CreateSaleInput) {
    // Verificar sesión de caja abierta — excepto al sincronizar una venta
    // hecha offline: para entonces el cajero pudo haber cerrado la caja sin
    // saber que esa venta seguía pendiente de subir, y bloquearla la dejaría
    // atascada en la cola para siempre. Ese caso queda fuera del arqueo de
    // esa sesión (limitación conocida y aceptada del modo offline).
    const cashSession = input.isOfflineSync
      ? await prisma.cashSession.findUnique({ where: { id: input.cashSessionId } })
      : await prisma.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } });
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

    // Verificar stock suficiente — al sincronizar una venta offline se deja
    // pasar igual aunque quede negativo (se pudo vender lo mismo en otra caja
    // mientras no había internet); se marca con una alerta de stock para que
    // alguien lo revise, en vez de perder la venta ya cobrada al cliente.
    for (const item of input.items) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.isMiscItem) continue; // no maneja stock — venta excepcional de algo fuera de catálogo
      if (Number(product.currentStock) < item.quantity && !input.isOfflineSync) {
        throw new BusinessError(
          `Stock insuficiente para "${product.name}". Disponible: ${product.currentStock}, solicitado: ${item.quantity}.`,
        );
      }
    }

    // Envases: sólo se puede cobrar/prestar garantía de un producto que
    // realmente está en esta venta y que de verdad maneja envase retornable.
    for (const bd of input.bottleDeposits ?? []) {
      const product = products.find((p) => p.id === bd.productId);
      if (!product || !input.items.some((i) => i.productId === bd.productId)) {
        throw new BusinessError('El envase debe corresponder a un producto que está en esta venta.');
      }
      if (Number(product.bottleDeposit) <= 0) {
        throw new BusinessError(`"${product.name}" no maneja garantía de envase.`);
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
        // Costo promedio de este producto en el momento exacto de la venta —
        // para poder calcular el margen real de esta venta después, aunque
        // el costo del producto siga cambiando con compras futuras.
        costPrice: Number(product.costPrice),
        productName: product.isMiscItem && item.productName ? item.productName : product.name,
        productBarcode: product.barcode,
      };
    });

    const saleDiscountAmt = input.discountAmount ?? (subtotal * (input.discountPercent ?? 0)) / 100;

    // Cupón de descuento (opcional): validar antes de tocar la BD. Se re-valida
    // dentro de la transacción al canjearlo para evitar una carrera con otra
    // venta que use el mismo código al mismo tiempo.
    let coupon: Awaited<ReturnType<typeof couponsService.validate>> | null = null;
    if (input.couponCode) {
      if (!input.customerId) {
        throw new BusinessError('Para canjear un cupón la venta debe tener un cliente asignado.');
      }
      coupon = await couponsService.validate(input.couponCode, input.customerId);
    }
    const couponDiscountAmt = coupon ? (subtotal * Number(coupon.discountPercent)) / 100 : 0;

    // Puntos de fidelización (opcional): excluyente con el cupón — un solo
    // mecanismo de descuento por venta para no acumular impacto en margen.
    const pointsToRedeem = input.pointsToRedeem ?? 0;
    if (pointsToRedeem > 0 && coupon) {
      throw new BusinessError('No se puede canjear puntos y un cupón en la misma venta.');
    }
    const loyaltyConfig = await getSettingValues(['loyalty_points_per_sol', 'loyalty_point_value']);
    const pointsPerSol = Number(loyaltyConfig['loyalty_points_per_sol'] ?? 1);
    const pointValue = Number(loyaltyConfig['loyalty_point_value'] ?? 0.03);

    let pointsDiscountAmt = 0;
    if (pointsToRedeem > 0) {
      if (!input.customerId) {
        throw new BusinessError('Para canjear puntos la venta debe tener un cliente asignado.');
      }
      const customerForPoints = await prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customerForPoints || customerForPoints.loyaltyPoints < pointsToRedeem) {
        throw new BusinessError('El cliente no tiene suficientes puntos disponibles.');
      }
      pointsDiscountAmt = Math.min(pointsToRedeem * pointValue, subtotal - saleDiscountAmt);
    }

    const discountedSubtotal = subtotal - saleDiscountAmt - couponDiscountAmt - pointsDiscountAmt;

    // Régimen Simple: sin IGV separado — precio de venta es precio final
    const taxAmount = 0;
    const totalAmount = discountedSubtotal;
    const pointsEarned = input.customerId ? Math.floor(totalAmount * pointsPerSol) : 0;

    // Config para generar un cupón nuevo si esta venta supera el mínimo
    const couponConfig = await getSettingValues([
      'coupon_min_sale_amount', 'coupon_discount_percent', 'coupon_validity_days',
    ]);
    const couponMinSale = Number(couponConfig['coupon_min_sale_amount'] ?? 100);
    const couponRewardPercent = Number(couponConfig['coupon_discount_percent'] ?? 10);
    const couponValidityDays = Number(couponConfig['coupon_validity_days'] ?? 30);

    // Verificar que los pagos cubren el total (excepto crédito)
    if (!input.isCredit) {
      const totalPaid = input.payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPaid < totalAmount - 0.01) {
        throw new BusinessError(
          `El monto pagado (S/ ${totalPaid.toFixed(2)}) es insuficiente para el total (S/ ${totalAmount.toFixed(2)}).`,
        );
      }
    }

    // El monto a crédito es solo la porción cuyo método de pago es CREDIT —
    // una venta puede ser parte al contado y parte fiada. paidAmount guarda
    // lo ya cobrado (todo lo no-crédito) y currentBalance del cliente solo
    // sube por la porción realmente fiada (no por el total de la venta).
    const creditPortion = input.payments.filter((p) => p.method === 'CREDIT').reduce((sum, p) => sum + p.amount, 0);
    const nonCreditPaid = input.payments.filter((p) => p.method !== 'CREDIT').reduce((sum, p) => sum + p.amount, 0);

    // Sin cliente no hay a quién cargarle la deuda — una venta fiada
    // "anónima" dejaría el monto sin registrar en ninguna cuenta por cobrar.
    if ((input.isCredit || creditPortion > 0) && !input.customerId) {
      throw new BusinessError('Una venta fiada debe tener un cliente asignado — sin cliente no hay a quién cargarle la deuda.');
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
          discountAmount: saleDiscountAmt + couponDiscountAmt + pointsDiscountAmt,
          discountPercent: input.discountPercent ?? 0,
          taxAmount,
          totalAmount,
          amountTendered: input.payments.reduce((sum, p) => sum + p.amount, 0),
          changeAmount: Math.max(
            0,
            input.payments.reduce((sum, p) => sum + p.amount, 0) - totalAmount,
          ),
          isCredit: input.isCredit ?? false,
          paidAmount: nonCreditPaid,
          pointsEarned,
          pointsRedeemed: pointsToRedeem,
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
        if (product.isMiscItem) continue; // no maneja stock

        const newStock = Number(product.currentStock) - item.quantity;

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

        // Actualizar alerta de stock (non-blocking — no debe interrumpir la venta)
        try {
          const alertType = newStock < 0 ? 'NEGATIVE_STOCK' : newStock === 0 ? 'OUT_OF_STOCK' : newStock <= Number(product.minStock) ? 'LOW_STOCK' : null;
          if (alertType) {
            const existing = await tx.stockAlert.findFirst({
              where: { productId: item.productId, alertType },
            });
            if (existing) {
              await tx.stockAlert.update({
                where: { id: existing.id },
                data: { isActive: true, resolvedAt: null },
              });
            } else {
              await tx.stockAlert.create({
                data: { productId: item.productId, alertType, threshold: Math.round(Number(product.minStock)), isActive: true },
              });
            }
          }
        } catch (alertErr) {
          logger.warn({ err: alertErr, productId: item.productId }, 'Stock alert update failed (non-critical)');
        }
      }

      // Actualizar saldo de crédito y puntos de fidelización del cliente en
      // una sola operación. Si se canjean puntos, el where con `gte` evita
      // una carrera con otra venta que gaste los mismos puntos a la vez.
      if (input.customerId) {
        const customerUpdateData: Prisma.CustomerUpdateInput = {};
        if (creditPortion > 0) customerUpdateData.currentBalance = { increment: creditPortion };
        const pointsDelta = pointsEarned - pointsToRedeem;
        if (pointsDelta !== 0) customerUpdateData.loyaltyPoints = { increment: pointsDelta };

        if (pointsToRedeem > 0) {
          const result = await tx.customer.updateMany({
            where: { id: input.customerId, loyaltyPoints: { gte: pointsToRedeem } },
            data: customerUpdateData,
          });
          if (result.count !== 1) {
            throw new BusinessError('El cliente ya no tiene suficientes puntos disponibles. Intente sin canjear puntos.');
          }
        } else if (Object.keys(customerUpdateData).length > 0) {
          await tx.customer.update({ where: { id: input.customerId }, data: customerUpdateData });
        }
      }

      // Canjear el cupón — condicionado a que siga ACTIVE para evitar que dos
      // ventas concurrentes lo usen dos veces (carrera).
      if (coupon) {
        const redeemed = await tx.coupon.updateMany({
          where: { id: coupon.id, status: 'ACTIVE' },
          data: { status: 'REDEEMED', redeemedSaleId: newSale.id, redeemedAt: new Date() },
        });
        if (redeemed.count !== 1) {
          throw new BusinessError('El cupón acaba de ser canjeado en otra venta. Intente sin el cupón.');
        }
      }

      // Generar un cupón nuevo si esta venta (con cliente asignado) supera el
      // monto mínimo configurado — se imprime en el ticket para su próxima compra.
      let generatedCoupon = null;
      if (input.customerId && totalAmount >= couponMinSale && couponRewardPercent > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + couponValidityDays);
        generatedCoupon = await tx.coupon.create({
          data: {
            code: await couponsService.generateUniqueCode(),
            discountPercent: couponRewardPercent,
            customerId: input.customerId,
            sourceSaleId: newSale.id,
            expiresAt,
          },
        });
      }

      // Envases retornables — pasivo aparte de la venta (no es ingreso), pero
      // registrado en el mismo momento y ligado a esta venta y a este cliente
      // para saber después a quién devolverle el dinero (o sólo recibir el
      // envase de vuelta si nunca se cobró nada).
      for (const bd of input.bottleDeposits ?? []) {
        const product = products.find((p) => p.id === bd.productId)!;
        const amount = bd.paid ? bd.quantity * Number(product.bottleDeposit) : 0;

        await tx.bottleDepositMovement.create({
          data: {
            productId: bd.productId, type: 'CHARGED', quantity: bd.quantity, amount,
            method: 'CASH', cashSessionId: input.cashSessionId, userId: input.cashierId,
            customerId: input.customerId, debtorLabel: bd.debtorLabel?.trim() || undefined, saleId: newSale.id,
            notes: bd.paid ? undefined : 'Envase prestado sin cobrar garantía',
          },
        });

        if (amount > 0) {
          await tx.cashMovement.create({
            data: {
              cashSessionId: input.cashSessionId, type: 'DEPOSIT', amount,
              reason: `Garantía de envase — ${product.name} x${bd.quantity}`,
            },
          });
        }
      }

      return { ...newSale, generatedCoupon };
    });

    logger.info({ saleId: sale.id, total: totalAmount, cashierId: input.cashierId }, 'Sale completed');
    await redis.del('reports:dashboard').catch(() => {});
    // Notificar en tiempo real: venta creada
    emitEvent('erp:sale-created', { cashSessionId: input.cashSessionId });
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
        couponGenerated: true,
        couponRedeemed: true,
      },
    });

    if (!sale) throw new NotFoundError('Venta');
    return sale;
  }

  async list(query: ListSalesQuery) {
    const { page, limit, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;
    const where = buildSalesWhere(query);

    const [sales, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        include: {
          cashier: { select: { firstName: true, lastName: true } },
          customer: { select: { firstName: true, lastName: true, businessName: true } },
          payments: { select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
        orderBy: buildSalesOrderBy(sortBy, sortOrder),
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

  // Mismos filtros que list(), pero sin paginar — para exportar a Excel el
  // total de ventas que calzan con los filtros, no solo la página visible.
  async exportList(query: Omit<ListSalesQuery, 'page' | 'limit'>) {
    const where = buildSalesWhere(query);

    return prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { firstName: true, lastName: true } },
        customer: { select: { firstName: true, lastName: true, businessName: true } },
        payments: { select: { method: true, amount: true } },
        _count: { select: { items: true } },
      },
      orderBy: buildSalesOrderBy(query.sortBy, query.sortOrder),
    });
  }

  // KPIs resumidos para la barra de indicadores del listado — usa los mismos
  // filtros que list()/exportList() para que "lo que ves es lo que resume".
  async summary(query: Omit<ListSalesQuery, 'page' | 'limit' | 'sortBy' | 'sortOrder'>) {
    const where = buildSalesWhere(query);
    const completedWhere: Prisma.SaleWhereInput = { ...where, status: { in: ['COMPLETED', 'PARTIALLY_RETURNED'] } };

    const [agg, byPaymentMethod, byStatus, creditAgg] = await Promise.all([
      prisma.sale.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true, discountAmount: true },
        _count: { _all: true },
        _avg: { totalAmount: true },
      }),
      prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: completedWhere },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: { ...completedWhere, isCredit: true },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      total: Number(agg._sum.totalAmount ?? 0),
      count: agg._count._all,
      average: Number(agg._avg.totalAmount ?? 0),
      discounts: Number(agg._sum.discountAmount ?? 0),
      creditTotal: Number(creditAgg._sum.totalAmount ?? 0),
      creditCount: creditAgg._count._all,
      byPaymentMethod: byPaymentMethod.map((p) => ({
        method: p.method,
        total: Number(p._sum.amount ?? 0),
        count: p._count._all,
      })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
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

        const stockBefore = Number(product.currentStock);
        const newStock = stockBefore + Number(item.quantity);
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: newStock },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'RETURN_IN',
            quantity: Number(item.quantity),
            quantityBefore: stockBefore,
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

        const stockBefore = Number(product.currentStock);
        await tx.product.update({
          where: { id: retItem.productId },
          data: { currentStock: { increment: retItem.quantity } },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: retItem.productId,
            type: 'RETURN_IN',
            quantity: retItem.quantity,
            quantityBefore: stockBefore,
            quantityAfter: stockBefore + Number(retItem.quantity),
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

  // Lista de cajeros con al menos una venta registrada — para poblar el filtro
  // sin exponer el listado completo de usuarios (esa ruta es solo admin).
  async listCashiers() {
    return prisma.user.findMany({
      where: { salesAsCashier: { some: {} } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  private async generateSaleNumber(): Promise<string> {
    // Fecha de Lima explícita, no la del proceso Node (en producción corre en
    // UTC) — si no, el correlativo del día cambia ~5h antes/después de la
    // medianoche real de Lima.
    const { year, month, day } = nowInLima();
    const prefix = `V${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;

    const lastSale = await prisma.sale.findFirst({
      where: { saleNumber: { startsWith: prefix } },
      orderBy: { saleNumber: 'desc' },
    });

    const lastNum = lastSale ? parseInt(lastSale.saleNumber.slice(-5)) : 0;
    return `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
  }
}

export const salesService = new SalesService();
