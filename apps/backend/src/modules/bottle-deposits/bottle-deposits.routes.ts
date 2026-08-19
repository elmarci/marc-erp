import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { bottleDepositsService } from './bottle-deposits.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const moveSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  method: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']),
  cashSessionId: z.string().uuid().optional(),
  notes: z.string().optional(),
  customerId: z.string().uuid().optional(),
  debtorLabel: z.string().trim().min(1).max(80).optional(),
  paid: z.boolean().optional(),
  amount: z.coerce.number().min(0).optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await bottleDepositsService.listOutstanding();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/debtors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await bottleDepositsService.listOutstandingByDebtor();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, page, limit } = z.object({
      productId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await bottleDepositsService.listMovements({ productId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/charge', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = moveSchema.parse(req.body);
    const result = await bottleDepositsService.charge({ ...data, userId: req.user!.sub });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/return', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = moveSchema.parse(req.body);
    const result = await bottleDepositsService.returnDeposit({ ...data, userId: req.user!.sub });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
