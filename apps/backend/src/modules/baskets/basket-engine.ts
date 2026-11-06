// Motor de "Arma tu canasta": con el catálogo en stock y una plantilla,
// arma hasta tres propuestas (Económica, Recomendada, Completa) que no
// pasen el presupuesto. Funciones puras (sin base de datos) para poder
// probarlas sin levantar nada.

import { GLOBAL_EXCLUDE, type BasketOption, type BasketSlot, type BasketTemplate } from './basket-templates';
import { escapeRegex, normalize } from './basket-parser';

export interface BasketProduct {
  id: string;
  name: string;
  salePrice: number;
  costPrice: number;
  available: number; // stock menos lo reservado
  isBulk: boolean;
  bulkUnit: string | null;
  popularity: number; // unidades vendidas en los últimos 60 días
}

export interface Candidate {
  product: BasketProduct;
  quantity: number;
  subtotal: number;
  family: number; // qué opción del espacio coincidió (mantequilla, queso...)
}

export interface ProposalItem extends Candidate {
  slotKey: string;
  slotLabel: string;
  alternatives: Candidate[];
}

export interface Proposal {
  key: 'economica' | 'recomendada' | 'completa';
  label: string;
  people: number;
  total: number;
  leftover: number;
  items: ProposalItem[];
}

export interface BasketResult {
  status: 'ok' | 'short' | 'empty';
  people: number;
  budget: number;
  proposals: Proposal[];
  // status = 'short': el presupuesto no alcanza para todas las personas.
  minTotal?: number;      // lo mínimo que cuesta para las personas pedidas
  maxPeople?: number;     // para cuántas sí alcanza (0 = ni para 1)
  missingSlots?: string[]; // espacios obligatorios sin ningún producto en stock
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const wordRegexCache = new Map<string, RegExp>();
function hasWord(name: string, word: string): boolean {
  let re = wordRegexCache.get(word);
  if (!re) {
    // Palabra completa con plural opcional: "pan" no debe atrapar "panetón"
    // ni "pañal" (que normalizado queda "panal").
    re = new RegExp(`\\b${escapeRegex(normalize(word))}(?:es|s)?\\b`);
    wordRegexCache.set(word, re);
  }
  return re.test(name);
}

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(ml|lt|l|kg|gr|g)\b/;
const PACK_RE = /\bx\s*(\d+)\b(?!\s*(?:ml|lt|l|kg|gr|g)\b)/;
const UNIT_MULT: Record<string, number> = { ml: 1, l: 1000, lt: 1000, g: 1, gr: 1, kg: 1000 };

/** Tamaño total (ml o g) de una unidad de venta, leyendo el nombre. */
export function sizeFromName(normName: string): number | null {
  const m = SIZE_RE.exec(normName);
  if (!m) return null;
  const size = Number(m[1].replace(',', '.')) * (UNIT_MULT[m[2]] ?? 1);
  const pack = PACK_RE.exec(normName);
  return size * (pack ? Number(pack[1]) : 1);
}

/** Cuántas piezas trae una unidad de venta ("Huevos x 15" → 15). */
export function piecesFromName(normName: string): number {
  const pack = PACK_RE.exec(normName);
  return pack ? Number(pack[1]) : 1;
}

function bulkFactor(unit: string | null): number | null {
  // Gramos/ml que hay en 1 unidad de venta a granel.
  switch ((unit ?? '').toLowerCase()) {
    case 'kg': case 'l': case 'lt': return 1000;
    case 'g': case 'ml': return 1;
    default: return null;
  }
}

// Un producto que trae más de 5 veces lo necesario no es "para esta comida".
const MAX_OVERSIZE = 5;

/** Cantidad a comprar de un producto para cubrir a `people` personas, o null si no aplica. */
export function quantityFor(option: BasketOption, product: BasketProduct, normName: string, people: number): number | null {
  const roundBulk = (q: number) => Math.max(0.05, Math.ceil(q * 20 - 1e-9) / 20); // de 50 en 50 g

  if (option.mode === 'shared') {
    if (product.isBulk) return null;
    return Math.ceil(people / (option.servesPeople ?? 1));
  }

  if (option.mode === 'units') {
    const pieces = people * (option.perPerson ?? 1);
    if (product.isBulk) {
      const factor = bulkFactor(product.bulkUnit);
      if (!factor || !option.gramsPerUnit) return null;
      return roundBulk((pieces * option.gramsPerUnit) / factor);
    }
    const perItem = piecesFromName(normName);
    if (perItem > pieces * MAX_OVERSIZE) return null; // bandeja de 30 huevos para 1 persona
    return Math.max(1, Math.ceil(pieces / perItem - 1e-9));
  }

  // amount
  const need = people * (option.perPerson ?? 0);
  if (product.isBulk) {
    const factor = bulkFactor(product.bulkUnit);
    if (!factor) return null;
    return roundBulk(need / factor);
  }
  const size = sizeFromName(normName);
  if (size) {
    if (size > need * MAX_OVERSIZE) return null; // saco de 5 kg de arroz para 5 platos
    return Math.max(1, Math.ceil(need / size - 1e-9));
  }
  if (option.fallbackServes) return Math.ceil(people / option.fallbackServes);
  return null;
}

function matchOption(slot: BasketSlot, normName: string): { opt: BasketOption; family: number } | null {
  for (const [family, opt] of slot.options.entries()) {
    if (!opt.include.some(w => hasWord(normName, w))) continue;
    if (opt.exclude?.some(w => hasWord(normName, w))) continue;
    return { opt, family };
  }
  return null;
}

/** Productos posibles para un espacio, del más barato al más caro. */
export function candidatesForSlot(slot: BasketSlot, products: BasketProduct[], people: number): Candidate[] {
  const out: Candidate[] = [];
  for (const product of products) {
    const normName = normalize(product.name);
    if (GLOBAL_EXCLUDE.some(w => hasWord(normName, w))) continue;
    // Nunca empujar ventas con pérdida (costo 0 = desconocido, se permite).
    if (product.salePrice <= 0 || (product.costPrice > 0 && product.salePrice <= product.costPrice)) continue;
    const match = matchOption(slot, normName);
    if (!match) continue;
    const quantity = quantityFor(match.opt, product, normName, people);
    if (quantity == null || quantity > product.available) continue;
    // Una canasta razonable no lleva 12 unidades de lo mismo.
    if (!product.isBulk && quantity > Math.max(6, people * 3)) continue;
    out.push({ product, quantity, subtotal: round2(quantity * product.salePrice), family: match.family });
  }
  return out.sort((a, b) => a.subtotal - b.subtotal || b.product.popularity - a.product.popularity);
}

type Pick = Map<string, Candidate>; // slotKey → elegido

const pickTotal = (pick: Pick) => round2([...pick.values()].reduce((s, c) => s + c.subtotal, 0));
const usedIds = (pick: Pick, exceptSlot?: string) =>
  new Set([...pick.entries()].filter(([k]) => k !== exceptSlot).map(([, c]) => c.product.id));

/** Lo más barato para cada espacio obligatorio, sin repetir producto. */
function cheapestRequired(slots: BasketSlot[], cands: Map<string, Candidate[]>): Pick | null {
  const pick: Pick = new Map();
  for (const slot of slots.filter(s => s.required)) {
    const used = usedIds(pick);
    const c = (cands.get(slot.key) ?? []).find(x => !used.has(x.product.id));
    if (!c) return null;
    pick.set(slot.key, c);
  }
  return pick;
}

/** Cambia cada espacio por su opción preferida (según `rank`) si entra en el presupuesto. */
function upgrade(pick: Pick, slots: BasketSlot[], cands: Map<string, Candidate[]>, budget: number,
  rank: (a: Candidate, b: Candidate) => number, includeOptional: boolean, onlyEmpty = false): Pick {
  const next: Pick = new Map(pick);
  for (const slot of slots) {
    if (!slot.required && !includeOptional) continue;
    if (onlyEmpty && next.has(slot.key)) continue;
    const used = usedIds(next, slot.key);
    const current = next.get(slot.key);
    const base = pickTotal(next) - (current?.subtotal ?? 0);
    const options = (cands.get(slot.key) ?? [])
      .filter(c => !used.has(c.product.id) && base + c.subtotal <= budget + 1e-9)
      .sort(rank);
    if (options[0]) next.set(slot.key, options[0]);
  }
  return next;
}

const SECOND = '#2';

/** Con lo que sobra, un segundo producto en los espacios que lo permiten. */
function addSeconds(pick: Pick, slots: BasketSlot[], cands: Map<string, Candidate[]>, budget: number): Pick {
  const next: Pick = new Map(pick);
  for (const slot of slots) {
    if (!slot.allowSecond || !next.has(slot.key)) continue;
    const used = usedIds(next);
    const room = budget - pickTotal(next);
    const first = next.get(slot.key)!;
    // De otra familia: mantequilla + jamonada, no mantequilla + margarina.
    const c = (cands.get(slot.key) ?? [])
      .filter(x => !used.has(x.product.id) && x.family !== first.family && x.subtotal <= room + 1e-9)
      .sort(byPopularity)[0];
    if (c) next.set(slot.key + SECOND, c);
  }
  return next;
}

/** Lista de espacios con el "segundo" justo después de su espacio original. */
function expandSlots(slots: BasketSlot[]): BasketSlot[] {
  return slots.flatMap(s => s.allowSecond ? [s, { ...s, key: s.key + SECOND, required: false }] : [s]);
}

const byPopularity = (a: Candidate, b: Candidate) =>
  b.product.popularity - a.product.popularity || a.subtotal - b.subtotal;

function toProposal(key: Proposal['key'], label: string, pick: Pick, slots: BasketSlot[],
  cands: Map<string, Candidate[]>, people: number, budget: number): Proposal {
  const total = pickTotal(pick);
  const items: ProposalItem[] = [];
  for (const slot of slots) {
    const c = pick.get(slot.key);
    if (!c) continue;
    const used = usedIds(pick, slot.key);
    const alternatives = (cands.get(slot.key.replace(SECOND, '')) ?? [])
      .filter(a => a.product.id !== c.product.id && !used.has(a.product.id))
      .sort(byPopularity)
      .slice(0, 6);
    items.push({ ...c, slotKey: slot.key, slotLabel: slot.label, alternatives });
  }
  return { key, label, people, total, leftover: round2(budget - total), items };
}

const signature = (p: Proposal) => p.items.map(i => `${i.product.id}:${i.quantity}`).sort().join('|');

export function buildBaskets(template: BasketTemplate, products: BasketProduct[], budget: number, people: number): BasketResult {
  const slots = template.slots;
  const candsFor = (n: number) => new Map(slots.map(s => [s.key, candidatesForSlot(s, products, n)]));
  const cands = candsFor(people);

  const missingSlots = slots.filter(s => s.required && !(cands.get(s.key)?.length)).map(s => s.label);
  if (missingSlots.length) return { status: 'empty', people, budget, proposals: [], missingSlots };

  const base = cheapestRequired(slots, cands);
  if (!base) return { status: 'empty', people, budget, proposals: [], missingSlots: [] };
  const minTotal = pickTotal(base);

  if (minTotal > budget + 1e-9) {
    // No alcanza: ¿para cuántas personas sí?
    let maxPeople = 0;
    let fallback: Proposal | null = null;
    for (let n = people - 1; n >= 1; n--) {
      const c = candsFor(n);
      const p = cheapestRequired(slots, c);
      if (p && pickTotal(p) <= budget + 1e-9) {
        maxPeople = n;
        const rec = upgrade(p, slots, c, budget, byPopularity, true);
        fallback = toProposal('recomendada', `Para ${n} ${n === 1 ? 'persona' : 'personas'}`, rec, slots, c, n, budget);
        break;
      }
    }
    return {
      status: 'short', people, budget, minTotal, maxPeople,
      proposals: [
        ...(fallback ? [fallback] : []),
        toProposal('economica', `Para ${people} personas`, base, slots, cands, people, budget),
      ],
    };
  }

  const economica = toProposal('economica', 'Económica', base, slots, cands, people, budget);
  const recPick = upgrade(base, slots, cands, budget, byPopularity, true);
  const recomendada = toProposal('recomendada', 'Recomendada', recPick, slots, cands, people, budget);
  // Completa: la recomendada + todos los extras que entren + un segundo
  // producto donde la plantilla lo permite (ej. mantequilla y jamonada).
  const fullPick = upgrade(recPick, slots, cands, budget, (a, b) => a.subtotal - b.subtotal, true, true);
  const completa = toProposal('completa', 'Completa', addSeconds(fullPick, slots, cands, budget), expandSlots(slots), cands, people, budget);

  const proposals: Proposal[] = [];
  const seen = new Set<string>();
  for (const p of [recomendada, economica, completa]) {
    const sig = signature(p);
    if (seen.has(sig)) continue;
    seen.add(sig);
    proposals.push(p);
  }
  return { status: 'ok', people, budget, minTotal, proposals };
}
