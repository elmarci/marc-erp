import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { cashService } from './cash.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';

const router = Router();

router.use(authenticate);

router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, cashRegisterId, page, limit } = z.object({
      status: z.enum(['OPEN', 'CLOSED']).optional(),
      cashRegisterId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await cashService.listSessions({ status, cashRegisterId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/sessions/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, cashRegisterId } = z.object({
      status: z.enum(['OPEN', 'CLOSED']).optional(),
      cashRegisterId: z.string().uuid().optional(),
    }).parse(req.query);
    const sessions = await cashService.exportSessions({ status, cashRegisterId });

    await sendExcel(res, 'cajas.xlsx', 'Sesiones de Caja', [
      { header: 'Caja', key: 'register', width: 18 },
      { header: 'Cajero', key: 'user', width: 22 },
      { header: 'Estado', key: 'status', width: 10 },
      { header: 'Apertura', key: 'openedAt', width: 18 },
      { header: 'Cierre', key: 'closedAt', width: 18 },
      { header: 'Monto inicial', key: 'openingAmount', width: 14 },
      { header: 'Monto esperado', key: 'expectedAmount', width: 14 },
      { header: 'Monto contado', key: 'closingAmount', width: 14 },
      { header: 'Diferencia', key: 'difference', width: 12 },
      { header: 'N° Ventas', key: 'sales', width: 10 },
      { header: 'N° Movimientos', key: 'movements', width: 14 },
    ], sessions.map((s) => ({
      register: s.cashRegister.name,
      user: `${s.user.firstName} ${s.user.lastName}`,
      status: s.status === 'OPEN' ? 'Abierta' : 'Cerrada',
      openedAt: s.openedAt.toLocaleString('es-PE'),
      closedAt: s.closedAt ? s.closedAt.toLocaleString('es-PE') : '',
      openingAmount: Number(s.openingAmount),
      expectedAmount: s.expectedAmount != null ? Number(s.expectedAmount) : '',
      closingAmount: s.closingAmount != null ? Number(s.closingAmount) : '',
      difference: s.difference != null ? Number(s.difference) : '',
      sales: s._count.sales,
      movements: s._count.movements,
    })));
  } catch (err) { next(err); }
});

router.get('/registers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const registers = await cashService.listRegisters();
    res.json({ success: true, data: registers });
  } catch (err) { next(err); }
});

router.get('/registers/:registerId/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await cashService.getOpenSession(req.params.registerId);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

router.post('/sessions', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashRegisterId, openingAmount, notes } = z.object({
      cashRegisterId: z.string().uuid(),
      openingAmount: z.number().min(0),
      notes: z.string().optional(),
    }).parse(req.body);

    const session = await cashService.openSession(cashRegisterId, req.user!.sub, openingAmount, notes);
    res.status(201).json({ success: true, data: session });
  } catch (err) { next(err); }
});

router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await cashService.getSession(req.params.id);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

router.get('/sessions/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await cashService.getSessionSummary(req.params.id);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.post('/sessions/:id/close', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { closingAmount, notes } = z.object({
      closingAmount: z.number().min(0),
      notes: z.string().optional(),
    }).parse(req.body);

    const session = await cashService.closeSession(req.params.id, closingAmount, notes);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

router.get('/sessions/:id/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const movements = await cashService.getSessionMovements(req.params.id);
    res.json({ success: true, data: movements });
  } catch (err) { next(err); }
});

router.get('/sessions/:id/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sales = await cashService.getSessionSales(req.params.id);
    res.json({ success: true, data: sales });
  } catch (err) { next(err); }
});

router.post('/sessions/:id/movements', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, amount, reason, notes } = z.object({
      type: z.enum(['WITHDRAWAL', 'DEPOSIT']),
      amount: z.number().positive(),
      reason: z.string().min(1),
      notes: z.string().optional(),
    }).parse(req.body);

    const movement = await cashService.addMovement(req.params.id, type, amount, reason, notes);
    res.status(201).json({ success: true, data: movement });
  } catch (err) { next(err); }
});

export default router;
