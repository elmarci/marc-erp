import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { BusinessError } from '../../utils/errors';
import { storeAuthMiddleware, requireStoreAuth } from '../store/store-auth.routes';
import { walletService } from './wallet.service';

const money = z.coerce.number().positive().max(5000).transform((n) => Math.round(n * 100) / 100);

// =============================================================================
// ERP (staff) — /api/v1/wallet
// Cargar, descontar, recarga mensual y aprobar recargas online: solo ADMIN.
// Verificar QR/PIN para cobrar en el POS: cualquier cajero.
// =============================================================================
export const walletAdminRouter = Router();
walletAdminRouter.use(authenticate);

walletAdminRouter.post('/pos/verify-qr', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = z.object({ code: z.string().min(4).max(64) }).parse(req.body);
    res.json({ success: true, data: await walletService.verifyQr(code) });
  } catch (err) { next(err); }
});

walletAdminRouter.post('/pos/verify-pin', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId, pin } = z.object({ customerId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
    res.json({ success: true, data: await walletService.verifyPin(customerId, pin) });
  } catch (err) { next(err); }
});

walletAdminRouter.use(authorizeMinRole('ADMIN'));

walletAdminRouter.get('/customers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await walletService.listWallets() });
  } catch (err) { next(err); }
});

walletAdminRouter.get('/customers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await walletService.getSummary(req.params.id, 200) });
  } catch (err) { next(err); }
});

walletAdminRouter.post('/customers/:id/charge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      amount: money,
      origin: z.enum(['PAGO', 'BENEFICIO']),
      method: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD']).optional(),
      cashSessionId: z.string().uuid().optional(),
      notes: z.string().max(200).optional(),
    }).parse(req.body);
    const m = await walletService.adminCharge(req.params.id, data, req.user!.sub);
    res.status(201).json({ success: true, data: m });
  } catch (err) { next(err); }
});

walletAdminRouter.post('/customers/:id/debit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({ amount: money, reason: z.string().trim().min(3).max(200) }).parse(req.body);
    const m = await walletService.adminDebit(req.params.id, data, req.user!.sub);
    res.status(201).json({ success: true, data: m });
  } catch (err) { next(err); }
});

walletAdminRouter.put('/customers/:id/recurring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      amount: money,
      dayOfMonth: z.coerce.number().int().min(1).max(28),
      isActive: z.boolean().default(true),
    }).parse(req.body);
    const r = await walletService.setRecurring(req.params.id, data, req.user!.sub);
    res.json({ success: true, data: { ...r, amount: Number(r.amount) } });
  } catch (err) { next(err); }
});

walletAdminRouter.delete('/customers/:id/recurring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await walletService.deleteRecurring(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

walletAdminRouter.get('/topups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }).parse(req.query);
    res.json({ success: true, data: await walletService.listTopups(status) });
  } catch (err) { next(err); }
});

walletAdminRouter.post('/topups/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await walletService.approveTopup(req.params.id, req.user!.sub) });
  } catch (err) { next(err); }
});

walletAdminRouter.post('/topups/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
    await walletService.rejectTopup(req.params.id, reason, req.user!.sub);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// =============================================================================
// Tienda (cliente con sesión) — /api/v1/store/wallet
// =============================================================================
export const walletStoreRouter = Router();
walletStoreRouter.use(storeAuthMiddleware, requireStoreAuth);

async function erpCustomerId(req: Request): Promise<string> {
  const storeCustomerId = (req as Request & { customerId: string }).customerId;
  const sc = await prisma.storeCustomer.findUnique({ where: { id: storeCustomerId }, select: { customerId: true } });
  if (!sc?.customerId) throw new BusinessError('Tu cuenta todavía no está enlazada. Cierra sesión y vuelve a entrar.');
  return sc.customerId;
}

walletStoreRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = await erpCustomerId(req);
    const summary = await walletService.getSummary(customerId, 30);
    const topups = await walletService.listCustomerTopups(customerId);
    res.json({
      success: true,
      data: {
        balance: summary.walletBalance,
        hasPin: summary.hasPin,
        monthly: summary.walletRecurring?.isActive
          ? { amount: summary.walletRecurring.amount, dayOfMonth: summary.walletRecurring.dayOfMonth }
          : null,
        movements: summary.movements.map((m) => ({ id: m.id, type: m.type, origin: m.origin, amount: m.amount, balanceAfter: m.balanceAfter, description: m.description, createdAt: m.createdAt })),
        topups,
      },
    });
  } catch (err) { next(err); }
});

walletStoreRouter.post('/topup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      amount: z.coerce.number().min(5).max(1000).transform((n) => Math.round(n * 100) / 100),
      operationNumber: z.string().trim().regex(/^[0-9A-Za-z-]{4,30}$/, 'Número de operación inválido'),
    }).parse(req.body);
    const customerId = await erpCustomerId(req);
    const r = await walletService.requestTopup(customerId, data);
    res.status(201).json({ success: true, data: { id: r.id, amount: Number(r.amount), status: r.status } });
  } catch (err) { next(err); }
});

walletStoreRouter.post('/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos') }).parse(req.body);
    if (/^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123'].includes(pin)) {
      throw new BusinessError('Elige un PIN menos obvio.');
    }
    await walletService.setPin(await erpCustomerId(req), pin);
    res.json({ success: true });
  } catch (err) { next(err); }
});

walletStoreRouter.post('/qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await walletService.createQrCode(await erpCustomerId(req)) });
  } catch (err) { next(err); }
});
