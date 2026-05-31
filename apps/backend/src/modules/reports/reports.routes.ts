import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from './reports.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

router.use(authenticate);

// Dashboard accesible para todos los roles autenticados
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await reportsService.getDashboard();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// El resto de reportes requiere SUPERVISOR o superior
router.use(authorizeMinRole('SUPERVISOR'));

router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = dateRangeSchema.parse(req.query);
    const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') ?? 'day';
    const data = await reportsService.getSalesReport({ from, to }, groupBy);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await reportsService.getInventoryReport();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/top-products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = dateRangeSchema.parse(req.query);
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await reportsService.getTopProducts({ from, to }, limit);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
