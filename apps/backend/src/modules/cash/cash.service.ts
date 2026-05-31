import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { io } from '../../server';

export class CashService {
  async openSession(cashRegisterId: string, userId: string, openingAmount: number, notes?: string) {
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

    const session = await prisma.cashSession.create({
      data: { cashRegisterId, userId, openingAmount, notes },
      include: {
        cashRegister: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    try { io?.emit('erp:cash-updated'); } catch { /* ignore */ }
    return session;
  }

  async closeSession(sessionId: string, closingAmount: number, notes?: string) {
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, status: 'OPEN' },
      include: {
        sales: {
          where: { status: 'COMPLETED' },
          include: { payments: true },
        },
        movements: true,
      },
    });

    if (!session) throw new NotFoundError('Sesión de caja activa');

    // Calcular total esperado
    const cashSales = session.sales.reduce((sum, sale) => {
      const cashPayments = sale.payments
        .filter((p) => p.method === 'CASH')
        .reduce((s, p) => s + Number(p.amount), 0);
      return sum + cashPayments;
    }, 0);

    const withdrawals = session.movements
      .filter((m) => m.type === 'WITHDRAWAL')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const deposits = session.movements
      .filter((m) => m.type === 'DEPOSIT')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const expectedAmount = Number(session.openingAmount) + cashSales + deposits - withdrawals;
    const difference = closingAmount - expectedAmount;

    const closed = await prisma.cashSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', closingAmount, expectedAmount, difference, closedAt: new Date(), notes },
      include: {
        cashRegister: true,
        user: { select: { firstName: true, lastName: true } },
        sales: { include: { payments: true }, orderBy: { createdAt: 'desc' } },
        movements: true,
      },
    });
    try { io?.emit('erp:cash-updated'); } catch { /* ignore */ }
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
    notes?: string,
  ) {
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundError('Sesión de caja activa');

    if (amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    return prisma.cashMovement.create({
      data: { cashSessionId: sessionId, type, amount, reason, notes },
    });
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
      summary: {
        totalTransactions,
        totalSales,
        salesByMethod,
        totalWithdrawals,
        totalDeposits,
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
