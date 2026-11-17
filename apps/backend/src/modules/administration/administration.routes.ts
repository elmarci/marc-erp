import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { parseLimaDate } from '../../utils/timezone';
import { administrationService } from './administration.service';
import { auditService } from '../audit/audit.service';

const router = Router();
router.use(authenticate);

// Lista de motivos de ajuste: la usa Inventario (almacén también ajusta).
router.get('/adjustment-reasons', (_req: Request, res: Response) => {
  res.json({ success: true, data: administrationService.adjustmentReasons() });
});

// Los números del negocio y el historial de cambios son solo para administración.
router.use(authorizeMinRole('ADMIN'));

router.get('/regime-control', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year } = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() }).parse(req.query);
    res.json({ success: true, data: await administrationService.getRegimeControl(year) });
  } catch (err) { next(err); }
});

router.get('/income-statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = z.object({
      from: z.string().transform((s) => parseLimaDate(s.slice(0, 10), false)),
      to: z.string().transform((s) => parseLimaDate(s.slice(0, 10), true)),
    }).parse(req.query);
    res.json({ success: true, data: await administrationService.getIncomeStatement({ from, to }) });
  } catch (err) { next(err); }
});

router.get('/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = z.object({
      resource: z.string().optional(),
      action: z.string().optional(),
      userId: z.string().uuid().optional(),
      search: z.string().optional(),
      from: z.string().transform((s) => parseLimaDate(s.slice(0, 10), false)).optional(),
      to: z.string().transform((s) => parseLimaDate(s.slice(0, 10), true)).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
    }).parse(req.query);
    res.json({ success: true, ...(await auditService.list(filters)) });
  } catch (err) { next(err); }
});

export default router;
