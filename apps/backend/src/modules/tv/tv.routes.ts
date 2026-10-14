import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { tvService } from './tv.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';

const router = Router();

const TV_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'tv');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      cb(new ValidationError('La imagen debe ser PNG, JPG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

// ── Pública: la TV de la tienda (apps/store, ruta /tv) lee esto cada 5 min ──
router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tvService.getPublicConfig();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Transmisión en vivo ─────────────────────────────────────────────────────
// La TV consulta esto cada pocos segundos (sin sesión, como /config): dice si
// hay algo "ahora mismo" por encima de la rotación (slides elegidas, una
// imagen subida al vuelo o la venta en curso del POS).
router.get('/live', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tvService.getLivePublic();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Quien controla la TV en vivo: supervisor desde el ERP y también el cajero
// desde el POS (mostrar la venta o una promo al cliente que está en caja).
const cashier = [authenticate, authorizeMinRole('CASHIER')];

router.get('/live/state', ...cashier, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await tvService.getLiveAdmin() });
  } catch (err) { next(err); }
});

router.get('/live/options', ...cashier, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await tvService.getLiveOptions() });
  } catch (err) { next(err); }
});

router.put('/live/only', ...cashier, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keys, imageUrl, seconds, footer, minutes } = z.object({
      keys: z.array(z.string().max(80)).max(20).optional(),
      imageUrl: z.string().url().optional(),
      seconds: z.number().int().min(4).max(300).optional(),
      footer: z.boolean().optional(),
      // null = hasta que se vuelva al automático
      minutes: z.number().int().min(1).max(720).nullable(),
    }).refine((v) => (v.keys && v.keys.length > 0) || v.imageUrl, { message: 'Elige qué mostrar.' }).parse(req.body);
    const state = await tvService.setLiveOnly({ keys, imageUrl, seconds, footer, minutes }, req.user!.sub);
    res.json({ success: true, data: { version: state.version } });
  } catch (err) { next(err); }
});

router.put('/live/cart', ...cashier, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, total, customerName, promoKeys } = z.object({
      items: z.array(z.object({
        name: z.string().max(160),
        quantity: z.number(),
        unit: z.string().max(10).nullable().optional(),
        unitPrice: z.number(),
        subtotal: z.number(),
      })).max(200),
      total: z.number(),
      customerName: z.string().max(120).nullable().optional(),
      promoKeys: z.array(z.string().max(80)).max(20).optional(),
    }).parse(req.body);
    const state = await tvService.setLiveCart({
      items: items.map((i) => ({ ...i, unit: i.unit ?? null })), total, customerName, promoKeys,
    }, req.user!.sub);
    res.json({ success: true, data: { version: state.version } });
  } catch (err) { next(err); }
});

router.post('/live/thanks', ...cashier, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { promoKeys } = z.object({ promoKeys: z.array(z.string().max(80)).max(20).optional() }).parse(req.body ?? {});
    const state = await tvService.setLiveThanks(promoKeys ?? [], req.user!.sub);
    res.json({ success: true, data: { version: state.version } });
  } catch (err) { next(err); }
});

router.delete('/live', ...cashier, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await tvService.clearLive();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Admin (ERP → Pantalla TV) ───────────────────────────────────────────────
router.use('/admin', authenticate, authorizeMinRole('SUPERVISOR'));

router.get('/admin/slides', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tvService.getAdminSlides();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

const slideSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  type: z.enum(['OFFER', 'PRODUCTS', 'APP', 'CUSTOM']),
  offerId: z.string().uuid().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  subtitle: z.string().max(240).nullable().optional(),
  label: z.string().max(80).nullable().optional(),
  showFooter: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional().or(z.literal('')),
  productIds: z.array(z.string().uuid()).max(8).default([]),
  autoPage: z.number().int().min(0).max(5).default(0),
  seconds: z.number().int().min(4).max(120),
  isActive: z.boolean(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
}).superRefine((s, ctx) => {
  if (s.type === 'OFFER' && !s.offerId) {
    ctx.addIssue({ code: 'custom', message: 'Falta elegir la promoción.', path: ['offerId'] });
  }
  if (s.type === 'CUSTOM' && !s.title && !s.imageUrl) {
    ctx.addIssue({ code: 'custom', message: 'El aviso necesita un título o una imagen.', path: ['title'] });
  }
  if (s.startsAt && s.endsAt && s.endsAt <= s.startsAt) {
    ctx.addIssue({ code: 'custom', message: 'La fecha de fin debe ser posterior a la de inicio.', path: ['endsAt'] });
  }
});

router.put('/admin/slides', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slides } = z.object({ slides: z.array(slideSchema).max(40) }).parse(req.body);
    const data = await tvService.saveSlides(slides);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/admin/slides', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await tvService.resetToAutomatic();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Imagen para un aviso propio — igual que los banners de oferta, no se recorta
// (artes ya diseñados): solo se reduce si pasa de Full HD.
router.post('/admin/upload-image', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No se recibió ninguna imagen.');
    await fs.mkdir(TV_IMAGE_DIR, { recursive: true });
    const filename = `${uuidv4()}.jpg`;
    await sharp(req.file.buffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toFile(path.join(TV_IMAGE_DIR, filename));
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/tv/${filename}`;
    res.json({ success: true, data: { imageUrl } });
  } catch (err) { next(err); }
});

export default router;
