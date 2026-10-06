import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { NotFoundError, BusinessError } from '../../utils/errors';
import { treasuryService, type TreasuryAccount } from '../treasury/treasury.service';

// Préstamos a personas (negocio familiar: "le presto S/50 a Juan, luego me
// los devuelve"). Ni prestar ni cobrar de vuelta son gasto o ingreso — el
// dinero sigue siendo del negocio, solo está afuera temporalmente. Por eso
// cada movimiento de Caja General que generan usa su propio referenceType
// ('LOAN' / 'LOAN_PAYMENT'), nunca 'EXPENSE' — así nunca contaminan el
// reporte de gastos ni el margen del negocio (mismo criterio que
// BottleDepositMovement con la garantía de envase).
//
// Todo préstamo nuevo pertenece a un cliente registrado (Customer): así los
// préstamos repetidos a la misma persona quedan juntos y se puede ver cuánto
// debe en total, en vez de un registro suelto por cada vez que se le presta.

function customerDisplayName(c: { firstName: string; lastName: string | null; businessName: string | null }) {
  return c.businessName?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
}

const OUTSTANDING_TOLERANCE = 0.01;

export class LoansService {
  async createLoan(input: {
    customerId: string;
    amount: number;
    account?: TreasuryAccount;
    notes?: string;
    loanDate?: Date;
    userId: string;
  }) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    const account = input.account ?? 'CASH';

    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Cliente');
    if (!customer.isActive) throw new BusinessError('Este cliente está inactivo. Actívalo antes de prestarle.');
    const borrowerName = customerDisplayName(customer);

    return prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          customerId: customer.id,
          borrowerName,
          phone: customer.phone,
          amount: input.amount,
          account,
          notes: input.notes,
          loanDate: input.loanDate ?? new Date(),
          userId: input.userId,
        },
      });

      await treasuryService.recordMovementInTx(
        tx, 'WITHDRAWAL', input.amount, `Préstamo a ${borrowerName}`, input.userId, 'LOAN', loan.id, account,
      );

      return loan;
    });
  }

  // Aplica un pago a UN préstamo dentro de una transacción ya abierta —
  // compartido entre el pago puntual y el pago "a la cuenta" del cliente.
  private async applyPaymentInTx(
    tx: Prisma.TransactionClient,
    loan: { id: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; account: TreasuryAccount; borrowerName: string },
    amount: number,
    account: TreasuryAccount,
    notes: string | undefined,
    userId: string,
  ) {
    const payment = await tx.loanPayment.create({
      data: { loanId: loan.id, amount, account, notes, userId },
    });

    const newPaidAmount = Number(loan.paidAmount) + amount;
    const isFullyPaid = newPaidAmount >= Number(loan.amount) - OUTSTANDING_TOLERANCE;
    await tx.loan.update({
      where: { id: loan.id },
      data: { paidAmount: newPaidAmount, status: isFullyPaid ? 'PAID' : 'OPEN' },
    });

    await treasuryService.recordMovementInTx(
      tx, 'DEPOSIT', amount, `Devolución de préstamo — ${loan.borrowerName}`, userId, 'LOAN_PAYMENT', payment.id, account,
    );
    return payment;
  }

  async registerPayment(input: {
    loanId: string;
    amount: number;
    account?: TreasuryAccount;
    notes?: string;
    userId: string;
  }) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    return prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: input.loanId } });
      if (!loan) throw new NotFoundError('Préstamo');
      if (loan.status === 'PAID') throw new BusinessError('Este préstamo ya está pagado por completo.');

      const outstanding = Number(loan.amount) - Number(loan.paidAmount);
      // Margen de un centavo: el saldo pendiente y el monto pagado se
      // acumulan como floats en el cliente, así que "pagar todo lo que
      // falta" puede llegar aquí con un resto de 0.0000000001 en vez de 0
      // exacto (mismo caso que el límite de crédito de ventas fiadas).
      if (input.amount > outstanding + OUTSTANDING_TOLERANCE) {
        throw new BusinessError(
          `El pago (S/ ${input.amount.toFixed(2)}) supera lo que falta del préstamo (S/ ${outstanding.toFixed(2)}).`,
        );
      }

      return this.applyPaymentInTx(
        tx, { ...loan, account: loan.account as TreasuryAccount }, input.amount, input.account ?? (loan.account as TreasuryAccount), input.notes, input.userId,
      );
    });
  }

  // Pago "a la cuenta" del cliente: cuando devuelve plata sin decir de cuál
  // préstamo, se aplica a los más antiguos primero (FIFO) hasta agotarse —
  // así nadie tiene que elegir préstamo por préstamo.
  async registerCustomerPayment(input: {
    customerId: string;
    amount: number;
    account?: TreasuryAccount;
    notes?: string;
    userId: string;
  }) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');

    return prisma.$transaction(async (tx) => {
      const loans = await tx.loan.findMany({
        where: { customerId: input.customerId, status: 'OPEN' },
        orderBy: { loanDate: 'asc' },
      });
      if (loans.length === 0) throw new BusinessError('Este cliente no tiene préstamos pendientes.');

      const totalOutstanding = loans.reduce((s, l) => s + (Number(l.amount) - Number(l.paidAmount)), 0);
      if (input.amount > totalOutstanding + OUTSTANDING_TOLERANCE) {
        throw new BusinessError(
          `El pago (S/ ${input.amount.toFixed(2)}) supera lo que debe en total (S/ ${totalOutstanding.toFixed(2)}).`,
        );
      }

      let remaining = input.amount;
      const payments = [];
      for (const loan of loans) {
        if (remaining <= 0.0049) break;
        const outstanding = Number(loan.amount) - Number(loan.paidAmount);
        const portion = Math.min(remaining, outstanding);
        payments.push(await this.applyPaymentInTx(
          tx, { ...loan, account: loan.account as TreasuryAccount }, Math.round(portion * 100) / 100,
          input.account ?? (loan.account as TreasuryAccount), input.notes, input.userId,
        ));
        remaining -= portion;
      }
      return { payments, applied: input.amount - Math.max(0, remaining) };
    });
  }

  // Vincula un préstamo antiguo (solo nombre) a un cliente registrado.
  async linkLoanToCustomer(loanId: string, customerId: string) {
    const [loan, customer] = await Promise.all([
      prisma.loan.findUnique({ where: { id: loanId } }),
      prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } }),
    ]);
    if (!loan) throw new NotFoundError('Préstamo');
    if (!customer) throw new NotFoundError('Cliente');
    return prisma.loan.update({
      where: { id: loanId },
      data: { customerId: customer.id, borrowerName: customerDisplayName(customer), phone: customer.phone ?? loan.phone },
    });
  }

  // Vincula de una vez TODOS los préstamos antiguos de una misma persona (por
  // nombre, sin distinguir mayúsculas ni espacios sobrantes) a un cliente
  // registrado — así no hay que vincular préstamo por préstamo.
  async linkBorrowerGroupToCustomer(borrowerName: string, customerId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Cliente');
    const key = borrowerName.trim().toLowerCase();
    const orphans = await prisma.loan.findMany({ where: { customerId: null }, select: { id: true, borrowerName: true } });
    const ids = orphans.filter((l) => l.borrowerName.trim().toLowerCase() === key).map((l) => l.id);
    if (ids.length === 0) throw new BusinessError('No hay préstamos sin cliente con ese nombre.');
    await prisma.loan.updateMany({
      where: { id: { in: ids } },
      data: { customerId: customer.id, borrowerName: customerDisplayName(customer), phone: customer.phone ?? undefined },
    });
    return { linked: ids.length };
  }

  async listLoans(filters: { page: number; limit: number; status?: 'OPEN' | 'PAID'; search?: string; customerId?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
    if (filters.customerId) where['customerId'] = filters.customerId;
    if (filters.search) where['borrowerName'] = { contains: filters.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { loanDate: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.loan.count({ where }),
    ]);

    return {
      data: data.map((l) => ({ ...l, outstanding: Number(l.amount) - Number(l.paidAmount) })),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  // Vista por persona: una fila por cliente con cuánto se le prestó, cuánto
  // devolvió y cuánto debe hoy, y el detalle de cada préstamo adentro. Los
  // préstamos antiguos sin cliente se agrupan por nombre (y quedan marcados
  // para que se vinculen a un cliente real).
  async listByBorrower(filters: { status: 'OPEN' | 'ALL'; search?: string }) {
    const loans = await prisma.loan.findMany({
      where: filters.search ? { borrowerName: { contains: filters.search, mode: 'insensitive' } } : {},
      include: { customer: { select: { id: true, firstName: true, lastName: true, businessName: true, phone: true } } },
      orderBy: { loanDate: 'desc' },
    });

    interface Group {
      key: string; customerId: string | null; name: string; phone: string | null;
      totalLent: number; totalPaid: number; outstanding: number; openCount: number; lastLoanDate: Date;
      loans: Array<{
        id: string; amount: number; paidAmount: number; outstanding: number; account: string;
        status: string; notes: string | null; loanDate: Date;
      }>;
    }
    const groups = new Map<string, Group>();
    for (const l of loans) {
      const key = l.customerId ?? `name:${l.borrowerName.trim().toLowerCase()}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key, customerId: l.customerId,
          name: l.customer ? customerDisplayName(l.customer) : l.borrowerName,
          phone: l.customer?.phone ?? l.phone,
          totalLent: 0, totalPaid: 0, outstanding: 0, openCount: 0, lastLoanDate: l.loanDate, loans: [],
        };
        groups.set(key, g);
      }
      const outstanding = Number(l.amount) - Number(l.paidAmount);
      g.totalLent += Number(l.amount);
      g.totalPaid += Number(l.paidAmount);
      if (l.status === 'OPEN') { g.outstanding += outstanding; g.openCount += 1; }
      g.loans.push({
        id: l.id, amount: Number(l.amount), paidAmount: Number(l.paidAmount), outstanding,
        account: l.account, status: l.status, notes: l.notes, loanDate: l.loanDate,
      });
    }

    const result = [...groups.values()]
      .filter((g) => filters.status === 'ALL' || g.openCount > 0)
      // Quien más debe primero; a igual deuda, el más reciente.
      .sort((a, b) => b.outstanding - a.outstanding || b.lastLoanDate.getTime() - a.lastLoanDate.getTime());
    return result;
  }

  async getLoan(id: string) {
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { paidAt: 'desc' } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!loan) throw new NotFoundError('Préstamo');
    return { ...loan, outstanding: Number(loan.amount) - Number(loan.paidAmount) };
  }

  // Total prestado y aún no devuelto, por si se quiere mostrar en el
  // dashboard ("tienes S/X prestados en la calle").
  async getOutstandingSummary() {
    const loans = await prisma.loan.findMany({ where: { status: 'OPEN' } });
    const total = loans.reduce((sum, l) => sum + (Number(l.amount) - Number(l.paidAmount)), 0);
    const borrowers = new Set(loans.map((l) => l.customerId ?? `name:${l.borrowerName.trim().toLowerCase()}`));
    return { total, count: loans.length, borrowers: borrowers.size };
  }
}

export const loansService = new LoansService();
