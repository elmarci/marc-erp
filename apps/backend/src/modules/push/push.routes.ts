import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pushService } from './push.service';
import { storeAuthMiddleware } from '../store/store-auth.routes';

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

export default router;
