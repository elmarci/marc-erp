import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import type { Prisma } from '@prisma/client';

export type TreasuryAccount = 'CASH' | 'YAPE' | 'PLIN';

// Los gastos/movimientos con un método distinto a Yape o Plin salen de la
// cuenta de efectivo por defecto — solo esas dos billeteras tienen cuenta
// propia dentro de Caja General.
export function methodToAccount(method?: string): TreasuryAccount {
  return method === 'YAPE' || method === 'PLIN' ? method : 'CASH';
}

export interface CreateExpenseInput {
  category: string;
  description: string;
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
  expenseDate?: Date;
  userId: string;
  // Si se paga en efectivo (method === 'CASH') y se indica una sesión de caja
  // abierta, el dinero sale físicamente de ese cajón (afecta su arqueo del
  // día) en vez de salir directo de Caja General — mismo criterio que el
  // pago de una compra desde caja (ver applyPurchasePaymentLegs).
  cashSessionId?: string;
}

export interface CreateRecurringTemplateInput {
  category: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  userId: string;
}

export class TreasuryService {
  async getBalance(account: TreasuryAccount = 'CASH'): Promise<number> {
    const last = await prisma.treasuryMovement.findFirst({ where: { account }, orderBy: { createdAt: 'desc' } });
    return last ? Number(last.balanceAfter) : 0;
  }

  // Efectivo + Yape + Plin son cuentas independientes que suman al total del
  // negocio — nunca se mezclan entre sí (cada una tiene su propio kardex).
  async getBalances() {
    const [cash, yape, plin] = await Promise.all([
      this.getBalance('CASH'), this.getBalance('YAPE'), this.getBalance('PLIN'),
    ]);
    return { cash, yape, plin, total: cash + yape + plin };
  }

  // Movimiento genérico del fondo general — siempre dentro de una transacción
  // para que el balanceBefore leído sea consistente con lo que se va a
  // escribir (mismo patrón que el kardex de costos de Compras).
  private async recordMovement(
    tx: Prisma.TransactionClient,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: number,
    description: string,
    userId: string,
    referenceType: string,
    referenceId?: string,
    account: TreasuryAccount = 'CASH',
  ) {
    const last = await tx.treasuryMovement.findFirst({ where: { account }, orderBy: { createdAt: 'desc' } });
    const balanceBefore = last ? Number(last.balanceAfter) : 0;
    const balanceAfter = type === 'DEPOSIT' ? balanceBefore + amount : balanceBefore - amount;
    return tx.treasuryMovement.create({
      data: { type, account, amount, balanceBefore, balanceAfter, description, userId, referenceType, referenceId },
    });
  }

  // Expuesto para que Caja (apertura/cierre de sesión) registre sus propios
  // movimientos dentro de la misma transacción que crea/cierra la sesión.
  async recordMovementInTx(
    tx: Prisma.TransactionClient,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: number,
    description: string,
    userId: string,
    referenceType: string,
    referenceId?: string,
    account: TreasuryAccount = 'CASH',
  ) {
    return this.recordMovement(tx, type, amount, description, userId, referenceType, referenceId, account);
  }

  async deposit(amount: number, description: string, userId: string, account: TreasuryAccount = 'CASH') {
    if (amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    return prisma.$transaction((tx) =>
      this.recordMovement(tx, 'DEPOSIT', amount, description, userId, 'MANUAL', undefined, account),
    );
  }

  async listMovements(filters: {
    page: number;
    limit: number;
    type?: string;
    account?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.type) where['type'] = filters.type;
    if (filters.account) where['account'] = filters.account;
    if (filters.dateFrom || filters.dateTo) {
      where['createdAt'] = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }

    const [data, total] = await Promise.all([
      prisma.treasuryMovement.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.treasuryMovement.count({ where }),
    ]);

    return {
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /* ── Gastos ───────────────────────────────────────────────────────────── */

  async createExpense(input: CreateExpenseInput) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    // Efectivo + sesión de caja abierta → el retiro sale del cajón físico de
    // esa caja (queda en su arqueo); cualquier otro caso sale directo de
    // Caja General, en la cuenta que corresponda al método.
    const isPhysicalCash = !input.method || input.method === 'CASH';

    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          category: input.category as never,
          description: input.description,
          amount: input.amount,
          method: (input.method ?? 'CASH') as never,
          reference: input.reference,
          notes: input.notes,
          expenseDate: input.expenseDate ?? new Date(),
          userId: input.userId,
        },
      });

      const cashSession = isPhysicalCash && input.cashSessionId
        ? await tx.cashSession.findFirst({ where: { id: input.cashSessionId, status: 'OPEN' } })
        : null;

      if (cashSession) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: cashSession.id, type: 'WITHDRAWAL', amount: input.amount,
            reason: `Gasto: ${input.description}`, referenceType: 'EXPENSE', referenceId: expense.id,
          },
        });
      } else {
        await this.recordMovement(
          tx, 'WITHDRAWAL', input.amount, `Gasto: ${input.description}`, input.userId, 'EXPENSE', expense.id,
          methodToAccount(input.method),
        );
      }
      return expense;
    });
  }

  async listExpenses(filters: {
    page: number;
    limit: number;
    category?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.category) where['category'] = filters.category;
    if (filters.dateFrom || filters.dateTo) {
      where['expenseDate'] = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } }, template: { select: { id: true, description: true } } },
        orderBy: { expenseDate: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  async getExpensesSummary(dateFrom: Date, dateTo: Date) {
    const rows = await prisma.expense.groupBy({
      by: ['category'],
      where: { expenseDate: { gte: dateFrom, lte: dateTo } },
      _sum: { amount: true },
      _count: true,
    });
    const total = rows.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    return {
      total,
      byCategory: rows.map((r) => ({ category: r.category, total: Number(r._sum.amount ?? 0), count: r._count })),
    };
  }

  /* ── Plantillas de gasto recurrente ───────────────────────────────────── */

  async listRecurringTemplates() {
    return prisma.recurringExpenseTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createRecurringTemplate(input: CreateRecurringTemplateInput) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
      throw new BusinessError('El día del mes debe estar entre 1 y 28 (para que exista en todos los meses).');
    }
    return prisma.recurringExpenseTemplate.create({
      data: {
        category: input.category as never,
        description: input.description,
        amount: input.amount,
        dayOfMonth: input.dayOfMonth,
        userId: input.userId,
      },
    });
  }

  async updateRecurringTemplate(
    id: string,
    input: Partial<{ description: string; amount: number; dayOfMonth: number; isActive: boolean }>,
  ) {
    const tpl = await prisma.recurringExpenseTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundError('Plantilla de gasto recurrente');
    if (input.dayOfMonth !== undefined && (input.dayOfMonth < 1 || input.dayOfMonth > 28)) {
      throw new BusinessError('El día del mes debe estar entre 1 y 28.');
    }
    return prisma.recurringExpenseTemplate.update({ where: { id }, data: input });
  }

  async deleteRecurringTemplate(id: string) {
    const tpl = await prisma.recurringExpenseTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundError('Plantilla de gasto recurrente');
    await prisma.recurringExpenseTemplate.delete({ where: { id } });
  }

  // Genera automáticamente los gastos recurrentes que ya tocan este mes y
  // todavía no se generaron. Se llama al iniciar el servidor y cada pocas
  // horas (ver server.ts) — no depende de un cron externo ni de que alguien
  // entre a la pantalla de Gastos para "activarse".
  async processRecurringExpenses() {
    const [{ period, day }] = await prisma.$queryRawUnsafe<Array<{ period: string; day: number }>>(
      `SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Lima', 'YYYY-MM') as period,
              EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/Lima')::int as day`,
    );

    const templates = await prisma.recurringExpenseTemplate.findMany({ where: { isActive: true } });
    for (const tpl of templates) {
      if (tpl.lastGeneratedPeriod === period) continue;
      if (day < tpl.dayOfMonth) continue;

      await prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            category: tpl.category,
            description: tpl.description,
            amount: tpl.amount,
            expenseDate: new Date(),
            templateId: tpl.id,
            userId: tpl.userId,
            notes: 'Generado automáticamente (gasto recurrente).',
          },
        });
        await this.recordMovement(
          tx, 'WITHDRAWAL', Number(tpl.amount), `Gasto recurrente: ${tpl.description}`, tpl.userId, 'EXPENSE', expense.id,
        );
        await tx.recurringExpenseTemplate.update({ where: { id: tpl.id }, data: { lastGeneratedPeriod: period } });
      });
    }
  }
}

export const treasuryService = new TreasuryService();
