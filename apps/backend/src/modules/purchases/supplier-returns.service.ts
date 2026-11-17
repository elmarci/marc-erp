import type { Prisma, SupplierReturnSettlement } from '@prisma/client';
import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { round2, round4, weightedAverageCost } from '../../utils/costing';
import { normalizeDocNumber, normalizeSeries } from '../../utils/supplier-doc';
import { treasuryService, type TreasuryAccount } from '../treasury/treasury.service';
import { inventoryAlertsService } from '../inventory/inventory-alerts.service';
import { purchasesService } from './purchases.service';
import { emitEvent } from '../../config/socket';

export const SUPPLIER_RETURN_REASONS = [
  { code: 'EXPIRED', label: 'Vencido' },
  { code: 'DAMAGED', label: 'Dañado' },
  { code: 'WRONG_ITEM', label: 'Producto equivocado' },
  { code: 'OTHER', label: 'Otro' },
] as const;
const REASON_CODES = new Set<string>(SUPPLIER_RETURN_REASONS.map((r) => r.code));

export interface CreateSupplierReturnInput {
  purchaseOrderId: string;
  settlement: SupplierReturnSettlement;
  reasonCode: string;
  items: Array<{ productId: string; quantity: number }>;
  // Lo que reconoce el proveedor. Si no llega, se calcula al costo de la compra.
  amount?: number;
  refundAccount?: TreasuryAccount;
  docSeries?: string | null;
  docNumber?: string | null;
  docIssueDate?: Date | null;
  notes?: string | null;
}

/** Estado de pago de una compra según lo saldado. */
function paymentStatusFor(paid: number, total: number) {
  if (paid >= total - 0.009) return 'PAID' as const;
  return paid > 0.009 ? 'PARTIAL' as const : 'CREDIT' as const;
}

export class SupplierReturnsService {
  private async nextNumber(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.supplierReturn.findFirst({ orderBy: { returnNumber: 'desc' }, select: { returnNumber: true } });
    const n = last ? Number(last.returnNumber.replace(/\D/g, '')) + 1 : 1;
    return `DV-${String(n).padStart(6, '0')}`;
  }

  /**
   * Cuánto se puede devolver de cada producto de la compra: lo recibido
   * menos lo ya devuelto, con el costo unitario que se pagó (con IGV si
   * corresponde). Sirve para la pantalla y para validar.
   */
  async getReturnable(purchaseOrderId: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        items: { include: { product: { select: { id: true, name: true, currentStock: true } } } },
        supplierReturns: { where: { voidedAt: null }, include: { items: true } },
      },
    });
    if (!order) throw new NotFoundError('Orden de compra');
    const factor = await purchasesService.orderTaxFactor(order);

    const returned = new Map<string, number>();
    for (const r of order.supplierReturns) {
      for (const it of r.items) returned.set(it.productId, (returned.get(it.productId) ?? 0) + Number(it.quantity));
    }

    const byProduct = new Map<string, { productId: string; name: string; received: number; returned: number; available: number; unitCost: number; currentStock: number }>();
    for (const it of order.items) {
      const prev = byProduct.get(it.productId);
      const received = Number(it.receivedQty);
      const cost = it.isBonus ? 0 : Number(it.unitCost) * factor;
      if (prev) {
        // Varias líneas del mismo producto: costo promedio de lo recibido.
        const total = prev.received + received;
        prev.unitCost = total > 0 ? (prev.unitCost * prev.received + cost * received) / total : prev.unitCost;
        prev.received = total;
      } else {
        byProduct.set(it.productId, {
          productId: it.productId, name: it.product.name, received, returned: 0, available: 0,
          unitCost: cost, currentStock: Number(it.product.currentStock),
        });
      }
    }
    const lines = [...byProduct.values()].map((l) => {
      const ret = returned.get(l.productId) ?? 0;
      return { ...l, unitCost: round4(l.unitCost), returned: ret, available: Math.max(0, l.received - ret) };
    });
    return {
      order: {
        id: order.id, orderNumber: order.orderNumber, status: order.status, voidedAt: order.voidedAt,
        outstanding: round2(Number(order.totalAmount) - Number(order.paidAmount)),
      },
      lines,
    };
  }

  async create(userId: string, input: CreateSupplierReturnInput) {
    if (!REASON_CODES.has(input.reasonCode)) throw new BusinessError('Elige el motivo de la devolución.');
    const items = input.items.filter((i) => i.quantity > 0);
    if (items.length === 0) throw new BusinessError('Indica qué productos devuelves y cuántos.');

    const { order, lines } = await this.getReturnable(input.purchaseOrderId);
    if (order.voidedAt) throw new BusinessError('Esta compra está anulada.');
    if (!['RECEIVED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
      throw new BusinessError('Solo se puede devolver mercadería de una compra ya recibida.');
    }
    const lineById = new Map(lines.map((l) => [l.productId, l]));
    let computed = 0;
    for (const it of items) {
      const line = lineById.get(it.productId);
      if (!line) throw new BusinessError('Uno de los productos no es de esta compra.');
      if (it.quantity > line.available + 0.0005) {
        throw new BusinessError(`De ${line.name} solo puedes devolver ${line.available} (lo recibido menos lo ya devuelto).`);
      }
      computed += it.quantity * line.unitCost;
    }

    const settlement = input.settlement;
    const amount = settlement === 'REPLACEMENT' ? 0 : round2(input.amount ?? computed);
    if (settlement !== 'REPLACEMENT' && amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (settlement === 'CREDIT_NOTE' && amount > order.outstanding + 0.009) {
      throw new BusinessError(
        `La nota de crédito (S/ ${amount.toFixed(2)}) es mayor a lo que aún se debe de esta compra `
        + `(S/ ${order.outstanding.toFixed(2)}). Si el proveedor te devolvió dinero, elige "Devolución de dinero".`,
      );
    }
    if (settlement === 'REFUND' && !input.refundAccount) throw new BusinessError('Indica a qué cuenta entró el dinero.');

    const full = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: input.purchaseOrderId },
      include: { supplier: { select: { businessName: true } } },
    });

    const created = await prisma.$transaction(async (tx) => {
      const ret = await tx.supplierReturn.create({
        data: {
          returnNumber: await this.nextNumber(tx),
          supplierId: full.supplierId,
          purchaseOrderId: full.id,
          settlement,
          reasonCode: input.reasonCode,
          amount,
          refundAccount: settlement === 'REFUND' ? input.refundAccount : null,
          docSeries: normalizeSeries(input.docSeries),
          docNumber: normalizeDocNumber(input.docNumber),
          docIssueDate: input.docIssueDate ?? null,
          notes: input.notes ?? null,
          userId,
        },
      });

      for (const it of items) {
        // En un cambio de producto el stock no varía: sale lo malo y entra lo bueno.
        let unitCost = lineById.get(it.productId)!.unitCost;
        if (settlement !== 'REPLACEMENT') {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${it.productId} FOR UPDATE`;
          const product = await tx.product.findUniqueOrThrow({ where: { id: it.productId } });
          const before = Number(product.currentStock);
          if (it.quantity > before + 0.0005) {
            throw new BusinessError(`No hay suficiente stock de ${product.name} para devolver (${before} en el sistema).`);
          }
          // Sale al costo promedio actual, así el costo de lo que queda no cambia.
          unitCost = Number(product.costPrice);
          const after = before - it.quantity;
          await tx.product.update({ where: { id: it.productId }, data: { currentStock: after } });
          await tx.inventoryMovement.create({
            data: {
              productId: it.productId, type: 'SUPPLIER_RETURN', quantity: -it.quantity,
              quantityBefore: before, quantityAfter: after, unitCost,
              avgCostBefore: unitCost, avgCostAfter: unitCost,
              referenceType: 'SUPPLIER_RETURN', referenceId: ret.id, userId,
              reasonCode: input.reasonCode,
              notes: `Devolución ${ret.returnNumber} a ${full.supplier.businessName} (OC ${full.orderNumber})`,
            },
          });
          await inventoryAlertsService.consumeBatchesFefo(tx, it.productId, it.quantity);
        }
        await tx.supplierReturnItem.create({
          data: { returnId: ret.id, productId: it.productId, quantity: it.quantity, unitCost },
        });
      }

      if (settlement === 'CREDIT_NOTE') {
        const paid = Number(full.paidAmount) + amount;
        await tx.purchaseOrder.update({
          where: { id: full.id },
          data: {
            paidAmount: paid,
            creditedAmount: Number(full.creditedAmount) + amount,
            paymentStatus: paymentStatusFor(paid, Number(full.totalAmount)),
          },
        });
      } else if (settlement === 'REFUND') {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', amount,
          `Devolución de dinero del proveedor: ${ret.returnNumber} — ${full.supplier.businessName}`,
          userId, 'SUPPLIER_RETURN', ret.id, input.refundAccount!,
        );
      }
      return ret;
    });

    if (settlement === 'REFUND') emitEvent('erp:cash-updated');
    return prisma.supplierReturn.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
  }

  /** Deja sin efecto una devolución: el stock vuelve y se deshace la nota o el reembolso. */
  async void(id: string, userId: string, reason: string) {
    const ret = await prisma.supplierReturn.findUnique({
      where: { id },
      include: { items: true, purchaseOrder: { include: { supplier: { select: { businessName: true } } } } },
    });
    if (!ret) throw new NotFoundError('Devolución');
    if (ret.voidedAt) throw new BusinessError('Esta devolución ya fue anulada.');
    const order = ret.purchaseOrder;
    const amount = Number(ret.amount);

    if (ret.settlement === 'REFUND') {
      const balance = await treasuryService.getBalance(ret.refundAccount ?? 'CASH');
      if (balance < amount - 0.009) {
        throw new BusinessError('No hay saldo suficiente en Caja General para devolver ese dinero.');
      }
    }

    await prisma.$transaction(async (tx) => {
      if (ret.settlement !== 'REPLACEMENT') {
        for (const it of ret.items) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${it.productId} FOR UPDATE`;
          const product = await tx.product.findUniqueOrThrow({ where: { id: it.productId } });
          const before = Number(product.currentStock);
          const qty = Number(it.quantity);
          const avgBefore = Number(product.costPrice);
          const avgAfter = weightedAverageCost(before, avgBefore, qty, Number(it.unitCost));
          await tx.product.update({ where: { id: it.productId }, data: { currentStock: before + qty, costPrice: avgAfter } });
          await tx.inventoryMovement.create({
            data: {
              productId: it.productId, type: 'SUPPLIER_RETURN_VOID', quantity: qty,
              quantityBefore: before, quantityAfter: before + qty, unitCost: it.unitCost,
              avgCostBefore: avgBefore, avgCostAfter: avgAfter,
              referenceType: 'SUPPLIER_RETURN', referenceId: ret.id, userId,
              notes: `Anulación de devolución ${ret.returnNumber} — ${reason}`,
            },
          });
          await inventoryAlertsService.restoreBatchesOnVoid(tx, it.productId, qty);
        }
      }

      if (ret.settlement === 'CREDIT_NOTE') {
        const fresh = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
        const paid = Math.max(0, Number(fresh.paidAmount) - amount);
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: {
            paidAmount: paid,
            creditedAmount: Math.max(0, Number(fresh.creditedAmount) - amount),
            paymentStatus: paymentStatusFor(paid, Number(fresh.totalAmount)),
          },
        });
      } else if (ret.settlement === 'REFUND') {
        await treasuryService.recordMovementInTx(
          tx, 'WITHDRAWAL', amount,
          `Anulación de devolución del proveedor: ${ret.returnNumber} — ${order.supplier.businessName}`,
          userId, 'SUPPLIER_RETURN_VOID', ret.id, ret.refundAccount ?? 'CASH',
        );
      }

      await tx.supplierReturn.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
      });
    });

    if (ret.settlement === 'REFUND') emitEvent('erp:cash-updated');
    return prisma.supplierReturn.findUniqueOrThrow({ where: { id } });
  }

  async list(filters: { supplierId?: string; dateFrom?: Date; dateTo?: Date; page: number; limit: number }) {
    const where: Prisma.SupplierReturnWhereInput = {
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.dateFrom || filters.dateTo ? {
        createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) },
      } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.supplierReturn.findMany({
        where,
        include: {
          supplier: { select: { businessName: true } },
          purchaseOrder: { select: { orderNumber: true, supplierInvoice: true } },
          items: { include: { product: { select: { name: true } } } },
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.supplierReturn.count({ where }),
    ]);
    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }
}

export const supplierReturnsService = new SupplierReturnsService();
