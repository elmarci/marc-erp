import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { emitEvent } from '../../config/socket';
import { treasuryService } from '../treasury/treasury.service';

export class CashService {
  async openSession(
    cashRegisterId: string,
    userId: string,
    openingAmount: number,
    notes?: string,
    fromTreasury = false,
  ) {
    // Verificar no haya sesión abierta en esta caja
    const existing = await prisma.cashSession.findFirst({
      where: { cashRegisterId, status: 'OPEN' },
    });
    if (existing) {
      throw new BusinessError('Ya existe una sesión de caja abierta en esta caja. Ciérrela primero.');
    }

    const cashRegister = await prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, isActive: true },
    });
    if (!cashRegister) throw new NotFoundError('Caja registradora');

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({
        data: { cashRegisterId, userId, openingAmount, notes },
        include: {
          cashRegister: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });
      // El monto inicial sale de la Caja General — mismo dinero que se
      // depositó ahí al cerrar la sesión anterior, no efectivo "de la nada".
      if (fromTreasury && openingAmount > 0) {
        await treasuryService.recordMovementInTx(
          tx, 'WITHDRAWAL', openingAmount,
          `Apertura de caja: ${cashRegister.name}`, userId, 'CASH_SESSION_OPEN', created.id,
        );
      }
      return created;
    });
    emitEvent('erp:cash-updated');
    return session;
  }

  async closeSession(
    sessionId: string,
    closingAmount: number,
    notes?: string,
    toTreasury = false,
    digitalCounts: { method: 'YAPE' | 'PLIN'; countedAmount: number }[] = [],
  ) {
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, status: 'OPEN' },
      include: {
        cashRegister: true,
        sales: {
          where: { status: 'COMPLETED' },
          include: { payments: true },
        },
        movements: true,
      },
    });

    if (!session) throw new NotFoundError('Sesión de caja activa');

    const expectedForMethod = (method: string) => session.sales.reduce((sum, sale) => {
      const payments = sale.payments
        .filter((p) => p.method === method)
        .reduce((s, p) => s + Number(p.amount), 0);
      return sum + payments;
    }, 0);

    // Calcular total esperado
    const cashSales = expectedForMethod('CASH');

    const withdrawals = session.movements
      .filter((m) => m.type === 'WITHDRAWAL')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const deposits = session.movements
      .filter((m) => m.type === 'DEPOSIT')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const expectedAmount = Number(session.openingAmount) + cashSales + deposits - withdrawals;
    const difference = closingAmount - expectedAmount;

    // Cuadre de Yape/Plin — cada uno contra lo que realmente se vendió por
    // ese método en esta sesión (no contra efectivo, son cuentas separadas).
    const digitalReconciliations = digitalCounts.map((dc) => {
      const expected = expectedForMethod(dc.method);
      return { method: dc.method, expectedAmount: expected, countedAmount: dc.countedAmount, difference: dc.countedAmount - expected };
    });

    const closed = await prisma.$transaction(async (tx) => {
      await tx.cashSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', closingAmount, expectedAmount, difference, closedAt: new Date(), notes },
      });

      // El efectivo contado al cerrar se deposita en la Caja General — así
      // queda disponible para la próxima apertura o para pagar gastos.
      if (toTreasury && closingAmount > 0) {
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', closingAmount,
          `Cierre de caja: ${session.cashRegister.name}`, session.userId, 'CASH_SESSION_CLOSE', sessionId, 'CASH',
        );
      }

      // El dinero de Yape/Plin ya está acreditado desde el momento de la
      // venta (no es billete físico que el cajero pueda dejar en el cajón),
      // así que el monto confirmado se deposita siempre, sin checkbox.
      for (const r of digitalReconciliations) {
        await tx.cashSessionReconciliation.create({
          data: {
            cashSessionId: sessionId,
            method: r.method,
            expectedAmount: r.expectedAmount,
            countedAmount: r.countedAmount,
            difference: r.difference,
          },
        });
        if (r.countedAmount > 0) {
          await treasuryService.recordMovementInTx(
            tx, 'DEPOSIT', r.countedAmount,
            `Cierre de caja (${r.method}): ${session.cashRegister.name}`, session.userId, 'CASH_SESSION_CLOSE', sessionId, r.method,
          );
        }
      }

      return tx.cashSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: {
          cashRegister: true,
          user: { select: { firstName: true, lastName: true } },
          sales: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
          movements: true,
          reconciliations: true,
        },
      });
    });
    emitEvent('erp:cash-updated');
    return closed;
  }

  async getSession(sessionId: string) {
    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        cashRegister: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        sales: {
          include: {
            payments: true,
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        movements: true,
        reconciliations: true,
      },
    });

    if (!session) throw new NotFoundError('Sesión de caja');
    return session;
  }

  async getOpenSession(cashRegisterId: string) {
    const session = await prisma.cashSession.findFirst({
      where: { cashRegisterId, status: 'OPEN' },
      include: {
        cashRegister: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { sales: true } },
      },
    });
    return session;
  }

  async addMovement(
    sessionId: string,
    type: 'WITHDRAWAL' | 'DEPOSIT',
    amount: number,
    reason: string,
    userId: string,
    notes?: string,
  ) {
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, status: 'OPEN' },
      include: { cashRegister: true },
    });
    if (!session) throw new NotFoundError('Sesión de caja activa');

    if (amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    // Este efectivo entra o sale físicamente del cajón, así que Caja General
    // debe reflejarlo al instante (mismo criterio que fromTreasury/toTreasury
    // en apertura/cierre): un "Depósito" a la caja del día sale de Caja
    // General, un "Retiro" de la caja del día entra a Caja General.
    const movement = await prisma.$transaction(async (tx) => {
      const created = await tx.cashMovement.create({
        data: { cashSessionId: sessionId, type, amount, reason, notes },
      });
      await treasuryService.recordMovementInTx(
        tx,
        type === 'DEPOSIT' ? 'WITHDRAWAL' : 'DEPOSIT',
        amount,
        `${type === 'DEPOSIT' ? 'Depósito a' : 'Retiro de'} caja (${session.cashRegister.name}): ${reason}`,
        userId, 'CASH_SESSION_MOVEMENT', sessionId, 'CASH',
      );
      return created;
    });
    emitEvent('erp:cash-updated');
    return movement;
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.getSession(sessionId);

    const salesByMethod: Record<string, number> = {};
    let totalSales = 0;
    let totalTransactions = 0;

    for (const sale of session.sales) {
      if (sale.status === 'CANCELLED') continue;
      totalTransactions++;
      for (const payment of sale.payments) {
        const method = payment.method;
        salesByMethod[method] = (salesByMethod[method] ?? 0) + Number(payment.amount);
        totalSales += Number(payment.amount);
      }
    }

    const totalWithdrawals = session.movements
      .filter((m) => m.type === 'WITHDRAWAL')
      .reduce((s, m) => s + Number(m.amount), 0);

    const totalDeposits = session.movements
      .filter((m) => m.type === 'DEPOSIT')
      .reduce((s, m) => s + Number(m.amount), 0);

    // Desglose para que el arqueo diga qué fue cada movimiento en vez de un
    // "Depósito"/"Retiro" genérico — un cobro de deuda o un pago a proveedor
    // ya quedan marcados con su referenceType al crearse.
    const debtPayments = session.movements
      .filter((m) => m.type === 'DEPOSIT' && m.referenceType === 'DEBT_PAYMENT')
      .reduce((s, m) => s + Number(m.amount), 0);
    const otherDeposits = totalDeposits - debtPayments;

    const purchasePayments = session.movements
      .filter((m) => m.type === 'WITHDRAWAL' && m.referenceType === 'PURCHASE')
      .reduce((s, m) => s + Number(m.amount), 0);
    const otherWithdrawals = totalWithdrawals - purchasePayments;

    return {
      session: {
        id: session.id,
        cashRegister: session.cashRegister,
        cashier: session.user,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openingAmount: session.openingAmount,
        closingAmount: session.closingAmount,
        expectedAmount: session.expectedAmount,
        difference: session.difference,
      },
      reconciliations: session.reconciliations,
      summary: {
        totalTransactions,
        totalSales,
        salesByMethod,
        totalWithdrawals,
        totalDeposits,
        debtPayments,
        otherDeposits,
        purchasePayments,
        otherWithdrawals,
        netCash: Number(session.openingAmount) + (salesByMethod['CASH'] ?? 0) + totalDeposits - totalWithdrawals,
      },
    };
  }

  async listRegisters() {
    return prisma.cashRegister.findMany({
      where: { isActive: true },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: {
            user: { select: { firstName: true, lastName: true } },
            _count: { select: { sales: true, movements: true } },
          },
          take: 1,
        },
      },
    });
  }

  async listSessions(filters: { status?: string; cashRegisterId?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.cashRegisterId) where['cashRegisterId'] = filters.cashRegisterId;

    const [data, total] = await Promise.all([
      prisma.cashSession.findMany({
        where,
        include: {
          cashRegister: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { sales: true, movements: true } },
        },
        orderBy: { openedAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.cashSession.count({ where }),
    ]);

    return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
  }

  // Mismos filtros que listSessions(), sin paginar — para exportar a Excel.
  async exportSessions(filters: { status?: string; cashRegisterId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.cashRegisterId) where['cashRegisterId'] = filters.cashRegisterId;

    return prisma.cashSession.findMany({
      where,
      include: {
        cashRegister: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { sales: true, movements: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async getSessionMovements(sessionId: string) {
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Sesión de caja');

    return prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSessionSales(sessionId: string) {
    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Sesión de caja');

    return prisma.sale.findMany({
      where: { cashSessionId: sessionId },
      include: {
        payments: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const cashService = new CashService();
