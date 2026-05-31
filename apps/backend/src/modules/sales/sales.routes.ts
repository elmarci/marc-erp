import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentMethod, DocumentType } from '@prisma/client';
import { salesService } from './sales.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';

const router = Router();

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  reference: z.string().optional(),
  cardLast4: z.string().length(4).optional(),
});

const createSaleSchema = z.object({
  cashSessionId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  documentType: z.nativeEnum(DocumentType).optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'La venta debe tener al menos un producto'),
  payments: z.array(paymentSchema).min(1, 'Debe registrar al menos un pago'),
  discountAmount: z.number().min(0).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  isCredit: z.boolean().optional(),
  notes: z.string().optional(),
});

const returnSchema = z.object({
  reason: z.string().min(1, 'Motivo requerido'),
  refundMethod: z.nativeEnum(PaymentMethod),
  items: z.array(z.object({
    saleItemId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
  notes: z.string().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  cashSessionId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.string().optional(),
});

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listSchema.parse(req.query);
    const result = await salesService.list(query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSaleSchema.parse(req.body);
    const sale = await salesService.create({ ...input, cashierId: req.user!.sub });
    res.status(201).json({ success: true, data: sale });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await salesService.getById(req.params.id);
    res.json({ success: true, data: sale });
  } catch (err) { next(err); }
});

router.post('/:id/void', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    await salesService.void(req.params.id, reason, req.user!.sub);
    res.json({ success: true, message: 'Venta anulada correctamente.' });
  } catch (err) { next(err); }
});

router.post('/:id/return', authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = returnSchema.parse(req.body);
    const ret = await salesService.processReturn(req.params.id, input, req.user!.sub);
    res.status(201).json({ success: true, data: ret });
  } catch (err) { next(err); }
});

export default router;
