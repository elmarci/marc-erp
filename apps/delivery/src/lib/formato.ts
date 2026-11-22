import type { DeliveryOrder } from '../types'

export const soles = (n: number) => `S/ ${n.toFixed(2)}`
export const fmtDist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)
export const minutosMoto = (km: number) => Math.max(1, Math.round((km / 22) * 60))

const MS_DIA = 24 * 60 * 60 * 1000
function diaRelativo(d: Date): string {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  const diff = Math.round((dia.getTime() - hoy.getTime()) / MS_DIA)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  const s = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const hora = (d: Date) => d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' }).replace(/\s?a\.\s?m\./i, ' am').replace(/\s?p\.\s?m\./i, ' pm')

export type Urgencia = 'ya' | 'pronto' | 'luego'

// Etiqueta corta de cuándo hay que entregar, para el chip de cada viaje.
export function entregaInfo(e: { tipo: 'EXPRESS' | 'PROGRAMADO' | 'SIN_HORA'; at: string | null } | null | undefined): { texto: string; urgencia: Urgencia; at: Date | null; dia: string | null } {
  if (!e || e.tipo === 'SIN_HORA' || !e.at) return { texto: 'Lo antes posible', urgencia: 'ya', at: null, dia: null }
  const at = new Date(e.at)
  if (e.tipo === 'EXPRESS') return { texto: 'Express', urgencia: 'ya', at, dia: null }
  const falta = at.getTime() - Date.now()
  const urgencia: Urgencia = falta <= 45 * 60000 ? 'ya' : falta <= 3 * 3600000 ? 'pronto' : 'luego'
  return { texto: `${diaRelativo(at)} ${hora(at)}`, urgencia, at, dia: diaRelativo(at) }
}

// Grupo para consolidar: mismo día y misma franja de entrega.
export function grupoEntrega(o: DeliveryOrder): { key: string; titulo: string } {
  const i = entregaInfo(o.entrega)
  if (i.urgencia === 'ya' || !i.at) return { key: 'ahora', titulo: 'Para ahora' }
  const franja = o.entrega.turno ?? hora(i.at)
  return { key: `${i.at.toDateString()}|${franja}`, titulo: `${i.dia} · ${franja}` }
}

// Abre la navegación: Waze con coordenadas, o Google Maps con el link o la
// dirección escrita.
export function navLink(p: { lat?: number | null; lng?: number | null; mapsLink?: string | null; direccion?: string | null }): string | null {
  if (p.lat != null && p.lng != null) return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
  if (p.mapsLink) return p.mapsLink
  if (p.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.direccion}, Manchay, Pachacámac`)}`
  return null
}
