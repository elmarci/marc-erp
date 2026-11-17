import { describe, expect, it } from 'vitest';
import { buildIncomeTotals, changePercent, limitStatus, percentOf, previousRange } from './finance.util';

const lima = (s: string) => new Date(`${s}-05:00`);

describe('limitStatus (tope NRUS)', () => {
  it('avisa desde el 80 % y marca excedido al pasar el tope', () => {
    expect(limitStatus(6399.99, 8000)).toBe('OK');
    expect(limitStatus(6400, 8000)).toBe('WARNING');
    expect(limitStatus(8000, 8000)).toBe('WARNING');
    expect(limitStatus(8000.01, 8000)).toBe('OVER');
  });
  it('sin tope configurado no alerta', () => {
    expect(limitStatus(99999, 0)).toBe('OK');
  });
  it('calcula el porcentaje con un decimal', () => {
    expect(percentOf(14109.17, 8000)).toBe(176.4);
  });
});

describe('previousRange', () => {
  it('un mes completo se compara con el mes anterior completo', () => {
    const prev = previousRange(lima('2026-10-01T00:00:00'), lima('2026-10-31T23:59:59.999'));
    expect(prev.from.toISOString()).toBe(lima('2026-09-01T00:00:00').toISOString());
    expect(prev.to.toISOString()).toBe(lima('2026-09-30T23:59:59.999').toISOString());
  });
  it('enero se compara con diciembre del año anterior', () => {
    const prev = previousRange(lima('2026-01-01T00:00:00'), lima('2026-01-31T23:59:59.999'));
    expect(prev.from.toISOString()).toBe(lima('2025-12-01T00:00:00').toISOString());
  });
  it('lo que va del mes se compara con los mismos días del mes anterior', () => {
    const prev = previousRange(lima('2026-11-01T00:00:00'), lima('2026-11-16T23:59:59.999'));
    expect(prev.from.toISOString()).toBe(lima('2026-10-01T00:00:00').toISOString());
    expect(prev.to.toISOString()).toBe(lima('2026-10-16T23:59:59.999').toISOString());
  });
  it('el 31 de marzo (mes completo) se compara con todo febrero', () => {
    const prev = previousRange(lima('2026-03-01T00:00:00'), lima('2026-03-31T23:59:59.999'));
    expect(prev.to.toISOString()).toBe(lima('2026-02-28T23:59:59.999').toISOString());
  });
  it('un rango cualquiera se compara con los mismos días anteriores', () => {
    const prev = previousRange(lima('2026-11-10T00:00:00'), lima('2026-11-16T23:59:59.999'));
    expect(prev.from.toISOString()).toBe(lima('2026-11-03T00:00:00').toISOString());
    expect(prev.to.toISOString()).toBe(lima('2026-11-09T23:59:59.999').toISOString());
  });
});

describe('buildIncomeTotals', () => {
  it('resta devoluciones, costo, gastos y mermas, y suma el neto de delivery', () => {
    const t = buildIncomeTotals({
      grossSales: 1000, returns: 50, cogs: 700, expenses: 120, inventoryLosses: 30, deliveryIncome: 40, riderPayments: 25,
    });
    expect(t.netSales).toBe(950);
    expect(t.grossProfit).toBe(250);
    expect(t.grossMarginPercent).toBe(26.3);
    expect(t.deliveryNet).toBe(15);
    expect(t.netProfit).toBe(115);
  });
  it('sin ventas no divide entre cero', () => {
    const t = buildIncomeTotals({ grossSales: 0, returns: 0, cogs: 0, expenses: 100, inventoryLosses: 0, deliveryIncome: 0, riderPayments: 0 });
    expect(t.netProfit).toBe(-100);
    expect(t.netMarginPercent).toBe(0);
  });
});

describe('changePercent', () => {
  it('compara contra el período anterior', () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(50, 0)).toBeNull();
  });
});
