import { describe, expect, it } from 'vitest';
import { purchaseTaxFactor, round2, round4, weightedAverageCost } from './costing';

describe('weightedAverageCost', () => {
  it('promedia el stock existente con lo que entra', () => {
    // 10 und a S/ 2 + 10 und a S/ 4 → S/ 3
    expect(weightedAverageCost(10, 2, 10, 4)).toBe(3);
  });
  it('una bonificación (costo 0) baja el promedio sin cambiar el total pagado', () => {
    expect(weightedAverageCost(10, 3, 5, 0)).toBe(2);
  });
  it('sin stock previo el costo es el de la compra', () => {
    expect(weightedAverageCost(0, 9.99, 6, 2.5)).toBe(2.5);
    expect(weightedAverageCost(-3, 9.99, 6, 2.5)).toBe(2.5);
  });
  it('si no queda stock positivo conserva el costo anterior', () => {
    expect(weightedAverageCost(-10, 4, 5, 2)).toBe(4);
  });
});

describe('purchaseTaxFactor', () => {
  it('suma el IGV al costo cuando el negocio no lo recupera (NRUS)', () => {
    expect(purchaseTaxFactor(100, 18, true)).toBeCloseTo(1.18, 10);
  });
  it('no cambia el costo si la compra no trae IGV', () => {
    expect(purchaseTaxFactor(100, 0, true)).toBe(1);
  });
  it('no cambia el costo si el negocio sí recupera el IGV', () => {
    expect(purchaseTaxFactor(100, 18, false)).toBe(1);
  });
  it('no divide entre cero en una compra solo de bonificaciones', () => {
    expect(purchaseTaxFactor(0, 0, true)).toBe(1);
  });
});

describe('redondeos', () => {
  it('redondea a 2 y 4 decimales sin errores de punto flotante', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round4(2.36 * 1.18)).toBe(2.7848);
  });
});
