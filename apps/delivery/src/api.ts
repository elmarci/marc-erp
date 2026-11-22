import axios from 'axios'
import type { DeliveryOrder, FuelExpense, Liquidacion, Mandado, MetodoLiquidacion, OrderStatus, RiderProfile } from './types'

const BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1'

export const apiClient = axios.create({ baseURL: BASE_URL, timeout: 15000 })

// Mismo patrón que apps/store/src/api.ts: token leído del store persistido
// de zustand, sin refresh-rotation (el JWT del biker dura 30d).
apiClient.interceptors.request.use((config) => {
  try {
    const stored = JSON.parse(localStorage.getItem('marc-reparto-rider') ?? '{}')
    const token = stored?.state?.token
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  } catch { /* ignore */ }
  return config
})

// Sesión cerrada desde el ERP (desactivado, celular quitado o "cerrar
// sesiones"): cualquier 401 fuera del ingreso devuelve al login.
apiClient.interceptors.response.use(undefined, (error) => {
  const url: string = error?.config?.url ?? ''
  if (error?.response?.status === 401 && !url.startsWith('/delivery/auth/login') && !url.startsWith('/delivery/auth/activate')) {
    onSessionEnded?.()
  }
  return Promise.reject(error)
})

let onSessionEnded: (() => void) | null = null
export function setSessionEndedHandler(fn: () => void) { onSessionEnded = fn }

// Ubicación real de la tienda — punto de partida del mapa cuando el
// navegador todavía no dio el GPS real del repartidor. Mismo punto que
// STORE_ORIGIN en el backend (apps/backend/src/modules/delivery/economics.ts).
export const RIDER_BASE = { lat: -12.102235, lng: -76.874449 }

// Cada celular guarda un secreto aleatorio propio. El backend solo deja
// entrar desde el celular que la tienda autorizó con un código de un solo uso.
const DEVICE_KEY = 'marc-reparto-device'
export function deviceSecret(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY)
    if (saved && saved.length >= 32) return saved
  } catch { /* sin almacenamiento: se genera uno temporal */ }
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try { localStorage.setItem(DEVICE_KEY, secret) } catch { /* ignore */ }
  return secret
}

export function deviceLabel(): string {
  const ua = navigator.userAgent
  const android = ua.match(/Android [\d.]+;\s*([^;)]+?)(?: Build|\))/)
  const model = android?.[1]?.trim()
  const os = /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Celular'
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : ''
  return [model && model !== 'K' ? model : os, browser].filter(Boolean).join(' · ')
}

export interface LoginResult {
  nombre: string
  iniciales: string
  token: string
  riderId: string
  pinUpgradeRequired: boolean
}

export class LoginError extends Error {
  constructor(message: string, public code: string) { super(message) }
}

function toLoginResult(data: { rider: { id: string; nombre: string }; token: string; pinUpgradeRequired: boolean }): LoginResult {
  const iniciales = data.rider.nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return { nombre: data.rider.nombre, iniciales, token: data.token, riderId: data.rider.id, pinUpgradeRequired: data.pinUpgradeRequired }
}

function asLoginError(err: unknown): LoginError {
  const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } }
  const apiErr = e.response?.data?.error
  if (apiErr?.message) return new LoginError(apiErr.message, apiErr.code ?? 'ERROR')
  return new LoginError('No hay conexión con la tienda. Revisa tu internet e intenta de nuevo.', 'NETWORK')
}

export async function login(telefono: string, pin: string): Promise<LoginResult> {
  try {
    const { data } = await apiClient.post('/delivery/auth/login', {
      telefono: telefono.replace(/\s/g, ''), pin, deviceSecret: deviceSecret(), dispositivo: deviceLabel(),
    })
    return toLoginResult(data.data)
  } catch (err) { throw asLoginError(err) }
}

export async function activateDevice(telefono: string, pin: string, code: string): Promise<LoginResult> {
  try {
    const { data } = await apiClient.post('/delivery/auth/activate', {
      telefono: telefono.replace(/\s/g, ''), pin, code, deviceSecret: deviceSecret(), dispositivo: deviceLabel(),
    })
    return toLoginResult(data.data)
  } catch (err) { throw asLoginError(err) }
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  try {
    await apiClient.post('/delivery/auth/change-pin', { currentPin, newPin })
  } catch (err) { throw asLoginError(err) }
}

export async function fetchAvailableOrders(): Promise<DeliveryOrder[]> {
  const { data } = await apiClient.get('/delivery/orders/available')
  return data.data
}

export async function fetchMyOrders(): Promise<DeliveryOrder[]> {
  const { data } = await apiClient.get('/delivery/orders/mine')
  return data.data
}

export async function fetchOrder(id: string): Promise<DeliveryOrder | undefined> {
  const { data } = await apiClient.get(`/delivery/orders/${id}`)
  return data.data
}

export async function claimOrder(id: string): Promise<DeliveryOrder> {
  const { data } = await apiClient.post(`/delivery/orders/${id}/claim`)
  return data.data
}

export async function releaseOrder(id: string): Promise<void> {
  await apiClient.post(`/delivery/orders/${id}/release`)
}

export async function claimOrders(ids: string[]): Promise<{ tomados: DeliveryOrder[]; fallidos: string[] }> {
  const { data } = await apiClient.post('/delivery/orders/claim-batch', { ids })
  return data.data
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<DeliveryOrder> {
  const { data } = await apiClient.patch(`/delivery/orders/${id}/status`, { status })
  return data.data
}

export async function fetchHistory(): Promise<DeliveryOrder[]> {
  const { data } = await apiClient.get('/delivery/orders/history')
  return data.data
}

export async function fetchProfile(): Promise<RiderProfile> {
  const { data } = await apiClient.get('/delivery/profile')
  return data.data
}

export async function updateEstado(payload: { enServicio?: boolean; zonasActivas?: string[] }): Promise<void> {
  await apiClient.patch('/delivery/estado', payload)
}

export async function updateLocation(lat: number, lng: number): Promise<void> {
  await apiClient.post('/delivery/location', { lat, lng })
}

export async function fetchWalletResumen(): Promise<{ pendiente: number; pedidosPendientes: DeliveryOrder[] }> {
  const { data } = await apiClient.get('/delivery/wallet/resumen')
  return data.data
}

export async function fetchLiquidaciones(): Promise<Liquidacion[]> {
  const { data } = await apiClient.get('/delivery/liquidaciones')
  return data.data
}

export async function solicitarLiquidacion(metodo: MetodoLiquidacion): Promise<Liquidacion> {
  const { data } = await apiClient.post('/delivery/liquidaciones', { metodo })
  return data.data
}

export async function fetchFuelExpenses(): Promise<FuelExpense[]> {
  const { data } = await apiClient.get('/delivery/fuel')
  return data.data
}

export async function addFuelExpense(monto: number, galones: number): Promise<FuelExpense> {
  const { data } = await apiClient.post('/delivery/fuel', { monto, galones })
  return data.data
}

// La llave pública VAPID es global (no depende de si quien se suscribe es
// cliente de la tienda o biker) — se reutiliza el mismo endpoint público
// que ya expone el módulo store para esto, en vez de duplicarlo.
export async function getVapidPublicKey(): Promise<string | null> {
  const { data } = await apiClient.get('/store/push/vapid-public-key')
  return data.data.publicKey
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await apiClient.post('/delivery/push/subscribe', { subscription })
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiClient.post('/delivery/push/unsubscribe', { endpoint })
}

/* ── Mandados ─────────────────────────────────────────────────────────── */
export const API_ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, '')
const md = async (p: Promise<{ data: { data: Mandado } }>) => (await p).data.data
const M = (id: string, rest = '') => `/delivery/mandados/${id}${rest}`

export async function fetchMandadosDisponibles(): Promise<Mandado[]> {
  return (await apiClient.get('/delivery/mandados/disponibles')).data.data
}
export async function fetchMisMandados(): Promise<Mandado[]> {
  return (await apiClient.get('/delivery/mandados/mios')).data.data
}
export async function fetchHistorialMandados(): Promise<Mandado[]> {
  return (await apiClient.get('/delivery/mandados/historial')).data.data
}
export const fetchMandado = (id: string) => md(apiClient.get(M(id)))
export const aceptarMandado = (id: string) => md(apiClient.post(M(id, '/aceptar')))
export const contraofertarMandado = (id: string, monto: number, etaMin: number, mensaje?: string) =>
  md(apiClient.post(M(id, '/contraoferta'), { monto, etaMin, mensaje }))
export const retirarContraoferta = (id: string) => md(apiClient.delete(M(id, '/contraoferta')))
export const liberarMandado = (id: string) => md(apiClient.post(M(id, '/liberar')))
export const enviarPrecios = (id: string, items: { id: string; precioReal?: number; noHabia?: boolean }[]) =>
  md(apiClient.post(M(id, '/precios'), { items }))
export function marcarComprado(id: string, boleta?: File) {
  const fd = new FormData()
  if (boleta) fd.append('boleta', boleta)
  return md(apiClient.post(M(id, '/comprado'), fd, { timeout: 60000 }))
}
export const mandadoEnCamino = (id: string) => md(apiClient.post(M(id, '/en-camino')))
export const mandadoEntregado = (id: string) => md(apiClient.post(M(id, '/entregado')))

export function apiErrorMessage(err: unknown, fallback = 'No se pudo. Revisa tu conexión.'): string {
  const e = err as { response?: { data?: { error?: { message?: string } } } }
  return e.response?.data?.error?.message ?? fallback
}
