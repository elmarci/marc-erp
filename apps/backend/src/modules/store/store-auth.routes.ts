import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storeAuthService } from './store-auth.service';

const router = Router();

// Middleware to extract customer from JWT
export function storeAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { next(); return; }
  try {
    const customerId = storeAuthService.verifyToken(auth.slice(7));
    (req as Request & { customerId?: string }).customerId = customerId;
    next();
  } catch { next(); }
}

export function requireStoreAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as Request & { customerId?: string }).customerId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar.' } });
    return;
  }
  next();
}

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().min(2),
      phone: z.string().min(9),
      email: z.string().email().optional(),
      password: z.string().min(6),
    }).parse(req.body);
    const result = await storeAuthService.register(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, password } = z.object({
      identifier: z.string().min(1),
      password: z.string().min(1),
    }).parse(req.body);
    const result = await storeAuthService.login(identifier, password);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/profile', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const profile = await storeAuthService.getProfile(customerId);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

router.put('/profile', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const data = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional() }).parse(req.body);
    const profile = await storeAuthService.updateProfile(customerId, data);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

router.post('/addresses', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const data = z.object({
      label: z.string().default('Casa'),
      address: z.string().min(5),
      district: z.string(),
      reference: z.string().optional(),
      isDefault: z.boolean().default(false),
    }).parse(req.body);
    const addr = await storeAuthService.addAddress(customerId, data);
    res.status(201).json({ success: true, data: addr });
  } catch (err) { next(err); }
});

router.delete('/addresses/:id', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    await storeAuthService.deleteAddress(customerId, req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/addresses/:id/default', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const addr = await storeAuthService.setDefaultAddress(customerId, req.params.id);
    res.json({ success: true, data: addr });
  } catch (err) { next(err); }
});

export default router;
