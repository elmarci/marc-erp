import axios from 'axios'

const BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1'

export const api = axios.create({ baseURL: BASE_URL, timeout: 15000 })

// Inject customer token if available
api.interceptors.request.use((config) => {
  try {
    const auth = JSON.parse(localStorage.getItem('marc-store-auth') ?? '{}')
    const token = auth?.state?.token
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  } catch { /* ignore */ }
  return config
})

export interface Product {
  id: string
  name: string
  barcode: string | null
  salePrice: number
  currentStock: number
  imageUrl: string | null
  description: string | null
  category: { id: string; name: string }
}

export interface Category {
  id: string
  name: string
  description: string | null
  _count: { products: number }
}

export interface Offer {
  id: string
  name: string
  description: string | null
  type: string
  value: number
  storeBadge: string | null
  storeImage: string | null
  endDate: string | null
  products: Array<{
    product: { id: string; name: string; salePrice: number; imageUrl: string | null }
  }>
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

// API calls
export const storeApi = {
  getProducts: (params?: Record<string, string | number>) =>
    api.get<{ data: Product[]; pagination: { total: number; totalPages: number; page: number } }>('/store/products', { params }),

  getCategories: () =>
    api.get<{ data: Category[] }>('/store/categories'),

  getOffers: () =>
    api.get<{ data: Offer[] }>('/store/offers'),

  createOrder: (data: unknown) =>
    api.post<{ data: StoreOrder }>('/store/orders', data),

  getOrder: (orderNumber: string) =>
    api.get<{ data: StoreOrder }>(`/store/orders/${orderNumber}`),

  trackOrders: (phone: string) =>
    api.get<{ data: StoreOrder[] }>(`/store/orders/track/${phone}`),
}
