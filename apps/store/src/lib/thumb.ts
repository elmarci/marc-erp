// Foto de producto en tamaño de miniatura (WebP generado por el servidor).
// La original es de 600 px; en tarjetas y listas basta con 320 o 160 px y
// pesa varias veces menos. Solo aplica a fotos subidas al sistema.
export function thumb(url: string | null | undefined, w: 160 | 320): string | undefined {
  if (!url) return undefined
  if (!url.includes('/uploads/products/') || url.includes('?')) return url
  return `${url}?w=${w}`
}
