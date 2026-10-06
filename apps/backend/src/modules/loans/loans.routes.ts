import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { loansService } from './loans.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { parseLimaDate } from '../../utils/timezone';

const router = Router();

router.use(authenticate);
router.use(authorizeMinRole('SUPERVISOR'));

const accountSchema = z.enum(['CASH', 'YAPE', 'PLIN']);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search, customerId, page, limit } = z.object({
      status: z.enum(['OPEN', 'PAID']).optional(),
      search: z.string().optional(),
      customerId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(25),
    }).parse(req.query);
    const result = await loansService.listLoans({ status, search, customerId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/by-borrower', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, search } = z.object({
      status: z.enum(['OPEN', 'ALL']).default('OPEN'),
      search: z.string().optional(),
    }).parse(req.query);
    const data = await loansService.listByBorrower({ status, search });
    res.json({ success: true, data });
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
    const { customerId, amount, account, notes, loanDate } = z.object({
      // Solo se presta a clientes registrados — así cada persona tiene un
      // único historial en vez de un registro suelto por cada préstamo.
      customerId: z.string().uuid('Selecciona un cliente registrado.'),
      amount: z.number().positive(),
      account: accountSchema.default('CASH'),
      notes: z.string().optional(),
      loanDate: z.string().transform((s) => parseLimaDate(s, false)).optional(),
    }).parse(req.body);
    const loan = await loansService.createLoan({ customerId, amount, account, notes, loanDate, userId: req.user!.sub });
    res.status(201).json({ success: true, data: loan });
  } catch (err) { next(err); }
});

router.post('/customer/:customerId/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, account, notes } = z.object({
      amount: z.number().positive(),
      account: accountSchema.optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const result = await loansService.registerCustomerPayment({
      customerId: req.params.customerId, amount, account, notes, userId: req.user!.sub,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/link-group', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { borrowerName, customerId } = z.object({ borrowerName: z.string().min(1), customerId: z.string().uuid() }).parse(req.body);
    const result = await loansService.linkBorrowerGroupToCustomer(borrowerName, customerId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/:id/customer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(req.body);
    const loan = await loansService.linkLoanToCustomer(req.params.id, customerId);
    res.json({ success: true, data: loan });
  } catch (err) { next(err); }
});

router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, account, notes } = z.object({
      amount: z.number().positive(),
      account: accountSchema.optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const payment = await loansService.registerPayment({ loanId: req.params.id, amount, account, notes, userId: req.user!.sub });
    res.status(201).json({ success: true, data: payment });
  } catch (err) { next(err); }
});

export default router;
