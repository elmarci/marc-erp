import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

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

prisma.$on('error', (e) => {
  logger.error({ err: e }, 'Database error');
});

prisma.$on('warn', (e) => {
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
