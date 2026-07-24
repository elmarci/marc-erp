import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { suppliersService } from './suppliers.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';

const router = Router();
router.use(authenticate);

const supplierSchema = z.object({
  businessName: z.string().min(2),
  taxId: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  paymentTermDays: z.coerce.number().min(0).default(30),
  notes: z.string().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page, limit } = z.object({
      search: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(500).default(20),
    }).parse(req.query);
    const result = await suppliersService.list({ search, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = z.object({ search: z.string().optional() }).parse(req.query);
    const suppliers = await suppliersService.exportAll({ search });

    await sendExcel(res, 'proveedores.xlsx', 'Proveedores', [
      { header: 'Razón social', key: 'businessName', width: 30 },
      { header: 'RUC', key: 'taxId', width: 14 },
      { header: 'Contacto', key: 'contactName', width: 20 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Teléfono', key: 'phone', width: 14 },
      { header: 'Dirección', key: 'address', width: 30 },
      { header: 'Ciudad', key: 'city', width: 16 },
      { header: 'Plazo de pago (días)', key: 'paymentTermDays', width: 16 },
      { header: 'N° Órdenes', key: 'orders', width: 12 },
      { header: 'Estado', key: 'status', width: 10 },
    ], suppliers.map((s) => ({
      businessName: s.businessName,
      taxId: s.taxId ?? '',
      contactName: s.contactName ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      address: s.address ?? '',
      city: s.city ?? '',
      paymentTermDays: s.paymentTermDays,
      orders: s._count.purchaseOrders,
      status: s.isActive ? 'Activo' : 'Inactivo',
    })));
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await suppliersService.get(req.params.id);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = supplierSchema.parse(req.body) as Parameters<typeof suppliersService.create>[0];
    const supplier = await suppliersService.create(data);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.put('/:id', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = supplierSchema.partial().parse(req.body);
    const supplier = await suppliersService.update(req.params.id, data);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.delete('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await suppliersService.delete(req.params.id);
    res.json({ success: true, message: 'Proveedor eliminado.' });
  } catch (err) { next(err); }
});

/* ── Catálogo de productos por proveedor ──────────────────────────────────── */
router.get('/:id/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await suppliersService.listProducts(req.params.id);
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

router.post('/:id/products', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      productId: z.string().uuid(),
      price: z.coerce.number().min(0),
      supplierSku: z.string().optional(),
      isPreferred: z.boolean().optional(),
    }).parse(req.body);
    const entry = await suppliersService.upsertProduct(req.params.id, data);
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

router.put('/:id/products/:productId', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      price: z.coerce.number().min(0),
      supplierSku: z.string().optional(),
      isPreferred: z.boolean().optional(),
    }).parse(req.body);
    const entry = await suppliersService.upsertProduct(req.params.id, { productId: req.params.productId, ...data });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

router.delete('/:id/products/:productId', authorizeMinRole('SUPERVISOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await suppliersService.removeProduct(req.params.id, req.params.productId);
    res.json({ success: true, message: 'Producto quitado del catálogo del proveedor.' });
  } catch (err) { next(err); }
});

export default router;
