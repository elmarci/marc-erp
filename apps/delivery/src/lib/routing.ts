import type { DeliveryOrder } from '../types'
import type { LatLng } from './geo'
import { haversineKm, ordenarPorCercania } from './geo'

export interface RouteLeg {
  distanciaKm: number
  duracionMin: number
}

export interface TripResult {
  geometry: LatLng[]
  distanciaTotalKm: number
  duracionTotalMin: number
  legs: RouteLeg[]
  // Índices sobre el array de entrada, en el orden real de visita que arma
  // OSRM (no necesariamente el orden en que se pasaron los puntos).
  ordenIndices: number[]
}

// Servidor demo público de OSRM — ruteo real por calles y orden óptimo de
// paradas (perfil "driving", no existe perfil de moto público), sin cuenta
// ni API key. Sin garantía de disponibilidad: si falla, se cae a
// `resolveRoute`'s fallback en línea recta.
const OSRM_TRIP_BASE = 'https://router.project-osrm.org/trip/v1/driving'

// source=first fija el punto 0 (la posición del repartidor) como inicio;
// roundtrip=false porque no vuelve al punto de partida — termina en la
// última entrega.
async function fetchTrip(puntos: LatLng[]): Promise<TripResult> {
  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_TRIP_BASE}/${coords}?source=first&roundtrip=false&geometries=geojson&overview=full`

  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo calcular la ruta')
  const data = await res.json()
  if (data.code !== 'Ok' || !data.trips?.[0]) throw new Error('Ruta no disponible')

  const trip = data.trips[0]
  const geometry: LatLng[] = trip.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }))
  const legs: RouteLeg[] = trip.legs.map((l: { distance: number; duration: number }) => ({
    distanciaKm: l.distance / 1000,
    duracionMin: l.duration / 60,
  }))
  const ordenIndices: number[] = (data.waypoints as { waypoint_index: number }[])
    .map((w, i) => ({ i, idx: w.waypoint_index }))
    .sort((a, b) => a.idx - b.idx)
    .map((w) => w.i)

  return { geometry, distanciaTotalKm: trip.distance / 1000, duracionTotalMin: trip.duration / 60, legs, ordenIndices }
}

// Si OSRM no responde (servidor demo caído, sin internet) no se puede dejar
// al repartidor sin ruta — se arma una aproximación con distancia en línea
// recta y una velocidad promedio de moto en ciudad, marcada como estimada.
export const VELOCIDAD_MOTO_KMH = 25

export interface RouteInfo {
  ruta: DeliveryOrder[]
  geometry: LatLng[]
  legs: RouteLeg[]
  totalKm: number
  totalMin: number
  esReal: boolean
}

export async function resolveRoute(riderPos: LatLng, elegidos: DeliveryOrder[]): Promise<RouteInfo> {
  if (elegidos.length === 0) {
    return { ruta: [], geometry: [], legs: [], totalKm: 0, totalMin: 0, esReal: true }
  }

  try {
    const trip = await fetchTrip([riderPos, ...elegidos])
    const ruta = trip.ordenIndices.slice(1).map((idx) => elegidos[idx - 1])
    return { ruta, geometry: trip.geometry, legs: trip.legs, totalKm: trip.distanciaTotalKm, totalMin: trip.duracionTotalMin, esReal: true }
  } catch {
    const ruta = ordenarPorCercania(riderPos, elegidos)
    const legs: RouteLeg[] = []
    let actual = riderPos
    for (const p of ruta) {
      const d = haversineKm(actual, p)
      legs.push({ distanciaKm: d, duracionMin: (d / VELOCIDAD_MOTO_KMH) * 60 })
      actual = p
    }
    return {
      ruta,
      geometry: [riderPos, ...ruta],
      legs,
      totalKm: legs.reduce((s, l) => s + l.distanciaKm, 0),
      totalMin: legs.reduce((s, l) => s + l.duracionMin, 0),
      esReal: false,
    }
  }
}

const OSRM_TABLE_BASE = 'https://router.project-osrm.org/table/v1/driving'

// Comparación honesta "juntos vs separados": si hiciera cada entrega por su
// cuenta, volvería al punto de partida entre una y otra (ida y vuelta);
// captando varias de una, ese regreso solo se hace una vez al final. Usa
// distancia real de calle (vía /table, una llamada para todos los destinos)
// para que se compare contra el mismo tipo de número que "juntos" — comparar
// calle real contra línea recta habría inflado el "ahorro" artificialmente.
export async function estimarSeparados(riderPos: LatLng, elegidos: DeliveryOrder[]): Promise<{ km: number; min: number; esReal: boolean }> {
  try {
    const puntos = [riderPos, ...elegidos]
    const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `${OSRM_TABLE_BASE}/${coords}?sources=0&annotations=distance,duration`
    const res = await fetch(url)
    if (!res.ok) throw new Error('No se pudo comparar')
    const data = await res.json()
    if (data.code !== 'Ok') throw new Error('No se pudo comparar')
    const distancias: number[] = data.distances[0].slice(1)
    const duraciones: number[] = data.durations[0].slice(1)
    const km = distancias.reduce((s: number, d: number) => s + (d / 1000) * 2, 0)
    const min = duraciones.reduce((s: number, d: number) => s + (d / 60) * 2, 0)
    return { km, min, esReal: true }
  } catch {
    const km = elegidos.reduce((s, o) => s + haversineKm(riderPos, o) * 2, 0)
    return { km, min: (km / VELOCIDAD_MOTO_KMH) * 60, esReal: false }
  }
}
