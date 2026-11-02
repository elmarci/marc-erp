// Formato compartido del ticket: lo usan la vista/impresión del navegador
// (ReceiptModal) y la impresión directa por Bluetooth (ticketEscpos).

// La tienda online (a diferencia del POS) pega el peso al nombre del
// producto, ej. "Arroz Costeño 1kg (2.041 kg)" — así quedó guardado en
// ventas de antes de que existiera item.unit (ver sales.service.ts/
// store.service.ts). Se limpia ese sufijo del nombre mostrado y, si
// item.unit no vino (venta vieja), se recupera la unidad de ahí mismo.
// Ojo: nombres como "Aceite Cocinero 900ml (combo)" NO deben interpretarse
// como granel — sólo se reconoce el paréntesis si termina en una unidad de
// peso/volumen real (kg, g, l, ml) o "und"/"unidad".
export function splitProductNameAndUnit(name: string): { displayName: string; unit: string | null } {
  const match = name.match(/^(.*)\s\([\d.,]+\s*(kg|g|l|ml|und|unidad)\)\s*$/i);
  if (match) return { displayName: match[1].trim(), unit: match[2].toLowerCase() };
  return { displayName: name, unit: null };
}

// La columna Unidad debe leer siempre igual para "no es a granel" — pero
// según de dónde venga (product.bulkUnit configurado como "unidad" en vez
// de "und", o el sufijo legado del nombre) a veces llegaba "und" y otras
// veces "unidad", inconsistencia que se nota fea en el ticket. Se reduce
// siempre a "und"; kg/g/l/ml quedan tal cual.
export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return u === 'unidad' || u === 'unidades' || u === 'u' ? 'und' : u;
}

// Máximo 2 decimales — el peso real se guarda con 3 (ej. 2.041 kg) pero
// mostrar el tercero en el ticket sólo alarga la columna sin aportar nada
// que el cliente necesite ver.
export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}
