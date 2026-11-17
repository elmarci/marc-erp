import { describe, expect, it } from 'vitest';
import {
  accrualDateFor, formatDocument, isValidRuc, limaPeriod, normalizeDocNumber, parseLegacyDocument,
} from './supplier-doc';

describe('isValidRuc', () => {
  it('acepta RUC reales', () => {
    expect(isValidRuc('20100070970')).toBe(true); // Supermercados Peruanos
    expect(isValidRuc('20331061655')).toBe(true); // Luz del Sur
  });
  it('rechaza dígito verificador, largo o prefijo incorrecto', () => {
    expect(isValidRuc('20100070971')).toBe(false);
    expect(isValidRuc('2010007097')).toBe(false);
    expect(isValidRuc('30100070970')).toBe(false);
    expect(isValidRuc(null)).toBe(false);
  });
});

describe('documento', () => {
  it('normaliza y arma el texto', () => {
    expect(normalizeDocNumber('000123')).toBe('123');
    expect(formatDocument('f001', '123')).toBe('F001-000123');
    expect(formatDocument('B002', '1234567')).toBe('B002-1234567');
    expect(formatDocument(null, null)).toBeNull();
  });
  it('lee textos antiguos', () => {
    expect(parseLegacyDocument('F001-000123')).toEqual({ series: 'F001', number: '123' });
    expect(parseLegacyDocument('b002 45')).toEqual({ series: 'B002', number: '45' });
    expect(parseLegacyDocument('factura 123')).toBeNull();
  });
});

describe('mes del gasto', () => {
  it('usa hora de Lima', () => {
    // 1 nov 03:00 UTC = 31 oct 22:00 en Lima
    expect(limaPeriod(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10');
    expect(limaPeriod(new Date('2026-11-01T06:00:00Z'))).toBe('2026-11');
  });
  it('pasa el gasto al mes que corresponde', () => {
    const paid = new Date('2026-11-05T15:00:00Z');
    expect(accrualDateFor(paid, '2026-11')).toEqual(paid);
    expect(accrualDateFor(paid, '2026-10').toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(accrualDateFor(paid, null)).toEqual(paid);
  });
});
