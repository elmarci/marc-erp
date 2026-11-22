import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { ValidationError } from '../../utils/errors';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { storeAuthMiddleware, requireStoreAuth } from '../store/store-auth.routes';
import { riderAuthMiddleware, requireRiderAuth } from '../delivery/delivery-auth.routes';
import { CATEGORIAS, mandadosService } from './mandados.service';

// Tres routers: cliente (/store/mandados), repartidor (/delivery/mandados)
// y ERP (/store/admin/mandados).

const customerId = (req: Request) => (req as Request & { customerId?: string }).customerId;
const riderId = (req: Request) => (req as Request & { riderId: string }).riderId;
const key = (req: Request) => (req.query['k'] ?? (req.body as { k?: unknown } | undefined)?.k);

const coord = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const money = z.number().min(0).max(10000);

/* ── Cliente ──────────────────────────────────────────────────────────── */
export const mandadosClienteRouter = Router();
mandadosClienteRouter.use(storeAuthMiddleware);

const createLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

mandadosClienteRouter.post('/cotizar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      conCompra: z.boolean(),
      recojoLat: coord.optional(), recojoLng: lng.optional(),
      entregaLat: coord.optional(), entregaLng: lng.optional(),
    }).parse(req.body);
    res.json({ success: true, data: await mandadosService.cotizar(data) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.post('/', createLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      clienteNombre: z.string().trim().min(2).max(80),
      clienteTelefono: z.string().regex(/^\D*9(\D*\d){8}\D*$/, 'Celular de 9 dígitos que empiece con 9'),
      categoria: z.enum(CATEGORIAS),
      conCompra: z.boolean(),
      recojoNombre: z.string().max(120).optional(),
      recojoDireccion: z.string().max(200).optional(),
      recojoLat: coord.optional(), recojoLng: lng.optional(),
      entregaDireccion: z.string().trim().min(4, 'Escribe la dirección de entrega').max(200),
      entregaReferencia: z.string().max(200).optional(),
      entregaLat: coord.optional(), entregaLng: lng.optional(),
      entregaMapsLink: z.string().max(400).optional(),
      programadoPara: z.coerce.date().optional(),
      nota: z.string().max(500).optional(),
      ofertaCliente: z.number().min(1, 'La oferta mínima es S/ 1').max(200),
      presupuestoMax: money.optional(),
      metodoPago: z.enum(['EFECTIVO', 'YAPE']),
      items: z.array(z.object({
        descripcion: z.string().trim().min(1).max(160),
        cantidad: z.number().positive().max(999),
        unidad: z.string().max(20).optional(),
        precioEstimado: money.optional(),
      })).max(40),
      mayorDeEdad: z.boolean().optional(),
      ventaLibre: z.boolean().optional(),
    }).parse(req.body);
    if (!data.conCompra && !data.recojoDireccion && data.recojoLat == null) {
      throw new ValidationError('Indica de dónde hay que recoger.');
    }
    res.status(201).json({ success: true, data: await mandadosService.crear(data, customerId(req)) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.get('/mios', requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await mandadosService.misMandados(customerId(req)!) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.get('/:codigo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await mandadosService.verCliente(req.params.codigo, key(req), customerId(req)) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.post('/:codigo/oferta', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { monto } = z.object({ monto: z.number().min(1).max(200) }).parse(req.body);
    res.json({ success: true, data: await mandadosService.cambiarOferta(req.params.codigo, key(req), monto, customerId(req)) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.post('/:codigo/aceptar-oferta', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ofertaId } = z.object({ ofertaId: z.string().uuid() }).parse(req.body);
    res.json({ success: true, data: await mandadosService.aceptarContraoferta(req.params.codigo, key(req), ofertaId, customerId(req)) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.post('/:codigo/aprobar-compra', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await mandadosService.aprobarCompra(req.params.codigo, key(req), customerId(req)) });
  } catch (err) { next(err); }
});

mandadosClienteRouter.post('/:codigo/cancelar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { motivo } = z.object({ motivo: z.string().max(200).optional() }).parse(req.body ?? {});
    res.json({ success: true, data: await mandadosService.cancelarCliente(req.params.codigo, key(req), motivo, customerId(req)) });
  } catch (err) { next(err); }
});

/* ── Repartidor ───────────────────────────────────────────────────────── */
export const mandadosRiderRouter = Router();
mandadosRiderRouter.use(riderAuthMiddleware, requireRiderAuth);

const BOLETA_DIR = path.join(process.cwd(), 'uploads', 'mandados');
const boletaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.mimetype)) {
      cb(new ValidationError('La foto debe ser JPG, PNG o WEBP.'));
      return;
    }
    cb(null, true);
  },
});

mandadosRiderRouter.get('/disponibles', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.disponibles(riderId(req)) }); } catch (err) { next(err); }
});
mandadosRiderRouter.get('/mios', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.misActivos(riderId(req)) }); } catch (err) { next(err); }
});
mandadosRiderRouter.get('/historial', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.historial(riderId(req)) }); } catch (err) { next(err); }
});
mandadosRiderRouter.get('/:id', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.verRider(riderId(req), req.params.id) }); } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/aceptar', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.aceptar(riderId(req), req.params.id) }); } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/contraoferta', async (req, res, next) => {
  try {
    const { monto, etaMin, mensaje } = z.object({
      monto: z.number().min(1).max(200), etaMin: z.number().int().min(5).max(240), mensaje: z.string().max(140).optional(),
    }).parse(req.body);
    res.json({ success: true, data: await mandadosService.contraofertar(riderId(req), req.params.id, monto, etaMin, mensaje) });
  } catch (err) { next(err); }
});
mandadosRiderRouter.delete('/:id/contraoferta', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.retirarOferta(riderId(req), req.params.id) }); } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/liberar', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.liberar(riderId(req), req.params.id) }); } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/precios', async (req, res, next) => {
  try {
    const { items } = z.object({
      items: z.array(z.object({ id: z.string().uuid(), precioReal: money.optional(), noHabia: z.boolean().optional() })),
    }).parse(req.body);
    res.json({ success: true, data: await mandadosService.cotizarPrecios(riderId(req), req.params.id, items) });
  } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/comprado', boletaUpload.single('boleta'), async (req, res, next) => {
  try {
    let foto: string | null = null;
    if (req.file) {
      await fs.mkdir(BOLETA_DIR, { recursive: true });
      const filename = `${uuidv4()}.jpg`;
      await sharp(req.file.buffer).rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toFile(path.join(BOLETA_DIR, filename));
      // Ruta relativa: cada app la completa con el dominio del backend.
      foto = `/uploads/mandados/${filename}`;
    }
    res.json({ success: true, data: await mandadosService.marcarComprado(riderId(req), req.params.id, foto) });
  } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/en-camino', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.enCamino(riderId(req), req.params.id) }); } catch (err) { next(err); }
});
mandadosRiderRouter.post('/:id/entregado', async (req, res, next) => {
  try { res.json({ success: true, data: await mandadosService.entregado(riderId(req), req.params.id) }); } catch (err) { next(err); }
});

/* ── ERP ──────────────────────────────────────────────────────────────── */
export const mandadosAdminRouter = Router();
mandadosAdminRouter.use(authenticate, authorizeMinRole('CASHIER'));

mandadosAdminRouter.get('/', async (req, res, next) => {
  try {
    const estado = typeof req.query['estado'] === 'string' && req.query['estado'] ? req.query['estado'] : undefined;
    res.json({ success: true, data: await mandadosService.listAdmin(estado) });
  } catch (err) { next(err); }
});
mandadosAdminRouter.post('/:id/cancelar', async (req, res, next) => {
  try {
    const { motivo } = z.object({ motivo: z.string().min(3).max(200) }).parse(req.body);
    res.json({ success: true, data: await mandadosService.cancelarAdmin(req.params.id, motivo) });
  } catch (err) { next(err); }
});
