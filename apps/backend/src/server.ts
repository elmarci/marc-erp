import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import morgan from 'morgan';

import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/client';
import { connectRedis, redis } from './config/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Rutas
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import productsRoutes from './modules/products/products.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import salesRoutes from './modules/sales/sales.routes';
import cashRoutes from './modules/cash/cash.routes';
import reportsRoutes from './modules/reports/reports.routes';
import customersRoutes from './modules/customers/customers.routes';
import settingsRoutes from './modules/settings/settings.routes';
import suppliersRoutes from './modules/suppliers/suppliers.routes';
import purchasesRoutes from './modules/purchases/purchases.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import storeRoutes from './modules/store/store.routes';
import promotionsRoutes from './modules/promotions/promotions.routes';

const app = express();
const httpServer = createServer(app);

// Socket.io para sincronización multi-caja
export const io = new SocketServer(httpServer, {
  cors: { origin: env.CORS_ORIGIN, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// ─── Middleware de seguridad ─────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intente más tarde.' },
  },
});
app.use('/api', globalLimiter);

// ─── Middleware general ──────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === '/health',
  }));
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION'] ?? '1.0.0',
      services: { api: 'ok', redis: 'ok' },
    });
  } catch {
    res.status(503).json({ status: 'degraded', services: { api: 'ok', redis: 'error' } });
  }
});

// ─── Rutas API ───────────────────────────────────────────────────────────────
const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/products/categories`, categoriesRoutes);
app.use(`${API_PREFIX}/categories`, categoriesRoutes);
app.use(`${API_PREFIX}/products`, productsRoutes);
app.use(`${API_PREFIX}/sales`, salesRoutes);
app.use(`${API_PREFIX}/cash`, cashRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);
app.use(`${API_PREFIX}/customers`, customersRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/suppliers`, suppliersRoutes);
app.use(`${API_PREFIX}/purchases`, purchasesRoutes);
app.use(`${API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${API_PREFIX}/store`, storeRoutes);
app.use(`${API_PREFIX}/promotions`, promotionsRoutes);

// ─── Swagger docs ────────────────────────────────────────────────────────────
if (env.NODE_ENV === 'development') {
  app.get(`${API_PREFIX}/docs`, (_req, res) => {
    res.json({ message: 'API Documentation - disponible en /api/v1/swagger' });
  });
}

// ─── Manejo de errores ───────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.io eventos ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.debug({ socketId: socket.id }, 'Client connected');

  socket.on('join-register', (registerId: string) => {
    socket.join(`register:${registerId}`);
  });

  socket.on('leave-register', (registerId: string) => {
    socket.leave(`register:${registerId}`);
  });

  socket.on('disconnect', () => {
    logger.debug({ socketId: socket.id }, 'Client disconnected');
  });
});

// ─── Inicio del servidor ─────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await connectDatabase();
    await connectRedis();

    const PORT = Number(process.env.PORT) || env.BACKEND_PORT;
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 ERP Minimarket API corriendo en puerto ${PORT}`);
      logger.info(`📖 Documentación: http://localhost:${PORT}/api/v1/docs`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  httpServer.close(async () => {
    await disconnectDatabase();
    await redis.quit();
    logger.info('Server shut down cleanly.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

bootstrap();

export default app;
