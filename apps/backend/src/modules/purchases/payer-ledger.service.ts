import { prisma } from '../../database/client';
import type { Prisma } from '@prisma/client';

// Kardex de deuda hacia un Pagador — mismo patrón que TreasuryService, pero
// keyed por payerId en vez de cuenta: CARGO cuando un pagador financia una
// compra (sube lo que le debemos), ABONO cuando se le repone dinero (baja lo
// que le debemos). balanceAfter del movimiento más reciente = saldo actual.
export class PayerLedgerService {
  async getBalance(payerId: string): Promise<number> {
    const last = await prisma.payerMovement.findFirst({ where: { payerId }, orderBy: { createdAt: 'desc' } });
    return last ? Number(last.balanceAfter) : 0;
  }

  async getBalances(payerIds: string[]): Promise<Map<string, number>> {
    if (payerIds.length === 0) return new Map();
    // Un solo movimiento más reciente por pagador — distinct + orderBy en vez
    // de N queries individuales.
    const latest = await prisma.payerMovement.findMany({
      where: { payerId: { in: payerIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['payerId'],
    });
    const map = new Map<string, number>();
    for (const m of latest) map.set(m.payerId, Number(m.balanceAfter));
    return map;
  }

  private async recordMovement(
    tx: Prisma.TransactionClient,
    payerId: string,
    type: 'CARGO' | 'ABONO',
    amount: number,
    description: string,
    userId: string,
    referenceType?: string,
    referenceId?: string,
  ) {
    const last = await tx.payerMovement.findFirst({ where: { payerId }, orderBy: { createdAt: 'desc' } });
    const balanceBefore = last ? Number(last.balanceAfter) : 0;
    const balanceAfter = type === 'CARGO' ? balanceBefore + amount : balanceBefore - amount;
    return tx.payerMovement.create({
      data: { payerId, type, amount, balanceBefore, balanceAfter, description, userId, referenceType, referenceId },
    });
  }

  async recordMovementInTx(
    tx: Prisma.TransactionClient,
    payerId: string,
    type: 'CARGO' | 'ABONO',
    amount: number,
    description: string,
    userId: string,
    referenceType?: string,
    referenceId?: string,
  ) {
    return this.recordMovement(tx, payerId, type, amount, description, userId, referenceType, referenceId);
  }
}

export const payerLedgerService = new PayerLedgerService();
