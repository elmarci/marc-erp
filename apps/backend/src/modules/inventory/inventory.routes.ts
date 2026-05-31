import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { inventoryService } from './inventory.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await inventoryService.getDashboard();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId, status, page, limit } = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      status: z.enum(['all', 'ok', 'low', 'out']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);
    const result = await inventoryService.getStockOverview({ search, categoryId, status, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, type, from, to, page, limit } = z.object({
      productId: z.string().uuid().optional(),
      type: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);
    const result = await inventoryService.listMovements({ productId, type, from, to, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/adjustments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await inventoryService.listAdjustments({ page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/adjustments', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason, notes, items } = z.object({
      reason: z.string().min(3),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        physicalQuantity: z.coerce.number().min(0),
      })).min(1),
    }).parse(req.body);
    const adj = await inventoryService.createAdjustment(req.user!.sub, reason, notes, items as { productId: string; physicalQuantity: number }[]);
    res.status(201).json({ success: true, data: adj });
  } catch (err) { next(err); }
});

router.post('/quick-adjust', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, newQuantity, reason } = z.object({
      productId: z.string().uuid(),
      newQuantity: z.coerce.number().min(0),
      reason: z.string().min(3),
    }).parse(req.body);
    const result = await inventoryService.quickAdjust(req.user!.sub, productId, newQuantity, reason);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/low-stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await inventoryService.getLowStockProducts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
