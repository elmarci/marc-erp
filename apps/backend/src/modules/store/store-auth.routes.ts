import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { storeAuthService } from './store-auth.service';

const router = Router();

type StoreReq = Request & { customerId?: string; customerEmailVerified?: boolean };

const limitMessage = (minutes: number) => ({
  success: false,
  error: { code: 'RATE_LIMIT', message: `Demasiados intentos. Vuelve a intentarlo en ${minutes} minutos.` },
});

// Límites por IP (y por cuenta en el login) contra adivinar contraseñas o
// códigos y contra el envío masivo de correos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.identifier ?? '').trim().toLowerCase()}`,
  message: limitMessage(15),
});
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: limitMessage(15),
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: limitMessage(60),
});
const sendCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 6, standardHeaders: true, legacyHeaders: false, message: limitMessage(15),
});
const checkCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: limitMessage(15),
});

// Lee el token si viene. Un token vencido, de una cuenta desactivada o
// anterior a un cambio de contraseña se ignora (la petición sigue como
// invitado); requireStoreAuth decide si la ruta exige sesión.
export async function storeAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { next(); return; }
  try {
    const { id, emailVerified } = await storeAuthService.verifyToken(auth.slice(7));
    (req as StoreReq).customerId = id;
    (req as StoreReq).customerEmailVerified = emailVerified;
  } catch { /* sin sesión */ }
  next();
}

export function requireStoreAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as StoreReq).customerId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar.' } });
    return;
  }
  next();
}

// Datos sensibles (compras, puntos) solo con el correo verificado.
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!(req as StoreReq).customerEmailVerified) {
    res.status(403).json({ success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirma tu correo para continuar.' } });
    return;
  }
  next();
}

const phoneSchema = z.string().trim().min(9).max(20);
const passwordSchema = z.string().min(1).max(72);

router.post('/register', registerLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().trim().min(2).max(80),
      phone: phoneSchema,
      email: z.string().trim().email('Ingresa un correo válido.').max(120),
      password: passwordSchema,
    }).parse(req.body);
    const result = await storeAuthService.register(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/login', loginIpLimiter, loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, password } = z.object({
      identifier: z.string().trim().min(1).max(120),
      password: passwordSchema,
    }).parse(req.body);
    const result = await storeAuthService.login(identifier, password);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/google', loginIpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken, phone, name } = z.object({
      idToken: z.string().min(1),
      phone: phoneSchema.optional(),
      name: z.string().trim().min(2).max(80).optional(),
    }).parse(req.body);
    const result = await storeAuthService.loginWithGoogle(idToken, phone, name);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Verificación de correo ──
router.post('/email/send-code', sendCodeLimiter, storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = z.object({ email: z.string().trim().email('Ingresa un correo válido.').max(120).optional() }).parse(req.body ?? {});
    const result = await storeAuthService.sendEmailCode((req as StoreReq).customerId!, email);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/email/verify', checkCodeLimiter, storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos.') }).parse(req.body);
    const customer = await storeAuthService.verifyEmail((req as StoreReq).customerId!, code);
    res.json({ success: true, data: { customer } });
  } catch (err) { next(err); }
});

// ── Recuperación de contraseña ──
router.post('/password/forgot', sendCodeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier } = z.object({ identifier: z.string().trim().min(3).max(120) }).parse(req.body);
    const result = await storeAuthService.forgotPassword(identifier);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/password/reset', checkCodeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, code, password } = z.object({
      identifier: z.string().trim().min(3).max(120),
      code: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos.'),
      password: passwordSchema,
    }).parse(req.body);
    const result = await storeAuthService.resetPassword(identifier, code, password);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/password/change', checkCodeLimiter, storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().max(72).default(''),
      newPassword: passwordSchema,
    }).parse(req.body);
    const result = await storeAuthService.changePassword((req as StoreReq).customerId!, currentPassword, newPassword);
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

// Reporte de consumos — "cuánto compré de X producto entre estas fechas".
// Por defecto, los últimos 90 días si no se especifica rango.
router.get('/consumption-report', storeAuthMiddleware, requireStoreAuth, requireVerifiedEmail, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const { from, to } = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(req.query);
    const now = new Date();
    const rangeTo = to ?? now;
    const rangeFrom = from ?? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const report = await storeAuthService.getConsumptionReport(customerId, rangeFrom, rangeTo);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.put('/profile', storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const data = z.object({ name: z.string().trim().min(2).max(80).optional() }).parse(req.body);
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
