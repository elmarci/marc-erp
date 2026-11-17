import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import type { Prisma } from '@prisma/client';
import {
  accrualDateFor, isValidRuc, limaPeriod, normalizeDocNumber, normalizeSeries,
} from '../../utils/supplier-doc';

export type TreasuryAccount = 'CASH' | 'YAPE' | 'PLIN';

// Los gastos/movimientos con un método distinto a Yape o Plin salen de la
// cuenta de efectivo por defecto — solo esas dos billeteras tienen cuenta
// propia dentro de Caja General.
export function methodToAccount(method?: string): TreasuryAccount {
  return method === 'YAPE' || method === 'PLIN' ? method : 'CASH';
}

export interface ExpenseDocFields {
  payeeName?: string | null;
  payeeTaxId?: string | null;
  docType?: string | null;
  docSeries?: string | null;
  docNumber?: string | null;
  receiptUrl?: string | null;
}

export interface CreateExpenseInput extends ExpenseDocFields {
  // categoryId es lo normal desde la Fase 2; category (el grupo fijo) se
  // acepta por compatibilidad y toma la primera categoría de ese grupo.
  categoryId?: string;
  category?: string;
  description: string;
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
  expenseDate?: Date;
  // Mes al que corresponde ("2026-10"); por defecto, el mes de expenseDate.
  period?: string;
  // Por pagar: se registra el gasto sin mover dinero (se paga después).
  isPending?: boolean;
  userId: string;
  // Si se paga en efectivo (method === 'CASH') y se indica una sesión de caja
  // abierta, el dinero sale físicamente de ese cajón (afecta su arqueo del
  // día) en vez de salir directo de Caja General — mismo criterio que el
  // pago de una compra desde caja (ver applyPurchasePaymentLegs).
  cashSessionId?: string;
}

export interface CreateRecurringTemplateInput {
  categoryId?: string;
  category?: string;
  payeeName?: string | null;
  description: string;
  amount: number;
  dayOfMonth: number;
  userId: string;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function cleanText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

function assertPayeeTaxId(v: string | null | undefined) {
  const t = cleanText(v);
  if (!t) return;
  if (/^\d{8}$/.test(t) || isValidRuc(t)) return;
  throw new BusinessError('El RUC no es válido: revisa los 11 dígitos (o usa un DNI de 8 dígitos).');
}

function docFields(input: ExpenseDocFields) {
  const out: Record<string, unknown> = {};
  if (input.payeeName !== undefined) out.payeeName = cleanText(input.payeeName);
  if (input.payeeTaxId !== undefined) { assertPayeeTaxId(input.payeeTaxId); out.payeeTaxId = cleanText(input.payeeTaxId); }
  if (input.docType !== undefined) out.docType = input.docType || null;
  if (input.docSeries !== undefined) out.docSeries = normalizeSeries(input.docSeries);
  if (input.docNumber !== undefined) out.docNumber = normalizeDocNumber(input.docNumber);
  if (input.receiptUrl !== undefined) out.receiptUrl = cleanText(input.receiptUrl);
  return out;
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

  /* ── Conciliación / arqueo de Caja General ───────────────────────────────
   * Compara el saldo que dice el sistema (última TreasuryMovement de esa
   * cuenta) contra el conteo físico del día — mismo criterio que el arqueo
   * de caja de turno (CashSessionReconciliation), pero a nivel de Caja
   * General. Si hay diferencia, se genera un TreasuryMovement de ajuste
   * para que el sistema quede igual al conteo (nunca se edita un saldo a
   * mano). */

  async recordReconciliation(input: {
    account: TreasuryAccount;
    countedAmount: number;
    notes?: string;
    userId: string;
    date?: Date;
  }) {
    const d = input.date ?? new Date();
    const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    return prisma.$transaction(async (tx) => {
      const last = await tx.treasuryMovement.findFirst({ where: { account: input.account }, orderBy: { createdAt: 'desc' } });
      const expectedAmount = last ? Number(last.balanceAfter) : 0;
      const difference = Math.round((input.countedAmount - expectedAmount) * 100) / 100;

      const reconciliation = await tx.treasuryReconciliation.upsert({
        where: { account_date: { account: input.account, date: dayKey } },
        create: {
          account: input.account, date: dayKey, expectedAmount, countedAmount: input.countedAmount,
          difference, notes: input.notes, userId: input.userId,
        },
        update: {
          expectedAmount, countedAmount: input.countedAmount, difference, notes: input.notes, userId: input.userId,
        },
      });

      if (Math.abs(difference) > 0.009) {
        await this.recordMovement(
          tx, difference > 0 ? 'DEPOSIT' : 'WITHDRAWAL', Math.abs(difference),
          `Ajuste por arqueo de Caja General (${input.account}) — ${dayKey.toLocaleDateString('es-PE')}`,
          input.userId, 'TREASURY_RECONCILIATION', reconciliation.id, input.account,
        );
      }

      return reconciliation;
    });
  }

  async listReconciliations(filters: { page: number; limit: number; account?: TreasuryAccount }) {
    const where: Record<string, unknown> = {};
    if (filters.account) where['account'] = filters.account;

    const [data, total] = await Promise.all([
      prisma.treasuryReconciliation.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { date: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.treasuryReconciliation.count({ where }),
    ]);

    return {
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /* ── Traspasos entre cuentas ──────────────────────────────────────────────
   * "Saco S/200 de Yape y los meto a Efectivo" — NO es un gasto ni un
   * ingreso, el dinero sigue siendo del negocio y solo cambia de formato.
   * Antes esto se registraba a mano como un Expense (categoría OTHER), lo
   * que inflaba "gastos" y descuadraba Caja General porque sólo se
   * registraba la salida, nunca la entrada al otro lado. Un traspaso real
   * mueve las dos patas dentro de la misma transacción. */

  async createTransfer(input: {
    fromAccount: TreasuryAccount;
    toAccount: TreasuryAccount;
    amount: number;
    notes?: string;
    userId: string;
  }) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (input.fromAccount === input.toAccount) {
      throw new BusinessError('La cuenta de origen y destino no pueden ser la misma.');
    }

    return prisma.$transaction(async (tx) => {
      const transfer = await tx.treasuryTransfer.create({
        data: {
          fromAccount: input.fromAccount, toAccount: input.toAccount, amount: input.amount,
          notes: input.notes, userId: input.userId,
        },
      });

      const description = input.notes
        ? `Traspaso ${input.fromAccount} → ${input.toAccount}: ${input.notes}`
        : `Traspaso ${input.fromAccount} → ${input.toAccount}`;

      await this.recordMovement(tx, 'WITHDRAWAL', input.amount, description, input.userId, 'TRANSFER', transfer.id, input.fromAccount);
      await this.recordMovement(tx, 'DEPOSIT', input.amount, description, input.userId, 'TRANSFER', transfer.id, input.toAccount);

      return transfer;
    });
  }

  async listTransfers(filters: { page: number; limit: number; account?: TreasuryAccount }) {
    const where: Record<string, unknown> = {};
    if (filters.account) where['OR'] = [{ fromAccount: filters.account }, { toAccount: filters.account }];

    const [data, total] = await Promise.all([
      prisma.treasuryTransfer.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.treasuryTransfer.count({ where }),
    ]);

    return {
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  /* ── Categorías de gasto ──────────────────────────────────────────── */

  async listExpenseCategories(includeInactive = false) {
    return prisma.expenseCategoryDef.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { expenses: true } } },
    });
  }

  async createExpenseCategory(input: { name: string; group: string }) {
    const name = input.name.trim();
    const exists = await prisma.expenseCategoryDef.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (exists) throw new BusinessError('Ya existe una categoría con ese nombre.');
    const last = await prisma.expenseCategoryDef.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return prisma.expenseCategoryDef.create({
      data: { name, group: input.group as never, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
  }

  // Cambiar el grupo también corrige los gastos ya registrados en esa
  // categoría, para que el estado de resultados quede parejo.
  async updateExpenseCategory(id: string, input: { name?: string; group?: string; isActive?: boolean }) {
    const cat = await prisma.expenseCategoryDef.findUnique({ where: { id } });
    if (!cat) throw new NotFoundError('Categoría de gasto');
    if (input.name) {
      const exists = await prisma.expenseCategoryDef.findFirst({
        where: { name: { equals: input.name.trim(), mode: 'insensitive' }, NOT: { id } },
      });
      if (exists) throw new BusinessError('Ya existe una categoría con ese nombre.');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.expenseCategoryDef.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name.trim() } : {}),
          ...(input.group ? { group: input.group as never } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (input.group && input.group !== cat.group) {
        await tx.expense.updateMany({ where: { categoryId: id }, data: { category: input.group as never } });
        await tx.recurringExpenseTemplate.updateMany({ where: { categoryId: id }, data: { category: input.group as never } });
      }
      return updated;
    });
  }

  private async resolveCategory(db: Prisma.TransactionClient | typeof prisma, input: { categoryId?: string; category?: string }) {
    if (input.categoryId) {
      const cat = await db.expenseCategoryDef.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw new NotFoundError('Categoría de gasto');
      return { categoryId: cat.id, category: cat.group };
    }
    if (input.category) {
      const cat = await db.expenseCategoryDef.findFirst({
        where: { group: input.category as never }, orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      });
      return { categoryId: cat?.id ?? null, category: input.category as never };
    }
    throw new BusinessError('Elige la categoría del gasto.');
  }

  /* ── Gastos ───────────────────────────────────────────────────────────── */

  // Saca el dinero de un gasto: del cajón de una caja abierta (efectivo con
  // sesión) o de la cuenta de Caja General que corresponde al método.
  private async withdrawForExpense(
    tx: Prisma.TransactionClient,
    expense: { id: string; description: string },
    amount: number, method: string, userId: string, cashSessionId?: string,
  ) {
    const isPhysicalCash = method === 'CASH';
    const cashSession = isPhysicalCash && cashSessionId
      ? await tx.cashSession.findFirst({ where: { id: cashSessionId, status: 'OPEN' } })
      : null;
    if (cashSession) {
      await tx.cashMovement.create({
        data: {
          cashSessionId: cashSession.id, type: 'WITHDRAWAL', amount,
          reason: `Gasto: ${expense.description}`, referenceType: 'EXPENSE', referenceId: expense.id,
        },
      });
    } else {
      await this.recordMovement(
        tx, 'WITHDRAWAL', amount, `Gasto: ${expense.description}`, userId, 'EXPENSE', expense.id,
        methodToAccount(method),
      );
    }
  }

  async createExpense(input: CreateExpenseInput) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (input.period && !PERIOD_RE.test(input.period)) throw new BusinessError('El mes del gasto no es válido.');
    const expenseDate = input.expenseDate ?? new Date();
    const period = input.period ?? limaPeriod(expenseDate);
    const method = input.method ?? 'CASH';
    const fields = docFields(input);

    return prisma.$transaction(async (tx) => {
      const cat = await this.resolveCategory(tx, input);
      const expense = await tx.expense.create({
        data: {
          ...cat,
          ...fields,
          description: input.description,
          amount: input.amount,
          method: method as never,
          reference: input.reference,
          notes: input.notes,
          expenseDate,
          period,
          accrualDate: accrualDateFor(expenseDate, period),
          isPending: !!input.isPending,
          userId: input.userId,
        },
      });
      if (!input.isPending) {
        await this.withdrawForExpense(tx, expense, input.amount, method, input.userId, input.cashSessionId);
      }
      return expense;
    });
  }

  /** Paga un gasto que estaba por pagar: recién ahora sale el dinero. */
  async payExpense(id: string, userId: string, input: { method: string; cashSessionId?: string; paidAt?: Date; reference?: string | null; amount?: number }) {
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundError('Gasto');
      if (expense.voidedAt) throw new BusinessError('Este gasto está anulado.');
      if (!expense.isPending) throw new BusinessError('Este gasto ya está pagado.');
      const paidAt = input.paidAt ?? new Date();
      // El recibo puede llegar por un monto distinto al estimado de la plantilla.
      const amount = input.amount ?? Number(expense.amount);
      if (!(amount > 0)) throw new BusinessError('El monto debe ser mayor a 0.');
      await this.withdrawForExpense(tx, expense, amount, input.method, userId, input.cashSessionId);
      return tx.expense.update({
        where: { id },
        data: {
          isPending: false,
          amount,
          method: input.method as never,
          expenseDate: paidAt,
          accrualDate: accrualDateFor(paidAt, expense.period),
          ...(input.reference !== undefined ? { reference: cleanText(input.reference) } : {}),
        },
      });
    });
  }

  // Corrige los datos descriptivos de un gasto. El monto y el método de un
  // gasto ya pagado no se editan (ya movieron dinero): para cambiarlos se
  // anula y se registra de nuevo. Uno por pagar sí puede cambiar de monto.
  async updateExpense(id: string, data: ExpenseDocFields & {
    categoryId?: string; category?: string; description?: string; reference?: string | null; notes?: string | null;
    expenseDate?: Date; period?: string; amount?: number;
  }) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundError('Gasto');
    if (expense.voidedAt) throw new BusinessError('Este gasto está anulado y ya no se puede editar.');
    if (data.period && !PERIOD_RE.test(data.period)) throw new BusinessError('El mes del gasto no es válido.');
    if (data.amount !== undefined && !expense.isPending && Math.abs(data.amount - Number(expense.amount)) > 0.009) {
      throw new BusinessError('El monto de un gasto ya pagado no se cambia: anúlalo y regístralo de nuevo.');
    }
    if (data.amount !== undefined && data.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    const cat = data.categoryId || data.category ? await this.resolveCategory(prisma, data) : {};
    const expenseDate = data.expenseDate ?? expense.expenseDate;
    const period = data.period ?? expense.period;
    return prisma.expense.update({
      where: { id },
      data: {
        ...cat,
        ...docFields(data),
        ...(data.description ? { description: data.description } : {}),
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.amount !== undefined && expense.isPending ? { amount: data.amount } : {}),
        expenseDate,
        period,
        accrualDate: accrualDateFor(expenseDate, period),
      },
    });
  }

  // Anula un gasto mal registrado: no se borra, queda marcado con quién y por
  // qué, y el dinero vuelve a donde salió. Si salió de una caja de turno que
  // sigue abierta vuelve a ese cajón; si esa caja ya cerró (su efectivo ya
  // pasó a Caja General) vuelve a Caja General. Uno por pagar no movió dinero.
  async voidExpense(id: string, userId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundError('Gasto');
      if (expense.voidedAt) throw new BusinessError('Este gasto ya fue anulado.');

      if (!expense.isPending) {
        const amount = Number(expense.amount);
        const cashMovement = await tx.cashMovement.findFirst({
          where: { referenceType: 'EXPENSE', referenceId: id },
          include: { cashSession: { select: { id: true, status: true } } },
        });
        const description = `Anulación de gasto: ${expense.description}`;

        if (cashMovement && cashMovement.cashSession.status === 'OPEN') {
          await tx.cashMovement.create({
            data: {
              cashSessionId: cashMovement.cashSession.id, type: 'DEPOSIT', amount,
              reason: description, referenceType: 'EXPENSE_VOID', referenceId: id,
            },
          });
        } else {
          await this.recordMovement(
            tx, 'DEPOSIT', amount, description, userId, 'EXPENSE_VOID', id,
            cashMovement ? 'CASH' : methodToAccount(expense.method),
          );
        }
      }

      return tx.expense.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
      });
    });
  }

  async listExpenses(filters: {
    page: number;
    limit: number;
    category?: string;
    categoryId?: string;
    pending?: boolean;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    includeVoided?: boolean;
  }) {
    const where: Prisma.ExpenseWhereInput = {};
    if (!filters.includeVoided) where.voidedAt = null;
    if (filters.category) where.category = filters.category as never;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.pending !== undefined) where.isPending = filters.pending;
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { payeeName: { contains: filters.search, mode: 'insensitive' } },
        { docNumber: { contains: filters.search } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      where.expenseDate = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true } },
          template: { select: { id: true, description: true } },
          categoryDef: { select: { id: true, name: true } },
        },
        orderBy: [{ isPending: 'desc' }, { expenseDate: 'desc' }],
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

  // Lo pagado en el rango (dinero que salió) y, aparte, todo lo que está por pagar.
  async getExpensesSummary(dateFrom: Date, dateTo: Date) {
    const [rows, byCat, pending] = await Promise.all([
      prisma.expense.groupBy({
        by: ['category'],
        where: { voidedAt: null, isPending: false, expenseDate: { gte: dateFrom, lte: dateTo } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ['categoryId'],
        where: { voidedAt: null, isPending: false, expenseDate: { gte: dateFrom, lte: dateTo } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.expense.aggregate({ where: { voidedAt: null, isPending: true }, _sum: { amount: true }, _count: true }),
    ]);
    const cats = await prisma.expenseCategoryDef.findMany({ select: { id: true, name: true } });
    const names = new Map(cats.map((c) => [c.id, c.name]));
    const total = rows.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    return {
      total,
      byCategory: rows.map((r) => ({ category: r.category, total: Number(r._sum.amount ?? 0), count: r._count })),
      byCategoryName: byCat
        .map((r) => ({ categoryId: r.categoryId, name: (r.categoryId && names.get(r.categoryId)) || 'Sin categoría', total: Number(r._sum.amount ?? 0), count: r._count }))
        .sort((a, b) => b.total - a.total),
      pending: { total: Number(pending._sum.amount ?? 0), count: pending._count },
    };
  }

  /* ── Plantillas de gasto recurrente ───────────────────────────────────── */

  async listRecurringTemplates() {
    return prisma.recurringExpenseTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { categoryDef: { select: { id: true, name: true } } },
    });
  }

  async createRecurringTemplate(input: CreateRecurringTemplateInput) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
      throw new BusinessError('El día del mes debe estar entre 1 y 28 (para que exista en todos los meses).');
    }
    const cat = await this.resolveCategory(prisma, input);
    return prisma.recurringExpenseTemplate.create({
      data: {
        ...cat,
        payeeName: cleanText(input.payeeName),
        description: input.description,
        amount: input.amount,
        dayOfMonth: input.dayOfMonth,
        userId: input.userId,
      },
    });
  }

  async updateRecurringTemplate(
    id: string,
    input: Partial<{ description: string; amount: number; dayOfMonth: number; isActive: boolean; categoryId: string; payeeName: string | null }>,
  ) {
    const tpl = await prisma.recurringExpenseTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundError('Plantilla de gasto recurrente');
    if (input.dayOfMonth !== undefined && (input.dayOfMonth < 1 || input.dayOfMonth > 28)) {
      throw new BusinessError('El día del mes debe estar entre 1 y 28.');
    }
    const { categoryId, payeeName, ...rest } = input;
    const cat = categoryId ? await this.resolveCategory(prisma, { categoryId }) : {};
    return prisma.recurringExpenseTemplate.update({
      where: { id },
      data: { ...rest, ...cat, ...(payeeName !== undefined ? { payeeName: cleanText(payeeName) } : {}) },
    });
  }

  async deleteRecurringTemplate(id: string) {
    const tpl = await prisma.recurringExpenseTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundError('Plantilla de gasto recurrente');
    await prisma.recurringExpenseTemplate.delete({ where: { id } });
  }

  // Genera los gastos recurrentes del mes que ya tocan y todavía no se
  // generaron. Desde la Fase 2 nacen "por pagar": el recibo existe, pero el
  // dinero sale recién cuando alguien lo marca como pagado. Se llama al
  // iniciar el servidor y cada pocas horas (ver server.ts).
  async processRecurringExpenses() {
    const [{ period, day }] = await prisma.$queryRawUnsafe<Array<{ period: string; day: number }>>(
      `SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Lima', 'YYYY-MM') as period,
              EXTRACT(DAY FROM NOW() AT TIME ZONE 'America/Lima')::int as day`,
    );

    const templates = await prisma.recurringExpenseTemplate.findMany({ where: { isActive: true } });
    for (const tpl of templates) {
      if (tpl.lastGeneratedPeriod === period) continue;
      if (day < tpl.dayOfMonth) continue;

      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.expense.create({
          data: {
            category: tpl.category,
            categoryId: tpl.categoryId,
            payeeName: tpl.payeeName,
            description: tpl.description,
            amount: tpl.amount,
            expenseDate: now,
            period,
            accrualDate: now,
            isPending: true,
            templateId: tpl.id,
            userId: tpl.userId,
            notes: 'Generado automáticamente (gasto recurrente). Falta marcarlo como pagado.',
          },
        });
        await tx.recurringExpenseTemplate.update({ where: { id: tpl.id }, data: { lastGeneratedPeriod: period } });
      });
    }
  }
}

export const treasuryService = new TreasuryService();
