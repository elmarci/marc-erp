import { api } from '../api'

// "Te lo traemos": solicitudes de compra/recojo que hace un repartidor de
// Marc. Ver apps/backend/src/modules/mandados.

export type Categoria = 'COMIDA' | 'MEDICAMENTOS' | 'LICORES' | 'ABARROTES' | 'DOCUMENTOS' | 'OTROS'
export type EstadoMandado = 'ABIERTO' | 'ACORDADO' | 'COTIZADO' | 'COMPRA_APROBADA' | 'COMPRADO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO'

export interface MandadoItem {
  id: string
  descripcion: string
  cantidad: number
  unidad: string
  precioEstimado: number | null
  precioReal: number | null
  noHabia: boolean
}

export interface Mandado {
  id: string
  codigo: string
  accessKey: string
  estado: EstadoMandado
  categoria: Categoria
  conCompra: boolean
  recojo: { nombre: string | null; direccion: string | null; lat: number | null; lng: number | null } | null
  entrega: { direccion: string; referencia: string | null; lat: number | null; lng: number | null; mapsLink: string | null }
  programadoPara: string | null
  nota: string | null
  distanciaKm: number | null
  items: MandadoItem[]
  totalEstimado: number
  totalEstimadoCompleto: boolean
  totalCompra: number | null
  presupuestoMax: number | null
  ofertaCliente: number
  ofertaSugerida: number
  tarifaAcordada: number | null
  totalACobrar: number | null
  boletaFoto: string | null
  metodoPago: 'EFECTIVO' | 'YAPE'
  clienteNombre: string
  clienteTelefono: string
  ofertas: { id: string; monto: number; etaMin: number; mensaje: string | null; rider: { nombre: string; calificacion: number | null; moto: string | null }; createdAt: string }[]
  rider: { nombre: string; telefono: string; calificacion: number | null; moto: string | null; placa: string | null; ubicacion: { lat: number; lng: number } | null } | null
  createdAt: string
  acordadoAt: string | null
  cotizadoAt: string | null
  compradoAt: string | null
  entregadoAt: string | null
  canceladoAt: string | null
  motivoCancelacion: string | null
}

export interface Cotizacion {
  sugerida: number
  km: number | null
  disponibles: number
  etaMin: number
  rango: { min: number; max: number }
  maxAdelanto: number
}

export interface NuevoMandado {
  clienteNombre: string
  clienteTelefono: string
  categoria: Categoria
  conCompra: boolean
  recojoNombre?: string
  recojoDireccion?: string
  entregaDireccion: string
  entregaReferencia?: string
  entregaLat?: number
  entregaLng?: number
  entregaMapsLink?: string
  programadoPara?: string
  nota?: string
  ofertaCliente: number
  presupuestoMax?: number
  metodoPago: 'EFECTIVO' | 'YAPE'
  items: { descripcion: string; cantidad: number; unidad?: string; precioEstimado?: number }[]
  mayorDeEdad?: boolean
  ventaLibre?: boolean
}

const q = (k?: string | null) => (k ? `?k=${encodeURIComponent(k)}` : '')

export const mandadosApi = {
  cotizar: async (body: { conCompra: boolean; entregaLat?: number; entregaLng?: number }) =>
    (await api.post<{ data: Cotizacion }>('/store/mandados/cotizar', body)).data.data,
  crear: async (body: NuevoMandado) => (await api.post<{ data: Mandado }>('/store/mandados', body)).data.data,
  ver: async (codigo: string, k?: string | null) => (await api.get<{ data: Mandado }>(`/store/mandados/${codigo}${q(k)}`)).data.data,
  mios: async () => (await api.get<{ data: Mandado[] }>('/store/mandados/mios')).data.data,
  subirOferta: async (codigo: string, k: string | null, monto: number) =>
    (await api.post<{ data: Mandado }>(`/store/mandados/${codigo}/oferta${q(k)}`, { monto })).data.data,
  aceptarOferta: async (codigo: string, k: string | null, ofertaId: string) =>
    (await api.post<{ data: Mandado }>(`/store/mandados/${codigo}/aceptar-oferta${q(k)}`, { ofertaId })).data.data,
  aprobarCompra: async (codigo: string, k: string | null) =>
    (await api.post<{ data: Mandado }>(`/store/mandados/${codigo}/aprobar-compra${q(k)}`)).data.data,
  cancelar: async (codigo: string, k: string | null, motivo?: string) =>
    (await api.post<{ data: Mandado }>(`/store/mandados/${codigo}/cancelar${q(k)}`, { motivo })).data.data,
}

export const API_ORIGIN = (import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '')

export const CATEGORIAS: { key: Categoria; label: string; hint: string; ejemplos: string[] }[] = [
  { key: 'COMIDA', label: 'Comida', hint: 'Menús, pollerías, chifas', ejemplos: ['Menú del día', '1/4 de pollo a la brasa', 'Chaufa especial'] },
  { key: 'MEDICAMENTOS', label: 'Farmacia', hint: 'Solo venta libre', ejemplos: ['Paracetamol 500 mg', 'Panadol antigripal', 'Alcohol 70°'] },
  { key: 'ABARROTES', label: 'Abarrotes', hint: 'Mercado, bodega, pan', ejemplos: ['Pan francés', 'Huevos', 'Arroz 1 kg'] },
  { key: 'LICORES', label: 'Licores', hint: 'Solo mayores de 18', ejemplos: ['Cerveza six pack', 'Hielo 3 kg', 'Gaseosa 3 L'] },
  { key: 'DOCUMENTOS', label: 'Recojo / envío', hint: 'Documentos, llaves, paquetes', ejemplos: [] },
  { key: 'OTROS', label: 'Otra cosa', hint: 'Ferretería, regalos…', ejemplos: ['Foco LED', 'Pilas AA', 'Tarjeta de regalo'] },
]

// Guarda en este celular las solicitudes hechas sin cuenta (código|clave).
const KEY = 'marc-mandados'
export function rememberMandado(codigo: string, accessKey: string) {
  try {
    const list = readMandados().filter((m) => m.codigo !== codigo)
    list.unshift({ codigo, k: accessKey })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
  } catch { /* sin almacenamiento */ }
}
export function readMandados(): { codigo: string; k: string }[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
export const mandadoLink = (codigo: string, k?: string | null) => `/mandados/${codigo}${q(k)}`

// Lee lat/lng de un link de Google Maps pegado por el cliente
// (…/@-12.10,-76.87,17z · ?q=-12.10,-76.87 · !3d-12.10!4d-76.87).
export function coordsFromMapsLink(link: string): { lat: number; lng: number } | null {
  const pats = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/]
  for (const p of pats) {
    const m = link.match(p)
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

export const ESTADO_LABEL: Record<EstadoMandado, string> = {
  ABIERTO: 'Buscando repartidor',
  ACORDADO: 'Repartidor asignado',
  COTIZADO: 'Revisa los precios',
  COMPRA_APROBADA: 'Comprando',
  COMPRADO: 'Compra lista',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}
