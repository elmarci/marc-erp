export interface LatLng {
  lat: number
  lng: number
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Ruta sugerida por vecino más cercano — no es el óptimo matemático (eso es
// NP-difícil), pero para 2-4 paradas dentro de una misma zona da un orden
// razonable sin necesitar un servicio de ruteo externo.
export function ordenarPorCercania<T extends LatLng>(inicio: LatLng, puntos: T[]): T[] {
  const restantes = [...puntos]
  const ruta: T[] = []
  let actual = inicio
  while (restantes.length > 0) {
    let mejorIdx = 0
    let mejorDist = Infinity
    restantes.forEach((p, i) => {
      const d = haversineKm(actual, p)
      if (d < mejorDist) {
        mejorDist = d
        mejorIdx = i
      }
    })
    const [siguiente] = restantes.splice(mejorIdx, 1)
    ruta.push(siguiente)
    actual = siguiente
  }
  return ruta
}

// Proyección equirectangular simple — suficiente para un radio de pocos km
// (la distorsión es despreciable), sin depender de ninguna librería de mapas.
export function proyectar(punto: LatLng, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, w: number, h: number, padding = 32) {
  const spanLat = bounds.maxLat - bounds.minLat || 0.001
  const spanLng = bounds.maxLng - bounds.minLng || 0.001
  const x = padding + ((punto.lng - bounds.minLng) / spanLng) * (w - padding * 2)
  const y = padding + (1 - (punto.lat - bounds.minLat) / spanLat) * (h - padding * 2)
  return { x, y }
}

export function calcularBounds(puntos: LatLng[]) {
  const lats = puntos.map((p) => p.lat)
  const lngs = puntos.map((p) => p.lng)
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }
}
