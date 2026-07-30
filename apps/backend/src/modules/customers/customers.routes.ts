import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { authenticate } from '../../middleware/auth';
import { Prisma } from '@prisma/client';
import { sendExcel } from '../../utils/excel';
import { treasuryService, methodToAccount } from '../treasury/treasury.service';
import { emitEvent } from '../../config/socket';

const router = Router();

router.use(authenticate);

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Regular', WHOLESALE: 'Mayorista', VIP: 'VIP', CREDIT: 'Crédito',
};

router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, type } = req.query as Record<string, string>;
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

    const customers = await prisma.customer.findMany({ where, orderBy: { firstName: 'asc' } });

    await sendExcel(res, 'clientes.xlsx', 'Clientes', [
      { header: 'Nombre', key: 'firstName', width: 20 },
      { header: 'Apellido', key: 'lastName', width: 20 },
      { header: 'Empresa', key: 'businessName', width: 25 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'Documento', key: 'taxId', width: 15 },
      { header: 'Teléfono', key: 'phone', width: 14 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Dirección', key: 'address', width: 30 },
      { header: 'Límite de crédito', key: 'creditLimit', width: 16 },
      { header: 'Saldo deuda', key: 'currentBalance', width: 14 },
      { header: 'Puntos', key: 'loyaltyPoints', width: 10 },
      { header: 'Estado', key: 'status', width: 10 },
      { header: 'Fecha registro', key: 'createdAt', width: 18 },
    ], customers.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      businessName: c.businessName ?? '',
      type: CUSTOMER_TYPE_LABELS[c.type] ?? c.type,
      taxId: c.taxId ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      creditLimit: Number(c.creditLimit),
      currentBalance: Number(c.currentBalance),
      loyaltyPoints: c.loyaltyPoints,
      status: c.isActive ? 'Activo' : 'Inactivo',
      createdAt: c.createdAt.toLocaleString('es-PE'),
    })));
  } catch (err) { next(err); }
});

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
// cuáles, no es reparto automático sobre TODA la deuda).
//
// A dónde va el dinero:
// - Efectivo con una caja abierta en ese momento: se registra como
//   movimiento de ESA sesión (igual que una venta en efectivo) y llega a
//   Caja General recién cuando esa caja se cierra — así el conteo físico del
//   cajero cuadra (ese billete ya está en su cajón).
// - Yape/Plin, o efectivo sin ninguna caja abierta: no hay cajón físico que
//   cuadrar ni cierre que lo vaya a recoger después, así que se deposita
//   DIRECTO en Caja General en el momento del cobro — si no, ese dinero
//   nunca queda registrado en ningún lado.
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
    const customerName = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || customer.businessName || 'cliente';
    const description = `Cobro de deuda (${customerName}) — ${payments.map((p) => p.saleNumber).join(', ')}`;

    let cashSession = null;
    if (method === 'CASH' && cashSessionId) {
      cashSession = await prisma.cashSession.findFirst({ where: { id: cashSessionId, status: 'OPEN' } });
    }

    const updatedCustomer = await prisma.$transaction(async (tx) => {
      for (const p of payments) {
        await tx.sale.update({ where: { id: p.saleId }, data: { paidAmount: { increment: p.amount } } });
        await tx.customerDebtPayment.create({
          data: { customerId: req.params.id, saleId: p.saleId, amount: p.amount, method, notes },
        });
      }

      const customerAfter = await tx.customer.update({
        where: { id: req.params.id },
        data: { currentBalance: { decrement: totalPaid } },
      });

      if (cashSession) {
        // Efectivo dentro de una sesión abierta: espera al cierre de esa
        // caja para no contar el mismo billete dos veces en Caja General.
        await tx.cashMovement.create({
          data: {
            cashSessionId: cashSession.id, type: 'DEPOSIT', amount: totalPaid, reason: description, notes,
            referenceType: 'DEBT_PAYMENT', referenceId: customer.id,
          },
        });
      } else {
        // Sin sesión que lo cuadre (Yape/Plin, o efectivo cobrado fuera de
        // una caja abierta): va directo a Caja General, referenciado al
        // cliente para trazabilidad.
        await treasuryService.recordMovementInTx(
          tx, 'DEPOSIT', totalPaid, description, req.user!.sub, 'DEBT_PAYMENT', customer.id, methodToAccount(method),
        );
      }

      return customerAfter;
    });

    if (!cashSession) emitEvent('erp:cash-updated');

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
