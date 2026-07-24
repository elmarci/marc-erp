import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { inventoryService } from './inventory.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { sendExcel } from '../../utils/excel';

const router = Router();
router.use(authenticate);

const STOCK_STATUS_LABELS: Record<string, string> = { ok: 'Normal', low: 'Stock bajo', out: 'Sin stock' };

router.get('/stock/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId, status } = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      status: z.enum(['all', 'ok', 'low', 'out']).optional(),
    }).parse(req.query);
    const products = await inventoryService.exportStock({ search, categoryId, status });

    await sendExcel(res, 'inventario.xlsx', 'Stock', [
      { header: 'Producto', key: 'name', width: 30 },
      { header: 'Código de barras', key: 'barcode', width: 18 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Stock actual', key: 'currentStock', width: 12 },
      { header: 'Stock mínimo', key: 'minStock', width: 12 },
      { header: 'Stock máximo', key: 'maxStock', width: 12 },
      { header: 'Costo', key: 'costPrice', width: 12 },
      { header: 'Precio venta', key: 'salePrice', width: 12 },
      { header: 'Valor total (costo)', key: 'stockValue', width: 16 },
      { header: 'Estado', key: 'stockStatus', width: 12 },
    ], products.map((p) => {
      const stockStatus = p.current_stock === 0 ? 'out' : p.current_stock <= p.min_stock ? 'low' : 'ok';
      return {
        name: p.name,
        barcode: p.barcode ?? '',
        sku: p.sku ?? '',
        category: p.category,
        currentStock: Number(p.current_stock),
        minStock: Number(p.min_stock),
        maxStock: p.max_stock != null ? Number(p.max_stock) : '',
        costPrice: Number(p.cost_price),
        salePrice: Number(p.sale_price),
        stockValue: Number(p.current_stock) * Number(p.cost_price),
        stockStatus: STOCK_STATUS_LABELS[stockStatus],
      };
    }));
  } catch (err) { next(err); }
});

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await inventoryService.getDashboard();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId, status, page, limit } = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      status: z.enum(['all', 'ok', 'low', 'out']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);
    const result = await inventoryService.getStockOverview({ search, categoryId, status, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, type, from, to, page, limit } = z.object({
      productId: z.string().uuid().optional(),
      type: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);
    const result = await inventoryService.listMovements({ productId, type, from, to, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/adjustments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await inventoryService.listAdjustments({ page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/adjustments', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason, notes, items } = z.object({
      reason: z.string().min(3),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        physicalQuantity: z.coerce.number().min(0),
      })).min(1),
    }).parse(req.body);
    const adj = await inventoryService.createAdjustment(req.user!.sub, reason, notes, items as { productId: string; physicalQuantity: number }[]);
    res.status(201).json({ success: true, data: adj });
  } catch (err) { next(err); }
});

router.post('/quick-adjust', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, newQuantity, reason } = z.object({
      productId: z.string().uuid(),
      newQuantity: z.coerce.number().min(0),
      reason: z.string().min(3),
    }).parse(req.body);
    const result = await inventoryService.quickAdjust(req.user!.sub, productId, newQuantity, reason);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/low-stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await inventoryService.getLowStockProducts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
