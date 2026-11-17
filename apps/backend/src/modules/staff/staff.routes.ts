import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { staffService } from './staff.service';

const router = Router();
router.use(authenticate);
// Sueldos y pagos del personal: solo administración.
router.use(authorizeMinRole('ADMIN'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const kindEnum = z.enum(['REGULAR', 'GRATIFICACION', 'CTS', 'VACACIONES', 'LIQUIDACION']);

const employeeSchema = z.object({
  firstName: z.string().trim().min(1, 'Escribe el nombre'),
  lastName: z.string().trim().default(''),
  docNumber: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  startDate: day,
  endDate: day.optional().nullable(),
  isActive: z.boolean().optional(),
  userId: z.string().uuid().optional().nullable(),
  employmentType: z.enum(['INFORMAL', 'PLANILLA']),
  laborRegime: z.enum(['MICRO', 'GENERAL']).optional().nullable(),
  payFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  salary: z.coerce.number().positive('Escribe cuánto gana'),
  pensionSystem: z.enum(['NONE', 'ONP', 'AFP']).optional(),
  afpName: z.string().trim().optional().nullable(),
  afpRate: z.coerce.number().min(0).max(20).optional().nullable(),
  familyAllowance: z.boolean().optional(),
  discountAbsences: z.boolean().optional(),
  discountLateness: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.list(req.query.all === 'true');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.create(employeeSchema.parse(req.body));
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ employeeId: z.string().uuid().optional(), from: day.optional(), to: day.optional() }).parse(req.query);
    const data = await staffService.listPayments(q);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/payments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.getPayment(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/payments/:id/void', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo') }).parse(req.body);
    const data = await staffService.voidPayment(req.params.id, req.user!.sub, reason);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/advances/:id/void', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo') }).parse(req.body);
    const data = await staffService.voidAdvance(req.params.id, req.user!.sub, reason);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.get(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.update(req.params.id, employeeSchema.partial().parse(req.body));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/advances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
      method: z.nativeEnum(PaymentMethod).default('CASH'),
      cashSessionId: z.string().uuid().optional(),
      notes: z.string().trim().optional().nullable(),
    }).parse(req.body);
    const data = await staffService.giveAdvance(req.params.id, req.user!.sub, input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      kind: kindEnum.optional(), from: day.optional(), to: day.optional(),
      vacationDays: z.coerce.number().min(0).max(60).optional(),
    }).parse(req.query);
    const data = await staffService.preview(req.params.id, q);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/benefits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await staffService.benefits(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const money = z.coerce.number().min(0);
    const input = z.object({
      kind: kindEnum.default('REGULAR'),
      periodStart: day, periodEnd: day,
      daysScheduled: z.coerce.number().int().min(0).optional(),
      daysWorked: z.coerce.number().min(0).optional(),
      lateMinutes: z.coerce.number().int().min(0).optional(),
      baseAmount: money, familyAllowance: money.optional(), bonus: money.optional(),
      absenceDiscount: money.optional(), lateDiscount: money.optional(),
      advanceIds: z.array(z.string().uuid()).optional(),
      otherDiscount: money.optional(), otherDiscountNote: z.string().trim().optional().nullable(),
      method: z.nativeEnum(PaymentMethod).default('CASH'),
      cashSessionId: z.string().uuid().optional(),
      notes: z.string().trim().optional().nullable(),
    }).parse(req.body);
    const data = await staffService.pay(req.params.id, req.user!.sub, input);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
