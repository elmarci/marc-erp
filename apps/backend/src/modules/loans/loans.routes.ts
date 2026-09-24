import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { loansService } from './loans.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { parseLimaDate } from '../../utils/timezone';

const router = Router();

router.use(authenticate);
router.use(authorizeMinRole('SUPERVISOR'));

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search, page, limit } = z.object({
      status: z.enum(['OPEN', 'PAID']).optional(),
      search: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await loansService.listLoans({ status, search, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await loansService.getOutstandingSummary();
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loan = await loansService.getLoan(req.params.id);
    res.json({ success: true, data: loan });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { borrowerName, phone, amount, account, notes, loanDate } = z.object({
      borrowerName: z.string().min(1),
      phone: z.string().optional(),
      amount: z.number().positive(),
      account: z.enum(['CASH', 'YAPE', 'PLIN']).default('CASH'),
      notes: z.string().optional(),
      loanDate: z.string().transform((s) => parseLimaDate(s, false)).optional(),
    }).parse(req.body);
    const loan = await loansService.createLoan({
      borrowerName, phone, amount, account, notes, loanDate, userId: req.user!.sub,
    });
    res.status(201).json({ success: true, data: loan });
  } catch (err) { next(err); }
});

router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, account, notes } = z.object({
      amount: z.number().positive(),
      account: z.enum(['CASH', 'YAPE', 'PLIN']).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const payment = await loansService.registerPayment({ loanId: req.params.id, amount, account, notes, userId: req.user!.sub });
    res.status(201).json({ success: true, data: payment });
  } catch (err) { next(err); }
});

export default router;
