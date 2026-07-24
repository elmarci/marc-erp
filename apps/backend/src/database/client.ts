import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../config/logger';

// Los campos Decimal (costos, stock a granel, cantidades, etc.) se
// serializan como texto por defecto en JSON.stringify — Prisma lo hace así
// para no perder precisión, pero para el resto del backend y el frontend es
// mucho más simple si viajan como number en las respuestas de la API. Se
// sobreescribe una sola vez acá, antes de que corra cualquier query.
(Prisma.Decimal.prototype as unknown as { toJSON(): number }).toJSON = function (this: InstanceType<typeof Prisma.Decimal>) {
  return this.toNumber();
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

if (process.env.NODE_ENV === 'development') {
  globalForPrisma.prisma = prisma;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('error', (e: any) => {
  logger.error({ err: e }, 'Database error');
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('warn', (e: any) => {
  logger.warn({ msg: e.message }, 'Database warning');
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
