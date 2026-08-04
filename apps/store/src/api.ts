import axios from 'axios'

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
  value: number
  buyQuantity: number | null   // para BUY_X_GET_Y
  getQuantity: number | null   // para BUY_X_GET_Y
  storeBadge: string | null
  storeImage: string | null
  storeVideo: string | null
  endDate: string | null
  products: Array<{
    product: { id: string; name: string; salePrice: number; imageUrl: string | null }
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

export interface StoreProfile {
  id: string
  name: string
  phone: string
  email: string | null
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

  getFeaturedProducts: (limit = 8) =>
    api.get<{ data: Product[] }>('/store/products/featured', { params: { limit } }),

  getProduct: (id: string) =>
    api.get<{ data: Product }>(`/store/products/${id}`),

  getCategories: () =>
    api.get<{ data: Category[] }>('/store/categories'),

  getOffers: () =>
    api.get<{ data: Offer[] }>('/store/offers'),

  getDisplaySettings: () =>
    api.get<{ data: { heroVideoUrl: string | null; heroPosterUrl: string | null } }>('/store/display-settings'),

  createOrder: (data: {
    customerName: string; customerPhone: string; customerEmail?: string;
    deliveryType: string; address?: string; district?: string;
    reference?: string; notes?: string; paymentMethod: string;
    items: Array<{ productId: string; quantity: number; unitPrice?: number; name?: string }>;
  }) =>
    api.post<{ data: StoreOrder }>('/store/orders', data),

  getOrder: (orderNumber: string) =>
    api.get<{ data: StoreOrder }>(`/store/orders/${orderNumber}`),

  trackOrders: (phone: string) =>
    api.get<{ data: StoreOrder[] }>(`/store/orders/track/${phone}`),

  getProfile: () =>
    api.get<{ data: StoreProfile }>('/store/auth/profile'),

  updateProfile: (data: { name?: string; email?: string }) =>
    api.put<{ data: StoreProfile }>('/store/auth/profile', data),

  addAddress: (data: { label: string; address: string; district: string; reference?: string; isDefault?: boolean }) =>
    api.post<{ data: StoreAddress }>('/store/auth/addresses', data),

  deleteAddress: (id: string) =>
    api.delete(`/store/auth/addresses/${id}`),

  setDefaultAddress: (id: string) =>
    api.patch<{ data: StoreAddress }>(`/store/auth/addresses/${id}/default`),
}
