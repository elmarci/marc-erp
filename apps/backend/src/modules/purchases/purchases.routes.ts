import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { purchasesService } from './purchases.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';

const router = Router();
router.use(authenticate);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PENDING_APPROVAL: 'Pend. aprobación', APPROVED: 'Aprobada',
  SENT: 'Enviada', PARTIALLY_RECEIVED: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, supplierId, page, limit } = z.object({
      status: z.string().optional(),
      supplierId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await purchasesService.listOrders({ status, supplierId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, supplierId } = z.object({
      status: z.string().optional(),
      supplierId: z.string().uuid().optional(),
    }).parse(req.query);
    const orders = await purchasesService.exportOrders({ status, supplierId });

    await sendExcel(res, 'compras.xlsx', 'Órdenes de Compra', [
      { header: 'N° Orden', key: 'orderNumber', width: 14 },
      { header: 'Proveedor', key: 'supplier', width: 28 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Fecha creación', key: 'createdAt', width: 18 },
      { header: 'Fecha esperada', key: 'expectedDate', width: 16 },
      { header: 'Fecha recibida', key: 'receivedDate', width: 16 },
      { header: 'Ítems', key: 'items', width: 8 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
      { header: 'IGV', key: 'taxAmount', width: 10 },
      { header: 'Total', key: 'totalAmount', width: 12 },
      { header: 'Factura proveedor', key: 'supplierInvoice', width: 18 },
      { header: 'Registrado por', key: 'user', width: 20 },
    ], orders.map((o) => ({
      orderNumber: o.orderNumber,
      supplier: o.supplier.businessName,
      status: STATUS_LABELS[o.status] ?? o.status,
      createdAt: o.createdAt.toLocaleString('es-PE'),
      expectedDate: o.expectedDate ? o.expectedDate.toLocaleDateString('es-PE') : '',
      receivedDate: o.receivedDate ? o.receivedDate.toLocaleDateString('es-PE') : '',
      items: o._count.items,
      subtotal: Number(o.subtotal),
      taxAmount: Number(o.taxAmount),
      totalAmount: Number(o.totalAmount),
      supplierInvoice: o.supplierInvoice ?? '',
      user: `${o.user.firstName} ${o.user.lastName}`,
    })));
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.getOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      supplierId: z.string().uuid(),
      expectedDate: z.coerce.date().optional(),
      notes: z.string().optional(),
      supplierInvoice: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        orderedQty: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
      })).min(1),
    }).parse(req.body);

    const order = await purchasesService.createOrder(req.user!.sub, data as Parameters<typeof purchasesService.createOrder>[1]);
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/approve', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.approveOrder(req.params.id, req.user!.sub);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.cancelOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/receive', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, notes } = z.object({
      items: z.array(z.object({
        productId: z.string().uuid(),
        receivedQty: z.coerce.number().min(0),
        unitCost: z.coerce.number().min(0),
        isBonus: z.boolean().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
      })).min(1),
      notes: z.string().optional(),
    }).parse(req.body);

    const receipt = await purchasesService.receiveOrder(req.params.id, req.user!.sub, items as Parameters<typeof purchasesService.receiveOrder>[2], notes);
    res.status(201).json({ success: true, data: receipt });
  } catch (err) { next(err); }
});

// "Registrar Compra" — mercadería que ya llegó con factura en mano: aplica
// todo de inmediato (CPP, bonificaciones, kardex) sin pasar por aprobación.
router.post('/direct', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      supplierId: z.string().uuid(),
      documentNumber: z.string().optional(),
      date: z.coerce.date().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
        isBonus: z.boolean().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
      })).min(1),
    }).parse(req.body);

    const order = await purchasesService.createDirectPurchase(req.user!.sub, data);
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.get('/:id/void-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.checkVoidWarnings(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/void', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3, 'Indica el motivo de la anulación.') }).parse(req.body);
    const order = await purchasesService.voidPurchase(req.params.id, req.user!.sub, reason);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

export default router;
