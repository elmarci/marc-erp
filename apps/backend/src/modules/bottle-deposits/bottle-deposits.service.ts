import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { treasuryService, methodToAccount } from '../treasury/treasury.service';
import { emitEvent } from '../../config/socket';

export interface DepositMoveInput {
  productId: string;
  quantity: number;
  method: string;
  cashSessionId?: string;
  userId: string;
  notes?: string;
}

export class BottleDepositsService {
  /** Productos con garantía de envase configurada + saldo pendiente de cada uno. */
  async listOutstanding() {
    const products = await prisma.product.findMany({
      where: { bottleDeposit: { gt: 0 }, deletedAt: null },
      select: { id: true, name: true, barcode: true, bottleDeposit: true },
      orderBy: { name: 'asc' },
    });

    const movements = await prisma.bottleDepositMovement.groupBy({
      by: ['productId', 'type'],
      _sum: { quantity: true, amount: true },
    });

    const byProduct = new Map<string, { charged: number; returned: number; chargedAmount: number; returnedAmount: number }>();
    for (const m of movements) {
      const entry = byProduct.get(m.productId) ?? { charged: 0, returned: 0, chargedAmount: 0, returnedAmount: 0 };
      if (m.type === 'CHARGED') { entry.charged += m._sum.quantity ?? 0; entry.chargedAmount += Number(m._sum.amount ?? 0); }
      else { entry.returned += m._sum.quantity ?? 0; entry.returnedAmount += Number(m._sum.amount ?? 0); }
      byProduct.set(m.productId, entry);
    }

    const data = products.map(p => {
      const e = byProduct.get(p.id) ?? { charged: 0, returned: 0, chargedAmount: 0, returnedAmount: 0 };
      return {
        productId: p.id,
        name: p.name,
        barcode: p.barcode,
        depositAmount: Number(p.bottleDeposit),
        outstandingQty: e.charged - e.returned,
        outstandingAmount: e.chargedAmount - e.returnedAmount,
      };
    });

    return {
      data,
      totals: {
        outstandingQty: data.reduce((s, d) => s + d.outstandingQty, 0),
        outstandingAmount: data.reduce((s, d) => s + d.outstandingAmount, 0),
      },
    };
  }

  async listMovements(filters: { productId?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.productId) where['productId'] = filters.productId;

    const [data, total] = await Promise.all([
      prisma.bottleDepositMovement.findMany({
        where,
        include: {
          product: { select: { name: true, barcode: true } },
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.bottleDepositMovement.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  private async getOutstandingQty(productId: string): Promise<number> {
    const rows = await prisma.bottleDepositMovement.groupBy({
      by: ['type'],
      where: { productId },
      _sum: { quantity: true },
    });
    const charged = rows.find(r => r.type === 'CHARGED')?._sum.quantity ?? 0;
    const returned = rows.find(r => r.type === 'RETURNED')?._sum.quantity ?? 0;
    return charged - returned;
  }

  /**
   * Cobra la garantía por N envases — dinero real que entra a caja, pero NO
   * es venta: no toca stock ni margen, es un pasivo que se le debe al
   * cliente hasta que traiga la botella de vuelta.
   */
  async charge(input: DepositMoveInput) {
    if (input.quantity <= 0) throw new BusinessError('La cantidad debe ser mayor a 0.');

    const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');
    if (Number(product.bottleDeposit) <= 0) throw new BusinessError('Este producto no maneja garantía de envase.');

    const amount = input.quantity * Number(product.bottleDeposit);
    const description = `Garantía de envase — ${product.name} x${input.quantity}`;

    let cashSession = null;
    if (input.method === 'CASH' && input.cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bottleDepositMovement.create({
        data: {
          productId: input.productId, type: 'CHARGED', quantity: input.quantity, amount,
          method: input.method as never, cashSessionId: cashSession?.id, userId: input.userId, notes: input.notes,
        },
      });

      if (cashSession) {
        await tx.cashMovement.create({
          data: { cashSessionId: cashSession.id, type: 'DEPOSIT', amount, reason: description, notes: input.notes },
        });
      } else {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', amount, description, input.userId, 'BOTTLE_DEPOSIT', input.productId, methodToAccount(input.method),
        );
      }
    });

    if (!cashSession) emitEvent('erp:cash-updated');
    return { amount };
  }

  /**
   * Devuelve la garantía cuando el cliente trae la botella — sale de caja
   * (efectivo real al cliente) y reduce el pasivo pendiente.
   */
  async returnDeposit(input: DepositMoveInput) {
    if (input.quantity <= 0) throw new BusinessError('La cantidad debe ser mayor a 0.');

    const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Producto');

    const outstanding = await this.getOutstandingQty(input.productId);
    if (input.quantity > outstanding) {
      throw new BusinessError(`Solo hay ${outstanding} envase(s) pendiente(s) de este producto — no se puede devolver más de eso.`);
    }

    const amount = input.quantity * Number(product.bottleDeposit);
    const description = `Devolución de garantía — ${product.name} x${input.quantity}`;

    let cashSession = null;
    if (input.method === 'CASH' && input.cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bottleDepositMovement.create({
        data: {
          productId: input.productId, type: 'RETURNED', quantity: input.quantity, amount,
          method: input.method as never, cashSessionId: cashSession?.id, userId: input.userId, notes: input.notes,
        },
      });

      if (cashSession) {
        await tx.cashMovement.create({
          data: { cashSessionId: cashSession.id, type: 'WITHDRAWAL', amount, reason: description, notes: input.notes },
        });
      } else {
        await treasuryService.recordMovementInTx(
          tx, 'WITHDRAWAL', amount, description, input.userId, 'BOTTLE_DEPOSIT', input.productId, methodToAccount(input.method),
        );
      }
    });

    if (!cashSession) emitEvent('erp:cash-updated');
    return { amount };
  }
}

export const bottleDepositsService = new BottleDepositsService();
