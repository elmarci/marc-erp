import { redis } from './redis';
import { logger } from './logger';

// Caché de las lecturas públicas de la tienda (catálogo, destacados,
// categorías, ofertas). Sin esto cada visita a la tienda recalculaba "los
// más vendidos" de 30 días y las categorías en Postgres: con ~1.000 personas
// a la vez el servidor se saturaba (prueba de carga del 2026-11-13).
//
// Frescura: cada escritura en productos, categorías, promociones o ajustes
// sube un número de versión (ver bumpCatalogVersion en database/client.ts),
// y las claves llevan esa versión, así que un cambio de precio o stock deja
// de verse viejo al instante. El TTL corto es solo un respaldo por si algo
// escribe por fuera de Prisma (SQL a mano).

const VERSION_KEY = 'store:catalog:ver';
const PREFIX = 'store:catalog';

// Pedidos en curso por clave: si 200 personas piden lo mismo justo cuando la
// caché se vence, se calcula una sola vez y las 200 esperan ese resultado.
const inFlight = new Map<string, Promise<unknown>>();

async function currentVersion(): Promise<string> {
  return (await redis.get(VERSION_KEY)) ?? '0';
}

export async function cachedCatalog<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  let fullKey: string;
  try {
    fullKey = `${PREFIX}:${await currentVersion()}:${key}`;
    const hit = await redis.get(fullKey);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    // Redis caído: la tienda sigue funcionando, solo que sin caché.
    logger.warn({ err }, 'Caché del catálogo no disponible');
    return load();
  }

  const running = inFlight.get(fullKey) as Promise<T> | undefined;
  if (running) return running;

  const job = (async () => {
    try {
      const value = await load();
      redis.setex(fullKey, ttlSeconds, JSON.stringify(value)).catch(() => {});
      return value;
    } finally {
      inFlight.delete(fullKey);
    }
  })();
  inFlight.set(fullKey, job);
  return job;
}

// Las claves viejas no se borran: vencen solas por su TTL.
export function bumpCatalogVersion(): void {
  redis.incr(VERSION_KEY).catch(() => {});
}
