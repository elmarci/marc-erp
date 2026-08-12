// Deriva de qué "familia" es un producto y su tamaño numérico a partir del
// nombre (no hay campo estructurado de tamaño — viene pegado al nombre, ej.
// "Agua de mesa - Cielo 625ml" / "Agua de mesa - Cielo 1L"). Esto permite
// ordenar la tienda por familia + tamaño ascendente en vez de alfabético
// puro, donde "1.5L" quedaba antes que "500ml" solo porque "1" < "5" como
// texto.
export interface ParsedProductSize {
  sizeGroup: string;
  sizeValue: number | null;
}

// Todo normalizado a la unidad base más chica (ml para volumen, g para
// peso) — la comparación entre familias distintas no importa, solo dentro
// de la misma familia (que siempre usa una sola magnitud).
const UNIT_MULTIPLIER: Record<string, number> = {
  ml: 1, l: 1000, lt: 1000,
  g: 1, gr: 1, kg: 1000,
};

// Grupo(nombre sin talla) + número + unidad, anclado al final del string.
// El separador antes del número acepta espacio/guion/coma para cubrir
// formatos como "Detergente - Opal Ultra  430g" o "Agua ... 2,5L".
const SIZE_REGEX = /^(.*?)[\s,-]*(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|lt|Lt|LT|l|L|kg|Kg|KG|gr|Gr|GR|g|G)\.?\s*$/;

export function parseProductSize(rawName: string): ParsedProductSize {
  let s = rawName.trim().replace(/\s+/g, ' ');
  // Descarta sufijos entre paréntesis (ej. "(combo)") de la clave de grupo
  // — así un combo y su versión normal del mismo tamaño caen juntos.
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();

  const match = s.match(SIZE_REGEX);
  if (!match) {
    return { sizeGroup: s.toLowerCase(), sizeValue: null };
  }

  const [, base, numStr, unitRaw] = match;
  const num = parseFloat(numStr.replace(',', '.'));
  const multiplier = UNIT_MULTIPLIER[unitRaw.toLowerCase()] ?? 1;
  const sizeValue = Number.isFinite(num) ? num * multiplier : null;

  const baseTrimmed = base.trim().replace(/[-,]+$/, '').trim();
  return {
    sizeGroup: (baseTrimmed || s).toLowerCase(),
    sizeValue,
  };
}
