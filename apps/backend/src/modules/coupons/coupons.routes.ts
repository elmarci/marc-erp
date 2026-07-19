import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { couponsService } from './coupons.service';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(req.query);
    const coupons = await couponsService.listForCustomer(customerId);
    res.json({ success: true, data: coupons });
  } catch (err) { next(err); }
});

router.get('/validate/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(req.query);
    const coupon = await couponsService.validate(req.params.code, customerId);
    res.json({ success: true, data: coupon });
  } catch (err) { next(err); }
});

export default router;
