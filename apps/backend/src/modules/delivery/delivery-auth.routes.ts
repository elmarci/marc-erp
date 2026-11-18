import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { deliveryAuthService } from './delivery-auth.service';

const router = Router();

type RiderRequest = Request & { riderId?: string; riderDeviceId?: string };

export async function riderAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { next(); return; }
  try {
    const session = await deliveryAuthService.verifyToken(auth.slice(7));
    if (session) {
      (req as RiderRequest).riderId = session.riderId;
      (req as RiderRequest).riderDeviceId = session.deviceId;
    }
    next();
  } catch (err) { next(err); }
}

export function requireRiderAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as RiderRequest).riderId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tu sesión terminó. Vuelve a ingresar.' } });
    return;
  }
  next();
}

// Tope por IP además del bloqueo por cuenta (5 PIN errados = 15 min).
const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(env.RATE_LIMIT_LOGIN_MAX, 10),
  // Solo cuentan los intentos fallidos: varios repartidores entrando desde
  // el wifi de la tienda no se bloquean entre sí.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Demasiados intentos desde esta conexión. Espera unos minutos.' } },
});

const credentials = z.object({
  telefono: z.string().min(9).max(15).transform((v) => v.replace(/\s/g, '')),
  // Los PIN antiguos son de 4 dígitos: entran una vez y la app pide crear uno de 6.
  pin: z.string().regex(/^(\d{4}|\d{6})$/),
  deviceSecret: z.string().min(32).max(128),
  dispositivo: z.string().max(120).default('Celular'),
});

router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { telefono, pin, deviceSecret, dispositivo } = credentials.parse(req.body);
    const result = await deliveryAuthService.login(telefono, pin, deviceSecret, dispositivo, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/activate', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = credentials.extend({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const result = await deliveryAuthService.activate(data.telefono, data.pin, data.deviceSecret, data.code, data.dispositivo, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/change-pin', loginLimiter, riderAuthMiddleware, requireRiderAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPin, newPin } = z.object({ currentPin: z.string().regex(/^\d{4,6}$/), newPin: z.string() }).parse(req.body);
    await deliveryAuthService.changePin((req as RiderRequest).riderId!, currentPin, newPin);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
