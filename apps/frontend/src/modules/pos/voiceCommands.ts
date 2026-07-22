export type VoiceCommand =
  | { type: 'ADD_PRODUCT'; query: string; quantity: number }
  | { type: 'QUERY_PRICE'; query: string }
  | { type: 'SET_PAYMENT_METHOD'; method: string }
  | { type: 'REMOVE_PRODUCT'; query: string }
  | { type: 'CLEAR_CART' }
  | { type: 'PRINT' }
  | { type: 'UNKNOWN'; raw: string };

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

// Alias en español para cada PaymentMethod del backend — "fiado" mapea al
// método CREDIT (venta a crédito), igual que en el selector manual del POS.
const METHOD_ALIASES: Array<[string, string]> = [
  ['efectivo', 'CASH'], ['contado', 'CASH'], ['cash', 'CASH'],
  ['yape', 'YAPE'], ['plin', 'PLIN'],
  ['transferencia', 'TRANSFER'],
  ['débito', 'DEBIT_CARD'], ['debito', 'DEBIT_CARD'],
  ['crédito', 'CREDIT_CARD'], ['credito', 'CREDIT_CARD'],
  ['fiado', 'CREDIT'], ['fiada', 'CREDIT'],
];

const LEADING_ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas']);

// Quita artículos al inicio ("la coca cola" -> "coca cola") — la búsqueda de
// productos hace un contains() literal contra el nombre, así que un artículo
// colado al principio (muy común al hablar) haría que nunca encuentre nada.
function stripLeadingArticles(words: string[]): string[] {
  let i = 0;
  while (i < words.length - 1 && LEADING_ARTICLES.has(words[i])) i++;
  return words.slice(i);
}

function parseQuantity(words: string[]): { quantity: number; rest: string[] } {
  if (words.length === 0) return { quantity: 1, rest: words };
  const first = words[0];
  const asNumber = parseInt(first, 10);
  if (!isNaN(asNumber) && asNumber > 0) return { quantity: asNumber, rest: words.slice(1) };
  if (NUMBER_WORDS[first]) return { quantity: NUMBER_WORDS[first], rest: words.slice(1) };
  return { quantity: 1, rest: words };
}

// Interpreta una frase transcrita (ya en minúsculas por la Web Speech API en
// la mayoría de casos, pero normalizamos igual) en un comando estructurado
// para el POS. Heurística simple por prefijos — suficiente para las frases
// cortas que dice un cajero, no pretende ser un NLU completo.
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = raw.toLowerCase().trim().replace(/[.,!¡¿?]/g, '');

  if (/^(fiado|fiada)$/.test(text)) {
    return { type: 'SET_PAYMENT_METHOD', method: 'CREDIT' };
  }

  if (/^(imprimir|imprime)(\s+(el\s+)?(ticket|recibo|comprobante))?$/.test(text)) {
    return { type: 'PRINT' };
  }

  if (/^(vaciar|limpiar|borrar)\s+(el\s+)?carrito$/.test(text)) {
    return { type: 'CLEAR_CART' };
  }

  const payMatch = text.match(/^(?:cobrar|pagar)(?:\s+(?:con|en))?\s+(.+)$/);
  if (payMatch) {
    const methodText = payMatch[1].trim();
    const found = METHOD_ALIASES.find(([alias]) => methodText.includes(alias));
    if (found) return { type: 'SET_PAYMENT_METHOD', method: found[1] };
  }

  const priceMatch = text.match(/^(?:precio de(?:l| la| los| las)?|cu[aá]nto cuesta(?: el| la| los| las)?|cu[aá]nto vale(?: el| la| los| las)?)\s+(.+)$/);
  if (priceMatch) {
    return { type: 'QUERY_PRICE', query: priceMatch[1].trim() };
  }

  const addMatch = text.match(/^(?:agregar|añadir|agrega|añade|agregue)\s+(.+)$/);
  if (addMatch) {
    const words = addMatch[1].split(/\s+/);
    const { quantity, rest } = parseQuantity(words);
    return { type: 'ADD_PRODUCT', query: stripLeadingArticles(rest).join(' '), quantity };
  }

  const removeMatch = text.match(/^(?:quitar|eliminar|quita|elimina|borra)\s+(.+)$/);
  if (removeMatch) {
    const words = stripLeadingArticles(removeMatch[1].trim().split(/\s+/));
    return { type: 'REMOVE_PRODUCT', query: words.join(' ') };
  }

  return { type: 'UNKNOWN', raw };
}
