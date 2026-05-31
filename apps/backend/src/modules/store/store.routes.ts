import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storeService } from './store.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId, page, limit } = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(24),
    }).parse(req.query);
    const result = await storeService.getProducts({ search, categoryId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getCategories();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/offers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getActiveOffers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      customerName: z.string().min(2),
      customerPhone: z.string().min(9),
      customerEmail: z.string().email().optional(),
      deliveryType: z.enum(['DELIVERY', 'PICKUP']),
      address: z.string().optional(),
      district: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      paymentMethod: z.enum(['YAPE', 'PLIN', 'CASH']),
      items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      })).min(1),
    }).parse(req.body);

    const order = await storeService.createOrder(data);
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.get('/orders/track/:phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await storeService.getOrdersByPhone(req.params.phone);
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

router.get('/orders/:orderNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await storeService.getOrder(req.params.orderNumber);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── Rutas protegidas (ERP admin) ───────────────────────────────────────────

router.get('/admin/orders', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = z.object({
      status: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await storeService.listOrders({ status, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/admin/orders/:id/confirm', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashSessionId } = z.object({ cashSessionId: z.string().uuid() }).parse(req.body);
    const result = await storeService.confirmOrder(req.params.id, cashSessionId, req.user!.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/admin/orders/:id/status', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, paymentStatus } = z.object({
      status: z.string().optional(),
      paymentStatus: z.string().optional(),
    }).parse(req.body);
    const order = await storeService.updateOrderStatus(req.params.id, status!, paymentStatus);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

export default router;
