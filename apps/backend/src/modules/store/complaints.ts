import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../database/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { storeAuthMiddleware } from './store-auth.routes';
import { emitEvent } from '../../config/socket';

// Libro de Reclamaciones virtual.
//  - Público: registro de una hoja nueva (los datos del proveedor los muestra
//    la tienda, en apps/store/src/lib/storeInfo.ts > BUSINESS).
//  - ERP: lista, detalle y respuesta. Una hoja nunca se borra ni se edita;
//    solo se le agrega la respuesta.

export const RESPONSE_BUSINESS_DAYS = 15;

/** Fecha límite de respuesta: 15 días hábiles (lunes a viernes). */
export function responseDeadline(from: Date): Date {
  const d = new Date(from);
  let left = RESPONSE_BUSINESS_DAYS;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

export const complaintCode = (n: number, createdAt: Date) =>
  `${createdAt.getFullYear()}-${String(n).padStart(6, '0')}`;

type ComplaintRow = Awaited<ReturnType<typeof prisma.storeComplaint.findFirstOrThrow>>;
const toJSON = (c: ComplaintRow) => ({
  ...c,
  amount: c.amount == null ? null : Number(c.amount),
  code: complaintCode(c.number, c.createdAt),
  dueAt: responseDeadline(c.createdAt).toISOString(),
});

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const createSchema = z.object({
  kind: z.enum(['RECLAMO', 'QUEJA']),
  consumerName: text(3, 120),
  docType: z.enum(['DNI', 'CE', 'PASAPORTE']),
  docNumber: text(6, 15).regex(/^[A-Za-z0-9]+$/),
  address: text(5, 200),
  phone: text(9, 15).regex(/^[0-9+ ]+$/),
  email: z.string().trim().email().max(120),
  isMinor: z.boolean().default(false),
  guardianName: text(3, 120).optional(),
  itemType: z.enum(['PRODUCTO', 'SERVICIO']),
  amount: z.coerce.number().min(0).max(100000).optional(),
  itemDescription: text(3, 300),
  orderNumber: text(3, 30).optional(),
  detail: text(10, 2000),
  request: text(3, 1000),
}).refine(d => !d.isMinor || !!d.guardianName, { message: 'Falta el nombre del padre, madre o apoderado', path: ['guardianName'] });

export const publicComplaintsRouter = Router();
export const adminComplaintsRouter = Router();

// Pocas hojas por hora por IP: frena el spam sin estorbar a un cliente real.
const complaintLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

publicComplaintsRouter.post('/complaints', complaintLimiter, storeAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSchema.parse(req.body);
    const storeCustomerId = (req as Request & { customerId?: string }).customerId ?? null;
    const created = await prisma.storeComplaint.create({
      data: { ...data, guardianName: data.isMinor ? data.guardianName : null, storeCustomerId },
    });
    emitEvent('store:complaint-created', { id: created.id });
    res.status(201).json({ success: true, data: toJSON(created) });
  } catch (err) { next(err); }
});

adminComplaintsRouter.get('/admin/complaints', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const rows = await prisma.storeComplaint.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json({ success: true, data: rows.map(toJSON) });
  } catch (err) { next(err); }
});

adminComplaintsRouter.post('/admin/complaints/:id/respond', authenticate, authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { response } = z.object({ response: text(10, 3000) }).parse(req.body);
    const current = await prisma.storeComplaint.findUnique({ where: { id: req.params['id'] } });
    if (!current) throw new NotFoundError('Reclamo');
    if (current.status === 'RESPONDIDO') throw new ValidationError('Esta hoja ya fue respondida.');
    const updated = await prisma.storeComplaint.update({
      where: { id: current.id },
      data: { status: 'RESPONDIDO', response, respondedAt: new Date(), respondedById: req.user?.sub ?? null },
    });
    res.json({ success: true, data: toJSON(updated) });
  } catch (err) { next(err); }
});
