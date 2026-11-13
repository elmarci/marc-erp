import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storeService } from './store.service';
import { authenticate, authorizeMinRole } from '../../middleware/auth';
import { storeAuthMiddleware, requireStoreAuth } from './store-auth.routes';
import { basketService } from '../baskets/basket.service';

const router = Router();

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

router.get('/display-settings', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getDisplaySettings();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, categoryId, excludeId, page, limit } = z.object({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      excludeId: z.string().uuid().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(24),
    }).parse(req.query);
    const result = await storeService.getProducts({ search, categoryId, excludeId, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/products/featured', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().min(1).max(20).default(8) }).parse(req.query);
    const data = await storeService.getFeaturedProducts(limit);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getProductById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getCategories();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// "Arma tu canasta": el cliente escribe "tengo S/ 20 para un desayuno de 4"
// (o elige monto, personas y ocasión con botones) y recibe propuestas con
// productos en stock. Público, como el resto del catálogo.
router.post('/basket-suggest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      text: z.string().trim().max(300).optional(),
      budget: z.coerce.number().min(1).max(2000).optional(),
      people: z.coerce.number().int().min(1).max(50).optional(),
      occasion: z.string().max(40).optional(),
    }).parse(req.body ?? {});
    const data = await basketService.suggest(input);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/offers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await storeService.getActiveOffers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/orders', storeAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      customerName: z.string().min(2),
      customerPhone: z.string().min(9),
      customerEmail: z.string().email().optional(),
      deliveryType: z.enum(['DELIVERY', 'PICKUP']),
      address: z.string().optional(),
      district: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      // PLIN deshabilitado temporalmente en la tienda — no hay cuenta Plin
      // activa todavía; se reactiva agregando el valor de vuelta acá y en
      // CheckoutPage.tsx cuando haya una.
      // YAPE_CONTRAENTREGA = paga por Yape recién cuando le llega el pedido
      // (no antes) — mismo espíritu que CASH pero por Yape en vez de billetes.
      // CARD_CONTRAENTREGA = tarjeta débito/crédito al recibir: el repartidor
      // lleva el POS (o se pasa en caja si recoge en tienda).
      paymentMethod: z.enum(['YAPE', 'CASH', 'YAPE_CONTRAENTREGA', 'CARD_CONTRAENTREGA']),
      // Entrega express (lo antes posible): suma un recargo a la tarifa de
      // envío. La fecha, turno y hora elegidos viajan dentro de `notes`.
      express: z.boolean().optional(),
      // Ubicación GPS opcional que el cliente comparte desde el navegador —
      // nunca se confía en ella para nada crítico, sólo ayuda a la entrega.
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      // Canje de puntos de fidelización — solo tiene efecto si hay sesión
      // (storeAuthMiddleware la resuelve más abajo); un invitado no puede
      // canjear puntos que no tiene forma de tener.
      pointsToRedeem: z.coerce.number().int().min(0).optional(),
      items: z.array(z.object({
        // Acepta UUID normal O IDs de bundle (bundle-offerId-productId)
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0).optional(),
        name: z.string().optional(),
      })).min(1),
    }).parse(req.body);

    // storeAuthMiddleware es opcional (no bloquea invitados) — si hay sesión,
    // el pedido queda enlazado a la cuenta para su historial y beneficios.
    const storeCustomerId = (req as Request & { customerId?: string }).customerId;
    const order = await storeService.createOrder({ ...data, storeCustomerId });
    res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// "Mis pedidos": requiere sesión y devuelve solo los pedidos de esa cuenta.
// El :phone de la ruta ya no se usa (se mantiene para no romper versiones
// de la app que todavía lo mandan).
router.get(['/orders/mine', '/orders/track/:phone'], storeAuthMiddleware, requireStoreAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const orders = await storeService.getOrdersForCustomer(customerId);
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// Pedido por número: completo con ?k=<clave> o con la sesión de quien lo
// hizo; si no, sin datos personales (ver getOrderForViewer).
router.get('/orders/:orderNumber', storeAuthMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    const order = await storeService.getOrderForViewer(req.params.orderNumber, req.query.k, customerId);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── Rutas protegidas (ERP admin) ───────────────────────────────────────────

router.get('/admin/orders', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = z.object({
      status: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);
    const result = await storeService.listOrders({ status, page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/admin/orders/:id/confirm', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashSessionId } = z.object({ cashSessionId: z.string().uuid() }).parse(req.body);
    const result = await storeService.confirmOrder(req.params.id, cashSessionId, req.user!.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.patch('/admin/orders/:id/status', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, paymentStatus } = z.object({
      status: z.string().optional(),
      paymentStatus: z.string().optional(),
    }).parse(req.body);
    const order = await storeService.updateOrderStatus(req.params.id, status!, paymentStatus);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// Datos del paquete físico para el biker (peso/tamaño/tipo/frágil) — los
// llena el staff al preparar el pedido, el cliente nunca los indica.
router.patch('/admin/orders/:id/paquete', authenticate, authorizeMinRole('CASHIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      packageTamano: z.enum(['chico', 'mediano', 'grande']).optional(),
      packageTipo: z.enum(['bolsa', 'caja', 'bulto']).optional(),
      packagePesoKg: z.coerce.number().positive().optional(),
      packageFragil: z.boolean().optional(),
    }).parse(req.body);
    const order = await storeService.updateOrderPackage(req.params.id, data);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

export default router;
