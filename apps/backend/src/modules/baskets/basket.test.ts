import { describe, expect, it } from 'vitest';
import { parseBasketRequest } from './basket-parser';
import { buildBaskets, sizeFromName, type BasketProduct } from './basket-engine';
import { DEFAULT_BASKET_TEMPLATES } from './basket-templates';

const T = DEFAULT_BASKET_TEMPLATES;
const desayuno = T.find(t => t.key === 'desayuno')!;

describe('parseBasketRequest', () => {
  it('entiende el ejemplo base', () => {
    expect(parseBasketRequest('tengo S/ 20 para un desayuno de cuatro personas', T))
      .toEqual({ budget: 20, people: 4, occasion: 'desayuno' });
  });
  it('soles en palabras y "somos"', () => {
    expect(parseBasketRequest('Somos 6, tengo treinta y cinco soles para el almuerzo', T))
      .toEqual({ budget: 35, people: 6, occasion: 'almuerzo' });
  });
  it('lucas, "para N" y lonche', () => {
    expect(parseBasketRequest('15 lucas lonche para 3', T))
      .toEqual({ budget: 15, people: 3, occasion: 'lonche' });
  });
  it('deja en null lo que no entiende', () => {
    expect(parseBasketRequest('algo rico', T)).toEqual({ budget: null, people: null, occasion: null });
  });
  it('no confunde el presupuesto con las personas', () => {
    expect(parseBasketRequest('desayuno con 25', T)).toEqual({ budget: 25, people: null, occasion: 'desayuno' });
  });
});

describe('sizeFromName', () => {
  it('lee tamaños y packs', () => {
    expect(sizeFromName('leche gloria 1l')).toBe(1000);
    expect(sizeFromName('yogurt 180 ml x 6')).toBe(1080);
    expect(sizeFromName('pan frances')).toBeNull();
  });
});

let n = 0;
const p = (name: string, salePrice: number, extra: Partial<BasketProduct> = {}): BasketProduct => ({
  id: `p${++n}`, name, salePrice, costPrice: salePrice * 0.8, available: 100,
  isBulk: false, bulkUnit: null, popularity: 0, ...extra,
});

const catalog: BasketProduct[] = [
  p('Pan Francés', 0.3, { popularity: 500 }),
  p('Pan de Molde Bimbo 500g', 8.5),
  p('Panetón D\'Onofrio 900g', 30),
  p('Leche Gloria Entera 1L', 5.2, { popularity: 40 }),
  p('Leche Laive Entera 1L', 4.9),
  p('Mantequilla Gloria 100g', 3.8, { popularity: 20 }),
  p('Jamonada Laive 100g', 3.0, { popularity: 30 }),
  p('Plátano de seda', 0.5),
  p('Cerveza Pilsen 630ml', 6),
  p('Queso La Preferida crema 200g', 4, { costPrice: 5 }), // bajo costo: no entra
];

describe('buildBaskets', () => {
  it('arma propuestas dentro del presupuesto', () => {
    const r = buildBaskets(desayuno, catalog, 20, 4);
    expect(r.status).toBe('ok');
    expect(r.proposals.length).toBeGreaterThan(0);
    for (const prop of r.proposals) {
      expect(prop.total).toBeLessThanOrEqual(20);
      const names = prop.items.map(i => i.product.name);
      expect(names.some(x => x.startsWith('Pan'))).toBe(true);
      expect(names).not.toContain('Panetón D\'Onofrio 900g');
      expect(names).not.toContain('Cerveza Pilsen 630ml');
      expect(names).not.toContain('Queso La Preferida crema 200g');
    }
    const eco = r.proposals.find(x => x.key === 'economica')!;
    const pan = eco.items.find(i => i.slotKey === 'pan')!;
    expect(pan.product.name).toBe('Pan Francés');
    expect(pan.quantity).toBe(8);
    const leche = eco.items.find(i => i.slotKey === 'bebida')!;
    expect(leche.product.name).toBe('Leche Laive Entera 1L');
    expect(leche.quantity).toBe(1);
  });

  it('avisa cuando no alcanza y dice para cuántos sí', () => {
    const r = buildBaskets(desayuno, catalog, 9, 6);
    expect(r.status).toBe('short');
    expect(r.maxPeople).toBeGreaterThan(0);
    expect(r.maxPeople).toBeLessThan(6);
    expect(r.minTotal).toBeGreaterThan(9);
  });

  it('respeta el stock disponible', () => {
    const poco = catalog.map(x => x.name === 'Pan Francés' ? { ...x, available: 3 } : x);
    const r = buildBaskets(desayuno, poco, 30, 4);
    const pan = r.proposals[0].items.find(i => i.slotKey === 'pan')!;
    expect(pan.product.name).toBe('Pan de Molde Bimbo 500g');
  });

  it('dice qué falta si no hay productos para un espacio obligatorio', () => {
    const r = buildBaskets(desayuno, catalog.filter(x => !x.name.startsWith('Leche')), 20, 4);
    expect(r.status).toBe('empty');
    expect(r.missingSlots).toEqual(['Bebida']);
  });

  it('vende a granel por kg', () => {
    const granel = [...catalog.filter(x => !x.name.startsWith('Pan')), p('Pan francés', 9, { isBulk: true, bulkUnit: 'kg' })];
    const r = buildBaskets(desayuno, granel, 30, 4);
    const pan = r.proposals[0].items.find(i => i.slotKey === 'pan')!;
    expect(pan.quantity).toBe(0.3); // 8 panes × 35 g = 280 g → 0.30 kg
  });

  it('no propone empaques gigantes para pocas personas', () => {
    const almuerzo = T.find(t => t.key === 'almuerzo')!;
    const cat = [p('Arroz Costeño 5kg', 22), p('Arroz Costeño 750g', 4.5), p('Huevos x 30', 15), p('Huevos x 6', 3.5)];
    const r = buildBaskets(almuerzo, cat, 50, 2);
    const names = r.proposals.flatMap(x => x.items.map(i => i.product.name));
    expect(names).not.toContain('Arroz Costeño 5kg');
    expect(names).not.toContain('Huevos x 30');
  });

  it('la Completa suma un segundo acompañante si sobra', () => {
    const r = buildBaskets(desayuno, catalog, 30, 4);
    const completa = r.proposals.find(x => x.key === 'completa')!;
    const acomp = completa.items.filter(i => i.slotKey.startsWith('acompanante'));
    expect(acomp.length).toBe(2);
    expect(completa.total).toBeLessThanOrEqual(30);
  });
});
