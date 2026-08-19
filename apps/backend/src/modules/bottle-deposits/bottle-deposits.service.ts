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
  customerId?: string;
  // charge(): si es false, se presta el envase sin cobrar nada (amount=0,
  // sigue quedando registrado como pendiente). Default true (comportamiento
  // de siempre). return(): monto explícito a devolver — si no se manda, se
  // usa el cálculo de siempre (cantidad × garantía del producto).
  paid?: boolean;
  amount?: number;
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

  /** Cuánto debe (en botellas y en plata) un cliente puntual de un producto puntual. */
  private async getOutstandingForCustomer(customerId: string, productId: string): Promise<{ qty: number; amount: number }> {
    const rows = await prisma.bottleDepositMovement.groupBy({
      by: ['type'],
      where: { customerId, productId },
      _sum: { quantity: true, amount: true },
    });
    const charged = rows.find(r => r.type === 'CHARGED');
    const returned = rows.find(r => r.type === 'RETURNED');
    return {
      qty: (charged?._sum.quantity ?? 0) - (returned?._sum.quantity ?? 0),
      amount: Number(charged?._sum.amount ?? 0) - Number(returned?._sum.amount ?? 0),
    };
  }

  /** Clientes con envases pendientes — para saber "quién me debe una botella". */
  async listOutstandingByCustomer() {
    const movements = await prisma.bottleDepositMovement.groupBy({
      by: ['customerId', 'productId', 'type'],
      where: { customerId: { not: null } },
      _sum: { quantity: true, amount: true },
    });

    const byKey = new Map<string, { customerId: string; productId: string; qty: number; amount: number }>();
    for (const m of movements) {
      const key = `${m.customerId}:${m.productId}`;
      const entry = byKey.get(key) ?? { customerId: m.customerId!, productId: m.productId, qty: 0, amount: 0 };
      const sign = m.type === 'CHARGED' ? 1 : -1;
      entry.qty += sign * (m._sum.quantity ?? 0);
      entry.amount += sign * Number(m._sum.amount ?? 0);
      byKey.set(key, entry);
    }

    const pending = [...byKey.values()].filter(e => e.qty > 0);
    if (pending.length === 0) return { data: [] };

    const [customers, products] = await Promise.all([
      prisma.customer.findMany({
        where: { id: { in: [...new Set(pending.map(p => p.customerId))] } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      }),
      prisma.product.findMany({
        where: { id: { in: [...new Set(pending.map(p => p.productId))] } },
        select: { id: true, name: true, barcode: true },
      }),
    ]);
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const productMap = new Map(products.map(p => [p.id, p]));

    const data = pending.map(p => ({
      customerId: p.customerId,
      customerName: customerMap.get(p.customerId)
        ? `${customerMap.get(p.customerId)!.firstName} ${customerMap.get(p.customerId)!.lastName ?? ''}`.trim()
        : 'Cliente eliminado',
      customerPhone: customerMap.get(p.customerId)?.phone ?? null,
      productId: p.productId,
      productName: productMap.get(p.productId)?.name ?? 'Producto eliminado',
      outstandingQty: p.qty,
      outstandingAmount: p.amount,
    })).sort((a, b) => a.customerName.localeCompare(b.customerName));

    return { data };
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

    const paid = input.paid ?? true;
    const amount = paid ? input.quantity * Number(product.bottleDeposit) : 0;
    const description = `Garantía de envase — ${product.name} x${input.quantity}`;

    let cashSession = null;
    if (paid && input.method === 'CASH' && input.cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bottleDepositMovement.create({
        data: {
          productId: input.productId, type: 'CHARGED', quantity: input.quantity, amount,
          method: input.method as never, cashSessionId: cashSession?.id, userId: input.userId,
          customerId: input.customerId, notes: input.notes ?? (paid ? undefined : 'Envase prestado sin cobrar garantía'),
        },
      });

      if (!paid) return;

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

    // Si viene un cliente puntual, el pendiente se valida contra SU saldo
    // (puede tener mezcla de envases pagados y prestados) — sin cliente se
    // sigue validando contra el total del producto, como antes.
    const outstanding = input.customerId
      ? await this.getOutstandingForCustomer(input.customerId, input.productId)
      : { qty: await this.getOutstandingQty(input.productId), amount: Infinity };
    if (input.quantity > outstanding.qty) {
      throw new BusinessError(`Solo hay ${outstanding.qty} envase(s) pendiente(s) — no se puede devolver más de eso.`);
    }

    // El monto a devolver lo decide el cajero (puede ser 0 si esos envases se
    // prestaron sin cobrar) — nunca más de lo que realmente se le debe.
    const requestedAmount = input.amount ?? input.quantity * Number(product.bottleDeposit);
    const amount = Math.min(requestedAmount, outstanding.amount);
    if (amount < 0) throw new BusinessError('El monto a devolver no puede ser negativo.');
    const description = `Devolución de garantía — ${product.name} x${input.quantity}`;

    let cashSession = null;
    if (amount > 0 && input.method === 'CASH' && input.cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bottleDepositMovement.create({
        data: {
          productId: input.productId, type: 'RETURNED', quantity: input.quantity, amount,
          method: input.method as never, cashSessionId: cashSession?.id, userId: input.userId,
          customerId: input.customerId, notes: input.notes,
        },
      });

      if (amount <= 0) return;

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
