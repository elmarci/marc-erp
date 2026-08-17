import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { purchasesService } from './purchases.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';
import { limaDateFromParam, limaDateToParam } from '../../utils/timezone';

const router = Router();
router.use(authenticate);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador', PENDING_APPROVAL: 'Pend. aprobación', APPROVED: 'Aprobada',
  SENT: 'Enviada', PARTIALLY_RECEIVED: 'Parcial', RECEIVED: 'Recibida', CANCELLED: 'Cancelada',
};

const listFiltersSchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  payerId: z.string().uuid().optional(),
  paymentStatus: z.enum(['PAID', 'PARTIAL', 'CREDIT']).optional(),
  search: z.string().optional(),
  dateFrom: limaDateFromParam,
  dateTo: limaDateToParam,
  dueFrom: limaDateFromParam,
  dueTo: limaDateToParam,
  amountMin: z.coerce.number().min(0).optional(),
  amountMax: z.coerce.number().min(0).optional(),
  onlyPending: z.coerce.boolean().optional(),
  methodUsed: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER', 'CREDITO_PAGADOR', 'MIXTO', 'SIN_PAGO']).optional(),
});

const paymentLegSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'YAPE', 'PLIN', 'TRANSFER', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER']),
  // Solo tiene efecto con method === 'CASH': ata el retiro a esa sesión de
  // caja (caja del día) en vez de Caja General.
  cashSessionId: z.string().uuid().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listFiltersSchema.extend({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      sortBy: z.enum(['createdAt', 'totalAmount', 'orderNumber']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }).parse(req.query);
    const result = await purchasesService.listOrders(filters);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// Saldo consolidado: Caja Efectivo/Yape/Plin + total por pagar a
// proveedores + total por pagar a pagadores. Antes de "/:id".
router.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.getDashboard();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/settlements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId, dateFrom, dateTo } = z.object({
      supplierId: z.string().uuid(),
      dateFrom: limaDateFromParam,
      dateTo: limaDateToParam,
    }).parse(req.query);
    const result = await purchasesService.getSupplierSettlement({ supplierId, dateFrom, dateTo });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listFiltersSchema.parse(req.query);
    const orders = await purchasesService.exportOrders(filters);

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
      createdAt: o.createdAt.toLocaleString('es-PE', { timeZone: 'America/Lima' }),
      expectedDate: o.expectedDate ? o.expectedDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '',
      receivedDate: o.receivedDate ? o.receivedDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '',
      items: o._count.items,
      subtotal: Number(o.subtotal),
      taxAmount: Number(o.taxAmount),
      totalAmount: Number(o.totalAmount),
      supplierInvoice: o.supplierInvoice ?? '',
      user: `${o.user.firstName} ${o.user.lastName}`,
    })));
  } catch (err) { next(err); }
});

// Cuentas por pagar — debe ir antes de "/:id" para no ser tapada por esa ruta.
router.get('/payable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId, page, limit } = z.object({
      supplierId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await purchasesService.listPayable({ supplierId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// Total real adeudado por proveedor (agrupado) — base de la vista nueva de
// Cuentas por Pagar. También antes de "/:id".
router.get('/payable-summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.getPayableSummary();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

const payAmountSchema = z.object({
  legs: z.array(paymentLegSchema).min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/suppliers/:supplierId/statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.getSupplierStatement(req.params.supplierId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/suppliers/:supplierId/pay', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { legs, reference, notes } = payAmountSchema.parse(req.body);
    const result = await purchasesService.payToSupplier(req.params.supplierId, req.user!.sub, legs, reference, notes);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Pagadores (terceros que ponen el dinero de su bolsillo) — también antes de "/:id".
router.get('/payers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.listPayers();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/payers', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().min(1),
      phone: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      creditLimit: z.coerce.number().min(0).optional(),
    }).parse(req.body);
    const payer = await purchasesService.createPayer(data);
    res.status(201).json({ success: true, data: payer });
  } catch (err) { next(err); }
});

router.patch('/payers/:payerId', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
      creditLimit: z.coerce.number().min(0).optional(),
    }).parse(req.body);
    const payer = await purchasesService.updatePayer(req.params.payerId, data);
    res.json({ success: true, data: payer });
  } catch (err) { next(err); }
});

router.get('/payers/:payerId/statement', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await purchasesService.getPayerStatement(req.params.payerId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/payers/:payerId/pay', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { legs, reference, notes } = payAmountSchema.parse(req.body);
    const result = await purchasesService.payToPayer(req.params.payerId, req.user!.sub, legs, reference, notes);
    res.json({ success: true, data: result });
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
      includeTax: z.boolean().default(false),
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

// Corrige cantidad y/o costo cotizado de una línea antes de recibir la
// mercadería (ej. error de tipeo) — sin anular y rehacer toda la orden.
router.patch('/:id/items/:itemId', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      orderedQty: z.coerce.number().positive().optional(),
      unitCost: z.coerce.number().min(0).optional(),
    }).refine((v) => v.orderedQty !== undefined || v.unitCost !== undefined, {
      message: 'Debe indicar orderedQty o unitCost.',
    }).parse(req.body);

    const order = await purchasesService.updateOrderItem(req.params.id, req.params.itemId, data);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// Marca/desmarca una compra como OBSERVADA (discrepancia con el proveedor) —
// mientras esté marcada, queda fuera de los pagos "por monto" (FIFO).
router.patch('/:id/discrepancy', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hasDiscrepancy, notes } = z.object({
      hasDiscrepancy: z.boolean(),
      notes: z.string().optional(),
    }).parse(req.body);
    const order = await purchasesService.setDiscrepancy(req.params.id, hasDiscrepancy, notes);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchasesService.cancelOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

const paymentSchema = z.object({
  paid: z.boolean(),
  legs: z.array(paymentLegSchema).optional(),
}).optional();

router.post('/:id/receive', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, notes, payment, payerId, payerAmount } = z.object({
      items: z.array(z.object({
        productId: z.string().uuid(),
        receivedQty: z.coerce.number().min(0),
        unitCost: z.coerce.number().min(0),
        isBonus: z.boolean().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
      })).min(1),
      notes: z.string().optional(),
      payment: paymentSchema,
      payerId: z.string().uuid().optional(),
      payerAmount: z.coerce.number().positive().optional(),
    }).parse(req.body);

    const receipt = await purchasesService.receiveOrder(
      req.params.id, req.user!.sub, items as Parameters<typeof purchasesService.receiveOrder>[2], notes, payment,
      payerId, payerAmount,
    );
    res.status(201).json({ success: true, data: receipt });
  } catch (err) { next(err); }
});

router.post('/:id/pay', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { legs, reference, notes, payerId, payerAmount } = z.object({
      legs: z.array(paymentLegSchema).default([]),
      reference: z.string().optional(),
      notes: z.string().optional(),
      payerId: z.string().uuid().optional(),
      payerAmount: z.coerce.number().positive().optional(),
    }).parse(req.body);

    const order = await purchasesService.payOrder(req.params.id, req.user!.sub, legs, reference, notes, payerId, payerAmount);
    res.json({ success: true, data: order });
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
      includeTax: z.boolean().default(false),
      items: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
        isBonus: z.boolean().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
      })).min(1),
      payment: paymentSchema,
      // Si un pagador financió toda o parte de esta compra — ver Payer en el
      // schema. payerAmount puede combinarse con `payment` (pago mixto): lo
      // que no cubre el pagador se completa al contado o queda a crédito.
      payerId: z.string().uuid().optional(),
      payerAmount: z.coerce.number().positive().optional(),
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

// Corrige una compra que se registró pagada (efectivo/Yape/etc.) cuando en
// realidad quedó a crédito — sin tocar stock ni costo.
router.post('/:id/revert-payment', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3, 'Indica el motivo de la corrección.') }).parse(req.body);
    const order = await purchasesService.revertPurchasePayment(req.params.id, req.user!.sub, reason);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// Corrige una línea ya recibida: producto, costo unitario y/o bonificación,
// sin anular el resto de la orden.
router.post('/:id/correct-item', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, toProductId, quantity, unitCost, isBonus, reason } = z.object({
      productId: z.string().uuid(),
      toProductId: z.string().uuid().optional(),
      quantity: z.coerce.number().positive().optional(),
      unitCost: z.coerce.number().min(0).optional(),
      isBonus: z.boolean().optional(),
      reason: z.string().min(3, 'Indica el motivo de la corrección.'),
    }).refine((v) => v.toProductId !== undefined || v.quantity !== undefined || v.unitCost !== undefined || v.isBonus !== undefined, {
      message: 'Cambia al menos el producto, la cantidad, el costo unitario o si es bonificación.',
    }).parse(req.body);
    const order = await purchasesService.correctReceivedLine(req.params.id, req.user!.sub, productId, reason, { toProductId, quantity, unitCost, isBonus });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

export default router;
