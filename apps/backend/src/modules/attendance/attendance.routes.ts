import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { attendanceService, MARK_TYPES } from './attendance.service';

const router = Router();
router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

// Cada persona ve su estado del día y marca su propia asistencia.
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await attendanceService.getMine(req.user!.sub) });
  } catch (err) { next(err); }
});

router.post('/mark', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = z.object({ type: z.enum(MARK_TYPES) }).parse(req.body);
    const data = await attendanceService.mark(req.user!.sub, type, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Administración: reporte con tardanzas/faltas y correcciones manuales.
router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({ from: dateStr, to: dateStr, userId: z.string().uuid().optional() }).parse(req.query);
    res.json({ success: true, data: await attendanceService.report(q) });
  } catch (err) { next(err); }
});

router.put('/day', authorize('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      userId: z.string().uuid(),
      workDate: dateStr,
      checkIn: time.nullable().optional(),
      lunchOut: time.nullable().optional(),
      lunchIn: time.nullable().optional(),
      checkOut: time.nullable().optional(),
      note: z.string().max(300).nullable().optional(),
    }).parse(req.body);
    const data = await attendanceService.upsertDay({ ...input, editedById: req.user!.sub });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
