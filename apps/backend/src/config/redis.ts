import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error({ err }, '❌ Redis error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export async function connectRedis() {
  try {
    await redis.connect();
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Redis');
    throw error;
  }
}

export const CACHE_TTL = {
  SETTINGS: 3600,       // 1 hora
  CATEGORIES: 3600,     // 1 hora
  PRODUCT_SEARCH: 60,   // 1 minuto
  DASHBOARD: 300,       // 5 minutos
  USER_SESSION: 900,    // 15 minutos
} as const;

export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
}

export async function setCache(key: string, value: unknown, ttl: number): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}

export async function invalidateCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
