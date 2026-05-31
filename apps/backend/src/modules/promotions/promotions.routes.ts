import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { promotionsService } from './promotions.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const promoSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(['PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'BUY_X_GET_Y', 'BUNDLE_PRICE', 'HAPPY_HOUR']),
  value: z.coerce.number().min(0),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
  showInStore: z.boolean().default(false),
  storeBadge: z.string().optional(),
  storeImage: z.string().url().optional().or(z.literal('')),
  priority: z.coerce.number().default(0),
  productIds: z.array(z.string().uuid()).optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { active, page, limit } = z.object({
      active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await promotionsService.list({ active, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promo = await promotionsService.get(req.params.id);
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = promoSchema.parse(req.body);
    const promo = await promotionsService.create(data as Parameters<typeof promotionsService.create>[0]);
    res.status(201).json({ success: true, data: promo });
  } catch (err) { next(err); }
});

router.put('/:id', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = promoSchema.partial().parse(req.body);
    const promo = await promotionsService.update(req.params.id, data as Parameters<typeof promotionsService.update>[1]);
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
});

router.patch('/:id/toggle', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promo = await promotionsService.toggleActive(req.params.id);
    res.json({ success: true, data: promo });
  } catch (err) { next(err); }
});

router.delete('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await promotionsService.delete(req.params.id);
    res.json({ success: true, message: 'Oferta eliminada.' });
  } catch (err) { next(err); }
});

export default router;
