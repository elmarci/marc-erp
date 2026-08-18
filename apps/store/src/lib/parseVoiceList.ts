// Convierte las frases reconocidas por voz (una por pausa del cliente) en una
// lista de nombres de producto sueltos. Cada frase puede traer más de un
// producto si el cliente los dijo de corrido en una sola respiración
// ("cebolla y tomate"), así que además partimos por conectores comunes.
const SEPARATORS = /,| y | e | con | más | tambien | también |;/gi

export function parseVoiceList(chunks: string[]): string[] {
  const items = chunks
    .flatMap(chunk => chunk.split(SEPARATORS))
    .map(s => s.trim())
    .filter(s => s.length >= 2)

  // Sin duplicados (por si el cliente repite un producto), preservando el
  // orden en que los fue diciendo.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (!seen.has(key)) { seen.add(key); unique.push(item) }
  }
  return unique
}
