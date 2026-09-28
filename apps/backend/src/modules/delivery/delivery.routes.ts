import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { deliveryService } from './delivery.service';
import { riderAuthMiddleware, requireRiderAuth } from './delivery-auth.routes';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();

function riderId(req: Request): string {
  return (req as Request & { riderId: string }).riderId;
}

// ── Rutas del biker (requieren sesión de Rider) ────────────────────────────

router.get('/orders/available', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getAvailableOrders();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/orders/mine', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getMyOrders(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/orders/history', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getHistory(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/orders/:id', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getOrder(riderId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/orders/:id/claim', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.claimOrder(riderId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/orders/claim-batch', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    const data = await deliveryService.claimOrders(riderId(req), ids);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/orders/:id/release', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deliveryService.releaseOrder(riderId(req), req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/orders/:id/status', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['ASIGNADO', 'RECOGIDO', 'EN_CAMINO', 'ENTREGADO']) }).parse(req.body);
    const data = await deliveryService.setOrderStatus(riderId(req), req.params.id, status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/location', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng } = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
    await deliveryService.updateLocation(riderId(req), lat, lng);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/profile', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getProfile(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/estado', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      enServicio: z.boolean().optional(),
      zonasActivas: z.array(z.string()).optional(),
    }).parse(req.body);
    const result = await deliveryService.updateEstado(riderId(req), data);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/wallet/resumen', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getWalletResumen(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/liquidaciones', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getLiquidaciones(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/liquidaciones', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { metodo } = z.object({ metodo: z.enum(['Efectivo', 'Yape']) }).parse(req.body);
    const data = await deliveryService.solicitarLiquidacion(riderId(req), metodo);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/fuel', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getFuelExpenses(riderId(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/fuel', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { monto, galones } = z.object({ monto: z.coerce.number().positive(), galones: z.coerce.number().positive() }).parse(req.body);
    const data = await deliveryService.addFuelExpense(riderId(req), monto, galones);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/push/subscribe', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscription } = z.object({
      subscription: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) }),
    }).parse(req.body);
    await deliveryService.subscribePush(riderId(req), subscription);
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

router.post('/push/unsubscribe', riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await deliveryService.unsubscribePush(endpoint);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Rutas admin (ERP) ───────────────────────────────────────────────────────

router.get('/admin/riders', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.listRiders();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/admin/riders', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      nombre: z.string().min(2),
      telefono: z.string().min(9),
      pin: z.string().length(4),
    }).parse(req.body);
    const rider = await deliveryService.createRider(data);
    res.status(201).json({ success: true, data: rider });
  } catch (err) { next(err); }
});

router.patch('/admin/riders/:id', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      nombre: z.string().min(2).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      pin: z.string().length(4).optional(),
      motoModelo: z.string().optional(),
      motoPlaca: z.string().optional(),
      motoSoatHasta: z.coerce.date().optional(),
      motoRendimientoKmGalon: z.coerce.number().optional(),
      motoKmTotal: z.coerce.number().optional(),
      motoKmUltimoMantenimiento: z.coerce.number().optional(),
      motoIntervaloMantenimientoKm: z.coerce.number().optional(),
      calificacion: z.coerce.number().min(0).max(5).optional(),
      zonas: z.array(z.string()).optional(),
    }).parse(req.body);
    const rider = await deliveryService.updateRider(req.params.id, data);
    res.json({ success: true, data: rider });
  } catch (err) { next(err); }
});

router.get('/admin/orders/:id/tracking', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.getOrderTracking(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/admin/liquidaciones', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { estado } = z.object({ estado: z.string().optional() }).parse(req.query);
    const data = await deliveryService.listLiquidacionesAdmin(estado);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/admin/liquidaciones/:id/pagar', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await deliveryService.pagarLiquidacion(req.params.id, req.user!.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
