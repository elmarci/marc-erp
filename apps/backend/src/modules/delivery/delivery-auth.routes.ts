import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { deliveryAuthService } from './delivery-auth.service';

const router = Router();

export function riderAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { next(); return; }
  try {
    const riderId = deliveryAuthService.verifyToken(auth.slice(7));
    (req as Request & { riderId?: string }).riderId = riderId;
    next();
  } catch { next(); }
}

export function requireRiderAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as Request & { riderId?: string }).riderId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar.' } });
    return;
  }
  next();
}

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { telefono, pin } = z.object({
      telefono: z.string().min(9),
      pin: z.string().length(4),
    }).parse(req.body);
    const result = await deliveryAuthService.login(telefono, pin);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
