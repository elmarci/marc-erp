import axios from 'axios'
import { useAuthStore } from './authStore'

const BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1'

export const api = axios.create({ baseURL: BASE_URL, timeout: 15000 })

// Inject customer JWT token if available
api.interceptors.request.use((config) => {
  try {
    const stored = JSON.parse(localStorage.getItem('marc-customer') ?? '{}')
    const token = stored?.state?.token
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  } catch { /* ignore */ }
  return config
})

// Sesión vencida o cerrada desde otro equipo (cambio de contraseña): el
// backend responde 401 y se vuelve a la pantalla de ingreso.
api.interceptors.response.use(undefined, (error) => {
  const status = error?.response?.status
  const sentToken = !!error?.config?.headers?.['Authorization']
  if (status === 401 && sentToken && useAuthStore.getState().isLoggedIn) {
    useAuthStore.getState().logout()
  }
  return Promise.reject(error)
})

// Cliente tal como lo devuelve el backend al ingresar/registrarse.
export interface AuthCustomer {
  id: string
  name: string
  phone: string
  email: string | null
  emailVerified: boolean
  erpLinked: boolean
  hasPassword: boolean
}
export type AuthResult = { data: { customer: AuthCustomer; token: string } }

// Teléfono con el que se hizo cada pedido en este equipo, para poder abrir
// /pedido/:numero (el backend pide número + teléfono a quien no es dueño).
const ORDER_PHONES_KEY = 'marc-order-phones'
export function rememberOrderPhone(orderNumber: string, phone: string) {
  try {
    const map = JSON.parse(localStorage.getItem(ORDER_PHONES_KEY) ?? '{}') as Record<string, string>
    map[orderNumber] = phone
    localStorage.setItem(ORDER_PHONES_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}
export function getOrderPhone(orderNumber: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(ORDER_PHONES_KEY) ?? '{}') as Record<string, string>)[orderNumber]
  } catch { return undefined }
}

export interface Product {
  id: string
  name: string
  barcode: string | null
  salePrice: number
  currentStock: number
  imageUrl: string | null
  description: string | null
  isBulk?: boolean
  bulkUnit?: string | null
  category: { id: string; name: string; parent?: { id: string; name: string } | null }
}

export interface CategoryChild {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  sortOrder: number
  _count: { products: number }
}

export interface Category extends CategoryChild {
  children: CategoryChild[]
}

export interface Offer {
  id: string
  name: string
  description: string | null
  type: string
  // Solo HAPPY_HOUR: indica si value es PERCENTAGE o FIXED (soles).
  valueType?: string | null
  value: number
  buyQuantity: number | null   // para BUY_X_GET_Y
  getQuantity: number | null   // para BUY_X_GET_Y
  storeBadge: string | null
  storeImage: string | null
  storeVideo: string | null
  storeFullDesign: boolean
  endDate: string | null
  products: Array<{
    quantity: number   // sólo tiene significado real para COMBO — el resto siempre manda 1
    product: { id: string; name: string; salePrice: number; imageUrl: string | null; category: { id: string; name: string } | null }
  }>
}

export interface StoreAddress {
  id: string
  label: string
  address: string
  district: string
  reference: string | null
  isDefault: boolean
}

export interface ConsumptionReport {
  items: Array<{ productId: string; productName: string; quantity: number; spent: number; timesPurchased: number }>
  totalUnits: number
  totalSpent: number
}

export interface StoreProfile {
  id: string
  name: string
  phone: string
  email: string | null
  emailVerified: boolean
  erpLinked: boolean
  hasPassword: boolean
  createdAt: string
  loyaltyPoints: number
  addresses: StoreAddress[]
}

export interface StoreOrder {
  id: string
  orderNumber: string
  customerName: string
  customerPhone: string
  deliveryType: string
  address: string | null
  district: string | null
  status: string
  paymentMethod: string
  paymentStatus: string
  subtotal: number
  deliveryCost: number
  total: number
  pointsRedeemed: number
  pointsDiscountAmount: number
  createdAt: string
  items: Array<{
    id: string
    name: string
    imageUrl: string | null
    quantity: number
    unitPrice: number
    subtotal: number
  }>
}

export interface TvSlideData {
  id: string | null
  key?: string
  showFooter?: boolean
  type: 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM'
  seconds: number
  title: string | null
  subtitle: string | null
  imageUrl: string | null
  offer?: Offer
  products?: Array<{ id: string; name: string; salePrice: number; imageUrl: string | null }>
}

// Transmisión en vivo: lo que el ERP o el POS mandan a la TV "ahora mismo", por
// encima de la rotación normal (slides elegidas, imagen al vuelo o venta en curso).
export interface TvLiveCartItem { name: string; quantity: number; unit: string | null; unitPrice: number; subtotal: number }
export interface TvLiveData {
  mode: 'AUTO' | 'ONLY' | 'CART'
  version: number
  now: number
  slides: TvSlideData[]
  cart: { items: TvLiveCartItem[]; total: number; customerName: string | null } | null
  thanksUntil: number | null
}

// API calls
export const storeApi = {
  getTvConfig: () =>
    api.get<{ data: { slides: TvSlideData[]; generatedAt: string } }>('/tv/config'),

  getTvLive: () =>
    api.get<{ data: TvLiveData }>('/tv/live'),

  getProducts: (params?: Record<string, string | number>) =>
    api.get<{ data: Product[]; pagination: { total: number; totalPages: number; page: number } }>('/store/products', { params }),

  getFeaturedProducts: (limit = 8) =>
    api.get<{ data: Product[] }>('/store/products/featured', { params: { limit } }),

  getProduct: (id: string) =>
    api.get<{ data: Product }>(`/store/products/${id}`),

  getCategories: () =>
    api.get<{ data: Category[] }>('/store/categories'),

  getOffers: () =>
    api.get<{ data: Offer[] }>('/store/offers'),

  getDisplaySettings: () =>
    api.get<{ data: { heroVideoUrl: string | null; heroPosterUrl: string | null; loyaltyPointValue: number } }>('/store/display-settings'),

  createOrder: (data: {
    customerName: string; customerPhone: string; customerEmail?: string;
    deliveryType: string; address?: string; district?: string;
    reference?: string; notes?: string; paymentMethod: string;
    latitude?: number; longitude?: number; pointsToRedeem?: number;
    items: Array<{ productId: string; quantity: number; unitPrice?: number; name?: string }>;
  }) =>
    api.post<{ data: StoreOrder }>('/store/orders', data),

  getOrder: (orderNumber: string, phone?: string) =>
    api.get<{ data: StoreOrder }>(`/store/orders/${orderNumber}`, { params: { phone } }),

  myOrders: () =>
    api.get<{ data: StoreOrder[] }>('/store/orders/mine'),

  getProfile: () =>
    api.get<{ data: StoreProfile }>('/store/auth/profile'),

  updateProfile: (data: { name?: string }) =>
    api.put<{ data: StoreProfile }>('/store/auth/profile', data),

  getConsumptionReport: (from?: string, to?: string) =>
    api.get<{ data: ConsumptionReport }>('/store/auth/consumption-report', { params: { from, to } }),

  addAddress: (data: { label: string; address: string; district: string; reference?: string; isDefault?: boolean }) =>
    api.post<{ data: StoreAddress }>('/store/auth/addresses', data),

  deleteAddress: (id: string) =>
    api.delete(`/store/auth/addresses/${id}`),

  setDefaultAddress: (id: string) =>
    api.patch<{ data: StoreAddress }>(`/store/auth/addresses/${id}/default`),

  loginWithGoogle: (idToken: string, phone?: string, name?: string) =>
    api.post<AuthResult>('/store/auth/google', { idToken, phone, name }),

  login: (identifier: string, password: string) =>
    api.post<AuthResult>('/store/auth/login', { identifier, password }),

  register: (data: { name: string; phone: string; email: string; password: string }) =>
    api.post<AuthResult>('/store/auth/register', data),

  sendEmailCode: (email?: string) =>
    api.post<{ data: { sentTo: string } }>('/store/auth/email/send-code', email ? { email } : {}),

  verifyEmail: (code: string) =>
    api.post<{ data: { customer: AuthCustomer } }>('/store/auth/email/verify', { code }),

  forgotPassword: (identifier: string) =>
    api.post('/store/auth/password/forgot', { identifier }),

  resetPassword: (identifier: string, code: string, password: string) =>
    api.post<AuthResult>('/store/auth/password/reset', { identifier, code, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<AuthResult>('/store/auth/password/change', { currentPassword, newPassword }),

  getVapidPublicKey: () =>
    api.get<{ data: { publicKey: string | null } }>('/store/push/vapid-public-key'),

  subscribeToPush: (subscription: PushSubscriptionJSON) =>
    api.post('/store/push/subscribe', { subscription }),

  unsubscribeFromPush: (endpoint: string) =>
    api.post('/store/push/unsubscribe', { endpoint }),
}
