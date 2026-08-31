import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pushService } from './push.service';
import { storeAuthMiddleware } from '../store/store-auth.routes';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();

// Pública — el frontend la necesita para poder llamar pushManager.subscribe().
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ success: true, data: { publicKey: pushService.getPublicKey() } });
});

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// No requiere cuenta — cualquier visitante puede activar avisos. Si además
// inició sesión, storeAuthMiddleware (opcional) deja el customerId enlazado.
router.post('/subscribe', storeAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscription } = z.object({ subscription: subscriptionSchema }).parse(req.body);
    const customerId = (req as Request & { customerId?: string }).customerId;
    await pushService.subscribe(subscription, customerId);
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

router.post('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await pushService.unsubscribe(endpoint);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Rutas protegidas (ERP admin) ────────────────────────────────────────────
// Notificaciones que el admin arma a mano (ej. "Bajo el pollo: S/6.50, pídelo
// ahora") — a diferencia de las automáticas de oferta nueva/hora feliz.

router.get('/admin/subscriber-count', authenticate, authorizeMinRole('SUPERVISOR'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await pushService.getSubscriberCount();
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

router.get('/admin/notifications', authenticate, authorizeMinRole('SUPERVISOR'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await pushService.listScheduledNotifications();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/admin/notifications', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, body, url, scheduledAt } = z.object({
      title: z.string().min(1).max(65),
      body: z.string().min(1).max(180),
      url: z.string().optional(),
      scheduledAt: z.coerce.date(),
    }).parse(req.body);
    const notification = await pushService.scheduleNotification({ title, body, url, scheduledAt, createdById: req.user!.sub });
    res.status(201).json({ success: true, data: notification });
  } catch (err) { next(err); }
});

router.delete('/admin/notifications/:id', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pushService.cancelScheduledNotification(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
