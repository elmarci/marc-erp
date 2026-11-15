import { prisma } from '../database/client';
import { redis } from '../config/redis';
import { nowInLima } from './timezone';

// Correlativos que no se repiten aunque lleguen muchas operaciones en el
// mismo instante. Antes se calculaban como "último + 1" o count()+1 y dos
// ventas simultáneas recibían el mismo número: una fallaba con "ya existe"
// (18 de 20 ventas POS simultáneas en la prueba del 2026-11-13).
//
// Los reparte un contador atómico de Redis (INCR). Si Redis se reinició o
// quedó atrás, el número choca con uno guardado: entonces se alinea el
// contador con el mayor número de la base y se pide otro. Sin Redis, se usa
// la base directamente (y el reintento cubre los choques).

const isDuplicate = (err: unknown) => (err as { code?: string }).code === 'P2002';

/** Sube el contador hasta `value` si estaba por debajo; nunca lo baja. */
async function raiseCounter(key: string, value: number): Promise<void> {
  await redis.eval(
    "local c = tonumber(redis.call('GET', KEYS[1]) or '0') if c < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], ARGV[1]) end return 1",
    1, key, String(value),
  ).catch(() => {});
}

/**
 * Ejecuta `create(número)` con un número nuevo y reintenta con otro si la
 * base dice que ya existe. `maxInDb` devuelve el mayor número usado.
 */
export async function withSequence<T>(
  key: string,
  maxInDb: () => Promise<number>,
  create: (seq: number) => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let seq: number;
    try {
      seq = await redis.incr(key);
      if (seq === 1) {
        // Contador nuevo (primer uso del día o Redis vacío): arrancar desde la base.
        await raiseCounter(key, await maxInDb());
        seq = await redis.incr(key);
      }
      if (ttlSeconds) redis.expire(key, ttlSeconds).catch(() => {});
    } catch {
      seq = (await maxInDb()) + attempt;
    }
    try {
      return await create(seq);
    } catch (err) {
      if (!isDuplicate(err) || attempt >= 10) throw err;
      await raiseCounter(key, await maxInDb());
    }
  }
}

// ── Número de venta: V + AAAAMMDD (Lima) + 5 dígitos, p. ej. V2026111500012 ──
// Lo usan el POS y la confirmación de pedidos web, así ambos comparten un
// solo correlativo diario.
export async function withSaleNumber<T>(create: (saleNumber: string) => Promise<T>): Promise<T> {
  const { year, month, day } = nowInLima();
  const prefix = `V${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const maxInDb = async () => {
    const rows = await prisma.$queryRaw<{ max: string | null }[]>`
      SELECT max(sale_number) AS max FROM sales
      WHERE sale_number LIKE ${prefix + '%'} AND length(sale_number) = ${prefix.length + 5}`;
    return rows[0]?.max ? parseInt(rows[0].max.slice(-5), 10) || 0 : 0;
  };
  return withSequence(`seq:sale:${prefix}`, maxInDb, (seq) => create(`${prefix}${String(seq).padStart(5, '0')}`), 3 * 24 * 3600);
}

// ── Número de pedido web: ORD-00001 ──
export async function withOrderNumber<T>(create: (orderNumber: string) => Promise<T>): Promise<T> {
  const maxInDb = async () => {
    const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
      SELECT max(NULLIF(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::bigint) AS max FROM store_orders`;
    return Number(rows[0]?.max ?? 0);
  };
  return withSequence('store:order:seq', maxInDb, (seq) => create(`ORD-${String(seq).padStart(5, '0')}`));
}
