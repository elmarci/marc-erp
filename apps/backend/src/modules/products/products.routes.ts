import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { ProductStatus, UnitOfMeasure } from '@prisma/client';
import { productsService, CreateProductInput, SearchProductsQuery } from './products.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';

const router = Router();

const PRODUCT_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'products');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(new ValidationError('La imagen debe ser PNG, JPG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  barcode: z.string().max(50).optional(),
  internalCode: z.string().max(50).optional(),
  sku: z.string().max(50).optional(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  taxRateId: z.string().uuid().optional(),
  unitOfMeasure: z.nativeEnum(UnitOfMeasure),
  costPrice: z.number().min(0),
  salePrice: z.number().min(0),
  wholesalePrice: z.number().min(0).optional(),
  minStock: z.number().int().min(0).default(0),
  maxStock: z.number().int().min(0).optional(),
  currentStock: z.number().int().min(0).default(0),
  trackExpiry: z.boolean().default(false),
  trackBatch: z.boolean().default(false),
  isBulk: z.boolean().default(false),
  bulkUnit: z.string().optional(),
  imageUrl: z.union([z.string().url(), z.literal('')]).optional(),
});

const searchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  sortBy: z.enum(['name', 'salePrice', 'currentStock', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

router.use(authenticate);

router.post('/upload-image', authorizeMinRole('WAREHOUSE'), upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No se recibió ninguna imagen.');

    await fs.mkdir(PRODUCT_IMAGE_DIR, { recursive: true });

    const filename = `${uuidv4()}.jpg`;
    await sharp(req.file.buffer)
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(path.join(PRODUCT_IMAGE_DIR, filename));

    // URL absoluta: el campo imageUrl del producto exige una URL completa
    // (la usan tal cual el POS y la tienda online, sin prefijo de origen).
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${filename}`;
    res.json({ success: true, data: { imageUrl } });
  } catch (err) { next(err); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = searchSchema.parse(req.query) as SearchProductsQuery;
    const result = await productsService.search(query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/low-stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await productsService.getLowStockAlerts();
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

router.get('/barcode/:barcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productsService.getByBarcode(req.params.barcode);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productsService.getById(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.post('/', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body) as CreateProductInput;
    if (input.imageUrl === '') input.imageUrl = undefined;
    const product = await productsService.create(input);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.patch('/:id', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: Parameters<typeof productsService.update>[1] =
      createSchema.partial().extend({ status: z.nativeEnum(ProductStatus).optional() }).parse(req.body);
    if (input.imageUrl === '') input.imageUrl = null;
    const product = await productsService.update(req.params.id, input);
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.delete('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await productsService.softDelete(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/:id/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const result = await productsService.getMovements(req.params.id, page, limit);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/:id/adjust-stock', authorizeMinRole('WAREHOUSE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { physicalQuantity, reason, notes } = z.object({
      physicalQuantity: z.number().int().min(0),
      reason: z.string().min(1),
      notes: z.string().optional(),
    }).parse(req.body);

    const result = await productsService.adjustStock(
      req.params.id,
      req.user!.sub,
      physicalQuantity,
      reason,
      notes,
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
