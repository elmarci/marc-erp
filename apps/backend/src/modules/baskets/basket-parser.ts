// Entiende pedidos escritos como "tengo S/ 20 para un desayuno de cuatro
// personas": saca presupuesto, número de personas y ocasión con reglas
// simples (sin IA). Lo que no se entienda queda en null y la tienda lo
// pregunta con botones.

import type { BasketTemplate } from './basket-templates';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNITS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  cien: 100, ciento: 100,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

// "treinta y cinco" → "35", "cuatro" → "4". "un"/"una" solo se convierten
// cuando acompañan a "persona" (si no, "un desayuno" se volvería "1 desayuno").
function wordsToDigits(s: string): string {
  const unitWords = Object.keys(UNITS).filter(w => !['un', 'una'].includes(w)).join('|');
  const tensWords = Object.keys(TENS).join('|');
  let out = s.replace(new RegExp(`\\b(${tensWords})(?: y (${unitWords}))?\\b`, 'g'), (_m, t: string, u?: string) =>
    String(TENS[t] + (u ? UNITS[u] : 0)));
  out = out.replace(new RegExp(`\\b(${unitWords})\\b`, 'g'), (_m, u: string) => String(UNITS[u]));
  out = out.replace(/\b(un|una) (persona|adulto|nino)\b/g, '1 $2');
  return out;
}

const NUM = '(\\d+(?:[.,]\\d{1,2})?)';
const toNumber = (s: string) => Number(s.replace(',', '.'));

export interface ParsedBasketRequest {
  budget: number | null;
  people: number | null;
  occasion: string | null;
}

export function parseBasketRequest(text: string, templates: BasketTemplate[]): ParsedBasketRequest {
  const s = wordsToDigits(normalize(text));

  // ── Presupuesto ──
  let budget: number | null = null;
  let budgetSpan: [number, number] | null = null;
  const budgetPatterns = [
    new RegExp(`s\\s*/\\s*\\.?\\s*${NUM}`),                                   // S/ 20, s/.20
    new RegExp(`${NUM}\\s*(?:soles|sol|lucas|luca|luquitas|nuevos soles)\\b`), // 20 soles
    new RegExp(`(?:presupuesto|tengo|cuento con|gastar|hasta|maximo|con)\\s*(?:de\\s*)?${NUM}(?!\\s*(?:personas?|pers|adultos?|ninos?))`),
  ];
  for (const re of budgetPatterns) {
    const m = re.exec(s);
    if (m) {
      budget = toNumber(m[1]);
      budgetSpan = [m.index, m.index + m[0].length];
      break;
    }
  }

  // ── Personas ── (ignorando el número que ya se usó como presupuesto)
  const rest = budgetSpan ? s.slice(0, budgetSpan[0]) + ' '.repeat(budgetSpan[1] - budgetSpan[0]) + s.slice(budgetSpan[1]) : s;
  let people: number | null = null;
  const peoplePatterns = [
    /(\d+)\s*(?:personas?|pers\b|adultos?|ninos?|hijos?|invitados?|comensales?|integrantes|amigos?|familiares)/,
    /\bsomos\s*(\d+)\b/,
    /\bfamilia de\s*(\d+)\b/,
    /\bpara\s*(\d+)\b/,
    /\bde\s*(\d+)\b(?!\s*(?:soles|sol|lucas))/,
  ];
  for (const re of peoplePatterns) {
    const m = re.exec(rest);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 50) { people = n; break; }
    }
  }
  if (people == null && /\b(para mi|solo yo|para 1)\b/.test(rest)) people = 1;
  if (people == null && /\b(pareja|los dos|mi esposa y yo|mi esposo y yo)\b/.test(rest)) people = 2;

  // ── Ocasión ──
  let occasion: string | null = null;
  for (const t of templates) {
    const words = [t.key, normalize(t.name), ...t.keywords.map(normalize)];
    if (words.some(w => new RegExp(`\\b${escapeRegex(w)}\\b`).test(s))) { occasion = t.key; break; }
  }

  return { budget, people, occasion };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
