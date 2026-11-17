import { describe, expect, it } from 'vitest';
import { limaDaysUntil } from './inventory-alerts.service';

describe('limaDaysUntil', () => {
  const expiry = new Date('2026-11-22T00:00:00.000Z');
  it('cuenta días de calendario en Lima', () => {
    expect(limaDaysUntil(expiry, new Date('2026-11-17T16:00:00Z'))).toBe(5);
  });
  it('a las 9 pm en Lima sigue siendo el mismo día', () => {
    // 2026-11-17 21:30 Lima = 2026-11-18 02:30 UTC
    expect(limaDaysUntil(expiry, new Date('2026-11-18T02:30:00Z'))).toBe(5);
  });
  it('el día del vencimiento es 0 y el siguiente es -1', () => {
    expect(limaDaysUntil(expiry, new Date('2026-11-22T15:00:00Z'))).toBe(0);
    expect(limaDaysUntil(expiry, new Date('2026-11-23T15:00:00Z'))).toBe(-1);
  });
});
