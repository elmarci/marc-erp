import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../../database/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { redis, CACHE_TTL } from '../../config/redis';
import { ValidationError } from '../../utils/errors';
import { categoriesService } from './categories.service';

const router = Router();

router.use(authenticate);

const CATEGORY_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'categories');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(new ValidationError('La imagen debe ser PNG, JPG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'categories:all';
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json({ success: true, data: JSON.parse(cached) });
      return;
    }

    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    await redis.setex(cacheKey, CACHE_TTL.CATEGORIES, JSON.stringify(categories));
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

router.get('/flat', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// Árbol completo (incluye inactivas y conteos) para la pantalla de administración
router.get('/manage', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoriesService.getManageTree();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
  imageUrl: z.string().nullable().optional(),
});

router.post('/', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = categorySchema.parse(req.body);
    const category = await categoriesService.create(data);
    res.status(201).json({ success: true, data: category });
  } catch (err) { next(err); }
});

router.put('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    const category = await categoriesService.update(req.params.id, data);
    res.json({ success: true, data: category });
  } catch (err) { next(err); }
});

router.delete('/:id', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await categoriesService.remove(req.params.id);
    res.json({ success: true, message: 'Categoría eliminada.' });
  } catch (err) { next(err); }
});

router.post('/upload-image', authorizeMinRole('ADMIN'), upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No se recibió ninguna imagen.');
    await fs.mkdir(CATEGORY_IMAGE_DIR, { recursive: true });
    const filename = `${uuidv4()}.jpg`;
    await sharp(req.file.buffer)
      .resize(600, 600, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82 })
      .toFile(path.join(CATEGORY_IMAGE_DIR, filename));
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/categories/${filename}`;
    res.json({ success: true, data: { imageUrl } });
  } catch (err) { next(err); }
});

export default router;
