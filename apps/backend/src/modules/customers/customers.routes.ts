import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { authenticate } from '../../middleware/auth';
import { Prisma } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '25', search, type } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(type ? { type: type as never } : {}),
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { taxId: { contains: search } },
        ],
      } : {}),
    };

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({ where, skip, take: parseInt(limit), orderBy: { firstName: 'asc' } }),
      prisma.customer.count({ where }),
    ]);

    res.json({ success: true, data: customers, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      taxId: z.string().optional(),
      taxIdType: z.string().optional(),
      firstName: z.string().min(1),
      lastName: z.string().optional(),
      businessName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      type: z.enum(['REGULAR', 'WHOLESALE', 'VIP', 'CREDIT']).default('REGULAR'),
      creditLimit: z.number().min(0).default(0),
    });
    const data = schema.parse(req.body) as Parameters<typeof prisma.customer.create>[0]['data'];
    const customer = await prisma.customer.create({ data });
    res.status(201).json({ success: true, data: customer });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      taxId: z.string().optional().nullable(),
      taxIdType: z.string().optional().nullable(),
      firstName: z.string().min(1),
      lastName: z.string().optional().nullable(),
      businessName: z.string().optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      phone: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      type: z.enum(['REGULAR', 'WHOLESALE', 'VIP', 'CREDIT']).optional(),
      creditLimit: z.coerce.number().min(0).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().optional().nullable(),
    });
    const data = schema.parse(req.body);
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }
    const updated = await prisma.customer.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }
    await prisma.customer.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ success: true, message: 'Cliente eliminado.' });
  } catch (err) { next(err); }
});

// Ventas fiadas de este cliente que aún tienen saldo pendiente — para que el
// cajero elija a cuál aplicar el pago (trazabilidad: cada pago queda ligado
// a una venta específica, no solo a un saldo general).
router.get('/:id/unpaid-sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }

    const sales = await prisma.sale.findMany({
      where: { customerId: req.params.id, isCredit: true, status: 'COMPLETED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, saleNumber: true, createdAt: true, totalAmount: true, paidAmount: true },
    });
    const unpaid = sales
      .map((s) => ({ ...s, outstanding: Number(s.totalAmount) - Number(s.paidAmount) }))
      .filter((s) => s.outstanding > 0.009);

    res.json({ success: true, data: unpaid });
  } catch (err) { next(err); }
});

// Un pago puede aplicarse a varias ventas fiadas a la vez (el cajero elige
// cuáles, no es reparto automático sobre TODA la deuda). Si el pago es en
// efectivo y se manda la sesión de caja abierta del cajero, se registra
// también como un movimiento de esa caja para que aparezca en el arqueo del
// día — de lo contrario ese dinero queda invisible al cierre de caja.
router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { allocations, method, notes, cashSessionId } = z.object({
      allocations: z.array(z.object({
        saleId: z.string().uuid(),
        amount: z.coerce.number().positive(),
      })).min(1),
      method: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']),
      notes: z.string().optional(),
      cashSessionId: z.string().uuid().optional(),
    }).parse(req.body);

    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }

    const saleIds = allocations.map((a) => a.saleId);
    const sales = await prisma.sale.findMany({ where: { id: { in: saleIds }, customerId: req.params.id, isCredit: true } });
    const salesById = new Map(sales.map((s) => [s.id, s]));

    const payments: { saleId: string; saleNumber: string; amount: number }[] = [];
    for (const a of allocations) {
      const sale = salesById.get(a.saleId);
      if (!sale) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Una de las ventas fiadas no fue encontrada para este cliente.' } }); return; }
      const outstanding = Number(sale.totalAmount) - Number(sale.paidAmount);
      if (outstanding <= 0.009) {
        res.status(400).json({ success: false, error: { code: 'BUSINESS_ERROR', message: `La venta ${sale.saleNumber} ya está saldada.` } }); return;
      }
      payments.push({ saleId: a.saleId, saleNumber: sale.saleNumber, amount: Math.min(a.amount, outstanding) });
    }

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    let cashSession = null;
    if (method === 'CASH' && cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: cashSessionId, status: 'OPEN' } });
    }

    const ops = [
      ...payments.map((p) => prisma.sale.update({ where: { id: p.saleId }, data: { paidAmount: { increment: p.amount } } })),
      ...payments.map((p) => prisma.customerDebtPayment.create({
        data: { customerId: req.params.id, saleId: p.saleId, amount: p.amount, method, notes },
      })),
      prisma.customer.update({
        where: { id: req.params.id },
        data: { currentBalance: { decrement: totalPaid } },
      }),
      ...(cashSession ? [prisma.cashMovement.create({
        data: {
          cashSessionId: cashSession.id,
          type: 'DEPOSIT',
          amount: totalPaid,
          reason: `Cobro de deuda — ${payments.map((p) => p.saleNumber).join(', ')}`,
          notes,
        },
      })] : []),
    ];

    const results = await prisma.$transaction(ops);
    const updatedCustomer = results[payments.length * 2] as Awaited<ReturnType<typeof prisma.customer.update>>;

    res.json({
      success: true,
      data: {
        paid: totalPaid,
        appliedTo: payments,
        remaining: Number(updatedCustomer.currentBalance),
        customer: updatedCustomer,
      },
    });
  } catch (err) { next(err); }
});

router.get('/:id/debt-payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }

    const payments = await prisma.customerDebtPayment.findMany({
      where: { customerId: req.params.id },
      orderBy: { paidAt: 'desc' },
      include: { sale: { select: { saleNumber: true } } },
    });
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

router.get('/:id/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }

    const [sales, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where: { customerId: req.params.id },
        include: {
          payments: { select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.sale.count({ where: { customerId: req.params.id } }),
    ]);

    const totalSpent = await prisma.sale.aggregate({
      where: { customerId: req.params.id, status: 'COMPLETED' },
      _sum: { totalAmount: true },
    });

    res.json({
      success: true,
      data: sales,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
      totalSpent: Number(totalSpent._sum.totalAmount ?? 0),
    });
  } catch (err) { next(err); }
});

export default router;
