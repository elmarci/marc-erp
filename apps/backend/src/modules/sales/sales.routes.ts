import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentMethod, DocumentType } from '@prisma/client';
import { salesService, CreateSaleInput, ReturnSaleInput, ListSalesQuery } from './sales.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada', CANCELLED: 'Anulada', RETURNED: 'Devuelta', PARTIALLY_RETURNED: 'Devuelta parcial',
};
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', DEBIT_CARD: 'T. Débito', CREDIT_CARD: 'T. Crédito',
  TRANSFER: 'Transferencia', CREDIT: 'Crédito', YAPE: 'Yape', PLIN: 'Plin', OTHER: 'Otro',
};

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
  couponCode: z.string().optional(),
  pointsToRedeem: z.coerce.number().int().min(0).optional(),
  // Venta hecha en el POS mientras no había internet, sincronizada después —
  // no bloquear por stock/sesión ya cerrada, ver sales.service.ts.
  isOfflineSync: z.boolean().optional(),
  offlineCreatedAt: z.coerce.date().optional(),
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
    const query = listSchema.parse(req.query) as ListSalesQuery;
    const result = await salesService.list(query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listSchema.omit({ page: true, limit: true }).parse(req.query);
    const sales = await salesService.exportList(query);

    await sendExcel(res, 'ventas.xlsx', 'Ventas', [
      { header: 'N° Venta', key: 'saleNumber', width: 16 },
      { header: 'Fecha', key: 'createdAt', width: 18 },
      { header: 'Cajero', key: 'cashier', width: 20 },
      { header: 'Cliente', key: 'customer', width: 22 },
      { header: 'Documento', key: 'documentType', width: 12 },
      { header: 'Ítems', key: 'items', width: 8 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
      { header: 'Descuento', key: 'discountAmount', width: 12 },
      { header: 'IGV', key: 'taxAmount', width: 10 },
      { header: 'Total', key: 'totalAmount', width: 12 },
      { header: 'Métodos de pago', key: 'payments', width: 25 },
      { header: 'Fiado', key: 'isCredit', width: 8 },
      { header: 'Pagado', key: 'paidAmount', width: 12 },
      { header: 'Estado', key: 'status', width: 14 },
    ], sales.map((s) => ({
      saleNumber: s.saleNumber,
      createdAt: s.createdAt.toLocaleString('es-PE'),
      cashier: `${s.cashier.firstName} ${s.cashier.lastName}`,
      customer: s.customer ? `${s.customer.firstName} ${s.customer.lastName ?? ''}`.trim() : '',
      documentType: s.documentType,
      items: s._count.items,
      subtotal: Number(s.subtotal),
      discountAmount: Number(s.discountAmount),
      taxAmount: Number(s.taxAmount),
      totalAmount: Number(s.totalAmount),
      payments: s.payments.map((p) => `${PAYMENT_LABELS[p.method] ?? p.method}: S/${Number(p.amount).toFixed(2)}`).join(', '),
      isCredit: s.isCredit ? 'Sí' : 'No',
      paidAmount: Number(s.paidAmount),
      status: STATUS_LABELS[s.status] ?? s.status,
    })));
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSaleSchema.parse(req.body) as Omit<CreateSaleInput, 'cashierId'>;
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
    const input = returnSchema.parse(req.body) as ReturnSaleInput;
    const ret = await salesService.processReturn(req.params.id, input, req.user!.sub);
    res.status(201).json({ success: true, data: ret });
  } catch (err) { next(err); }
});

export default router;
