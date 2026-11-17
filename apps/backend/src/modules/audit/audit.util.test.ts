import { describe, expect, it } from 'vitest';
import { diffRecords, onlyIgnoredFields, recordLabel, sanitizeRecord } from './audit.util';

describe('diffRecords', () => {
  it('devuelve solo los campos que cambiaron, con valor anterior y nuevo', () => {
    const d = diffRecords({ id: '1', name: 'Arroz', salePrice: 4.5 }, { id: '1', name: 'Arroz', salePrice: 4.9 });
    expect(d).toEqual({ oldValues: { salePrice: 4.5 }, newValues: { salePrice: 4.9 } });
  });
  it('ignora los campos operativos (stock) y las marcas de tiempo', () => {
    const before = { id: '1', currentStock: 10, updatedAt: new Date('2026-01-01') };
    const after = { id: '1', currentStock: 9, updatedAt: new Date('2026-01-02') };
    expect(diffRecords(before, after, ['currentStock'])).toBeNull();
  });
  it('nunca guarda contraseñas ni PIN, solo que cambiaron', () => {
    const d = diffRecords({ passwordHash: 'aaa', role: 'CASHIER' }, { passwordHash: 'bbb', role: 'CASHIER' });
    expect(d).toEqual({ oldValues: { passwordHash: '(oculto)' }, newValues: { passwordHash: '(cambiado)' } });
  });
  it('compara fechas por su valor', () => {
    const same = diffRecords({ expiryDate: new Date('2026-12-01') }, { expiryDate: new Date('2026-12-01') });
    expect(same).toBeNull();
  });
});

describe('sanitizeRecord', () => {
  it('quita relaciones anidadas y oculta secretos', () => {
    const r = sanitizeRecord({ id: '1', pin: '1234', category: { id: 'c', name: 'Lácteos' }, zonas: ['A', 'B'] });
    expect(r).toEqual({ id: '1', pin: '(oculto)', zonas: ['A', 'B'] });
  });
});

describe('onlyIgnoredFields', () => {
  it('detecta una venta que solo descuenta stock', () => {
    expect(onlyIgnoredFields({ currentStock: { decrement: 2 } }, ['currentStock'])).toBe(true);
    expect(onlyIgnoredFields({ currentStock: 5, salePrice: 3 }, ['currentStock'])).toBe(false);
  });
});

describe('recordLabel', () => {
  it('arma un nombre legible del registro', () => {
    expect(recordLabel('Customer', { firstName: 'Ana', lastName: 'Ruiz' })).toBe('Ana Ruiz');
    expect(recordLabel('Product', { name: 'Leche Gloria 400g' })).toBe('Leche Gloria 400g');
  });
});
