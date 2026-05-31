import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { purchasesService } from './purchases.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, supplierId, page, limit } = z.object({
      status: z.string().optional(),
      supplierId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await purchasesService.listOrders({ status, supplierId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.getOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      supplierId: z.string().uuid(),
      expectedDate: z.coerce.date().optional(),
      notes: z.string().optional(),
      supplierInvoice: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        orderedQty: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
      })).min(1),
    }).parse(req.body);

    const order = await purchasesService.createOrder(req.user!.sub, data);
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/approve', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.approveOrder(req.params.id, req.user!.sub);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.cancelOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/receive', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, notes } = z.object({
      items: z.array(z.object({
        productId: z.string().uuid(),
        receivedQty: z.coerce.number().min(0),
        unitCost: z.coerce.number().min(0),
        batchNumber: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
      })).min(1),
      notes: z.string().optional(),
    }).parse(req.body);

    const receipt = await purchasesService.receiveOrder(req.params.id, req.user!.sub, items, notes);
    res.status(201).json({ success: true, data: receipt });
  } catch (err) { next(err); }
});

export default router;
