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
    const data = schema.parse(req.body);
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

router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, method, notes } = z.object({
      amount: z.coerce.number().positive(),
      method: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']),
      notes: z.string().optional(),
    }).parse(req.body);

    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado.' } }); return; }

    if (Number(customer.currentBalance) <= 0) {
      res.status(400).json({ success: false, error: { code: 'BUSINESS_ERROR', message: 'El cliente no tiene deuda pendiente.' } }); return;
    }

    const payAmount = Math.min(amount, Number(customer.currentBalance));
    const updated = await prisma.customer.update({
      where: { id: req.params.id },
      data: { currentBalance: { decrement: payAmount } },
    });

    res.json({ success: true, data: { paid: payAmount, remaining: Number(updated.currentBalance), customer: updated } });
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
