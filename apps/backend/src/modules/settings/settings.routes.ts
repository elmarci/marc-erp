import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../../database/client';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { redis } from '../../config/redis';
import { ValidationError } from '../../utils/errors';

const router = Router();

router.use(authenticate);

const LOGO_DIR = path.join(process.cwd(), 'uploads', 'logo');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(new ValidationError('El logo debe ser una imagen PNG, JPG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { label: 'asc' }] });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.patch('/', authorizeMinRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { updates } = z.object({ updates: z.record(z.string()) }).parse(req.body);
    const ops = Object.entries(updates).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value, label: key, group: 'general' },
      }),
    );
    await prisma.$transaction(ops);
    await redis.del('settings:*');
    res.json({ success: true, message: 'Configuración actualizada.' });
  } catch (err) { next(err); }
});

router.post('/logo', authorizeMinRole('ADMIN'), upload.single('logo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No se recibió ningún archivo.');

    await fs.mkdir(LOGO_DIR, { recursive: true });

    // Reemplaza el logo anterior (siempre un único archivo activo)
    const existing = await fs.readdir(LOGO_DIR).catch(() => [] as string[]);
    await Promise.all(existing.map((f) => fs.unlink(path.join(LOGO_DIR, f)).catch(() => undefined)));

    const id = uuidv4();
    const filename = `${id}.png`;
    const printFilename = `${id}-print.png`;

    await sharp(req.file.buffer)
      .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(path.join(LOGO_DIR, filename));

    // Versión para el ticket térmico: la impresora es monocroma (blanco/negro
    // puro), así que un logo a color o en escala de grises sale "borroso"
    // porque el driver difumina los grises simulando tonos con puntos.
    // Convertimos a blanco/negro puro (threshold) para que salga nítido.
    await sharp(req.file.buffer)
      .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .normalize()
      .threshold(160)
      .png()
      .toFile(path.join(LOGO_DIR, printFilename));

    const relativeUrl = `/uploads/logo/${filename}`;
    const printRelativeUrl = `/uploads/logo/${printFilename}`;
    const [setting] = await prisma.$transaction([
      prisma.setting.upsert({
        where: { key: 'business_logo_url' },
        update: { value: relativeUrl },
        create: { key: 'business_logo_url', value: relativeUrl, label: 'Logo del Negocio', group: 'business' },
      }),
      prisma.setting.upsert({
        where: { key: 'business_logo_print_url' },
        update: { value: printRelativeUrl },
        create: { key: 'business_logo_print_url', value: printRelativeUrl, label: 'Logo del Negocio (impresión)', group: 'business' },
      }),
    ]);
    await redis.del('settings:*');

    res.json({ success: true, data: setting });
  } catch (err) { next(err); }
});

router.delete('/logo', authorizeMinRole('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await fs.readdir(LOGO_DIR).catch(() => [] as string[]);
    await Promise.all(existing.map((f) => fs.unlink(path.join(LOGO_DIR, f)).catch(() => undefined)));

    const [setting] = await prisma.$transaction([
      prisma.setting.upsert({
        where: { key: 'business_logo_url' },
        update: { value: '' },
        create: { key: 'business_logo_url', value: '', label: 'Logo del Negocio', group: 'business' },
      }),
      prisma.setting.upsert({
        where: { key: 'business_logo_print_url' },
        update: { value: '' },
        create: { key: 'business_logo_print_url', value: '', label: 'Logo del Negocio (impresión)', group: 'business' },
      }),
    ]);
    await redis.del('settings:*');

    res.json({ success: true, data: setting });
  } catch (err) { next(err); }
});

export default router;
