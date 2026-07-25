import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ExpenseCategory, PaymentMethod } from '@prisma/client';
import { treasuryService } from './treasury.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

// Mismo criterio que Reportes: una fecha "YYYY-MM-DD" sin hora, interpretada
// en horario de Lima, y con endOfDay=true el filtro "hasta" incluye todo ese
// día en vez de cortar justo a la medianoche.
const parseLimaDate = (s: string, endOfDay = false) => {
  const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
  return new Date(`${s}${time}-05:00`);
};

const router = Router();

router.use(authenticate);

// Ver el saldo es lo mínimo que necesita un cajero para decidir cuánto sacar
// al abrir su caja — el resto del módulo (gastos, depósitos, plantillas)
// requiere Supervisor o superior, mismo nivel que aprobar compras.
router.get('/balance', authorizeMinRole('CASHIER'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await treasuryService.getBalance();
    res.json({ success: true, data: { balance } });
  } catch (err) { next(err); }
});

router.use(authorizeMinRole('SUPERVISOR'));

router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, dateFrom, dateTo, page, limit } = z.object({
      type: z.enum(['DEPOSIT', 'WITHDRAWAL']).optional(),
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await treasuryService.listMovements({ type, dateFrom, dateTo, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/deposits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, description } = z.object({
      amount: z.number().positive(),
      description: z.string().min(1),
    }).parse(req.body);
    const movement = await treasuryService.deposit(amount, description, req.user!.sub);
    res.status(201).json({ success: true, data: movement });
  } catch (err) { next(err); }
});

router.get('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, dateFrom, dateTo, page, limit } = z.object({
      category: z.nativeEnum(ExpenseCategory).optional(),
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)).optional(),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await treasuryService.listExpenses({ category, dateFrom, dateTo, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/expenses/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = z.object({
      dateFrom: z.string().transform((s) => parseLimaDate(s, false)),
      dateTo: z.string().transform((s) => parseLimaDate(s, true)),
    }).parse(req.query);
    const summary = await treasuryService.getExpensesSummary(dateFrom, dateTo);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.post('/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, description, amount, method, reference, notes, expenseDate } = z.object({
      category: z.nativeEnum(ExpenseCategory),
      description: z.string().min(1),
      amount: z.number().positive(),
      method: z.nativeEnum(PaymentMethod).optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      expenseDate: z.string().transform((s) => parseLimaDate(s, false)).optional(),
    }).parse(req.body);
    const expense = await treasuryService.createExpense({
      category, description, amount, method, reference, notes, expenseDate, userId: req.user!.sub,
    });
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
});

router.get('/recurring-expenses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await treasuryService.listRecurringTemplates();
    res.json({ success: true, data: templates });
  } catch (err) { next(err); }
});

router.post('/recurring-expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, description, amount, dayOfMonth } = z.object({
      category: z.nativeEnum(ExpenseCategory),
      description: z.string().min(1),
      amount: z.number().positive(),
      dayOfMonth: z.number().int().min(1).max(28),
    }).parse(req.body);
    const template = await treasuryService.createRecurringTemplate({
      category, description, amount, dayOfMonth, userId: req.user!.sub,
    });
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
});

router.patch('/recurring-expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      dayOfMonth: z.number().int().min(1).max(28).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const template = await treasuryService.updateRecurringTemplate(req.params.id, input);
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

router.delete('/recurring-expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await treasuryService.deleteRecurringTemplate(req.params.id);
    res.json({ success: true, message: 'Plantilla eliminada.' });
  } catch (err) { next(err); }
});

export default router;
