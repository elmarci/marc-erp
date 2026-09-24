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

export class LoansService {
  async createLoan(input: {
    borrowerName: string;
    phone?: string;
    amount: number;
    account?: TreasuryAccount;
    notes?: string;
    loanDate?: Date;
    userId: string;
  }) {
    if (input.amount <= 0) throw new BusinessError('El monto debe ser mayor a 0.');
    const account = input.account ?? 'CASH';

    return prisma.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          borrowerName: input.borrowerName,
          phone: input.phone,
          amount: input.amount,
          account,
          notes: input.notes,
          loanDate: input.loanDate ?? new Date(),
          userId: input.userId,
        },
      });

      await treasuryService.recordMovementInTx(
        tx, 'WITHDRAWAL', input.amount, `Préstamo a ${input.borrowerName}`, input.userId, 'LOAN', loan.id, account,
      );

      return loan;
    });
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
      if (input.amount > outstanding + 0.01) {
        throw new BusinessError(
          `El pago (S/ ${input.amount.toFixed(2)}) supera lo que falta del préstamo (S/ ${outstanding.toFixed(2)}).`,
        );
      }

      const account = input.account ?? loan.account;
      const payment = await tx.loanPayment.create({
        data: { loanId: loan.id, amount: input.amount, account, notes: input.notes, userId: input.userId },
      });

      const newPaidAmount = Number(loan.paidAmount) + input.amount;
      const isFullyPaid = newPaidAmount >= Number(loan.amount) - 0.01;
      await tx.loan.update({
        where: { id: loan.id },
        data: { paidAmount: newPaidAmount, status: isFullyPaid ? 'PAID' : 'OPEN' },
      });

      await treasuryService.recordMovementInTx(
        tx, 'DEPOSIT', input.amount, `Devolución de préstamo — ${loan.borrowerName}`, input.userId, 'LOAN_PAYMENT', payment.id, account,
      );

      return payment;
    });
  }

  async listLoans(filters: { page: number; limit: number; status?: 'OPEN' | 'PAID'; search?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;
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
    return { total, count: loans.length };
  }
}

export const loansService = new LoansService();
