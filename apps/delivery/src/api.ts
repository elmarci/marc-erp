import axios from 'axios'
import type { DeliveryOrder, FuelExpense, Liquidacion, MetodoLiquidacion, OrderStatus, RiderProfile } from './types'

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

// Origen de referencia (tienda/zona Manchay) — punto de partida del mapa
// cuando el navegador todavía no dio el GPS real del repartidor. Mismo
// punto que STORE_ORIGIN en el backend (apps/backend/src/modules/delivery/economics.ts).
export const RIDER_BASE = { lat: -12.038, lng: -76.845 }

export async function verifyLogin(telefono: string, pin: string): Promise<{ nombre: string; iniciales: string; token: string; riderId: string } | null> {
  try {
    const { data } = await apiClient.post('/delivery/auth/login', { telefono: telefono.replace(/\s/g, ''), pin })
    const { rider, token } = data.data as { rider: { id: string; nombre: string }; token: string }
    const iniciales = rider.nombre.split(/\s+/).map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
    return { nombre: rider.nombre, iniciales, token, riderId: rider.id }
  } catch {
    return null
  }
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
