import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Search, LogOut, User, ChevronRight, RefreshCw, Star, ShoppingBag,
  MapPin, Plus, Trash2, Pencil, Check, X, CalendarDays,
} from 'lucide-react'
import { storeApi, type StoreAddress } from '../api'
import { useAuthStore } from '../authStore'
import { Link } from 'react-router-dom'
import { AuthModal } from '../components/AuthModal'
import { useCartStore } from '../cartStore'
import { toast } from 'sonner'

const STATUS: Record<string, { label: string; color: string; emoji: string }> = {
  PENDING:   { label: 'Pendiente',   color: 'text-amber-600',      emoji: '⏳' },
  CONFIRMED: { label: 'Confirmado',  color: 'text-brand-green-600', emoji: '✅' },
  PREPARING: { label: 'Preparando',  color: 'text-purple-600',     emoji: '👨‍🍳' },
  READY:     { label: 'Listo',       color: 'text-brand-green-700', emoji: '🎉' },
  DELIVERED: { label: 'Entregado',   color: 'text-brand-green-700', emoji: '✅' },
  CANCELLED: { label: 'Cancelado',   color: 'text-brand-magenta-600', emoji: '❌' },
}
const PAYMENT_LABELS: Record<string, string> = { YAPE: 'Yape', PLIN: 'Plin', CASH: 'Efectivo' }
const DISTRICTS = ['Pachacamac', 'Villa María del Triunfo', 'San Juan de Miraflores', 'Villa El Salvador', 'Lurín', 'Cieneguilla', 'Otro']

/* ── Libreta de direcciones ──────────────────────────────────────────── */
function AddressBook() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ label: 'Casa', address: '', district: 'Pachacamac', reference: '' })

  const { data } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
  })
  const addresses = data?.data.data.addresses ?? []

  const addMutation = useMutation({
    mutationFn: () => storeApi.addAddress({ ...form, isDefault: addresses.length === 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-profile'] })
      setForm({ label: 'Casa', address: '', district: 'Pachacamac', reference: '' })
      setShowForm(false)
      toast.success('Dirección agregada')
    },
    onError: () => toast.error('No se pudo agregar la dirección'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => storeApi.deleteAddress(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['store-profile'] }); toast.success('Dirección eliminada') },
  })

  const defaultMutation = useMutation({
    mutationFn: (id: string) => storeApi.setDefaultAddress(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['store-profile'] }),
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-paper-line p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-paper-ink flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-blue-600" />Mis direcciones</h3>
        <button onClick={() => setShowForm(v => !v)} className="text-brand-green-600 hover:text-brand-green-700 text-sm font-medium flex items-center gap-1 transition-colors">
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Cancelar' : 'Agregar'}
        </button>
      </div>

      {showForm && (
        <div className="bg-paper-surface rounded-xl p-4 space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.label} onChange={e => setForm(v => ({ ...v, label: e.target.value }))} placeholder="Etiqueta (Casa, Trabajo...)"
              className="bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none transition-colors" />
            <select value={form.district} onChange={e => setForm(v => ({ ...v, district: e.target.value }))}
              className="bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none transition-colors">
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <input value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))} placeholder="Dirección completa"
            className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none transition-colors" />
          <input value={form.reference} onChange={e => setForm(v => ({ ...v, reference: e.target.value }))} placeholder="Referencia (opcional)"
            className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none transition-colors" />
          <button onClick={() => { if (form.address.trim().length < 5) { toast.error('Ingresa una dirección válida'); return } addMutation.mutate() }}
            disabled={addMutation.isPending}
            className="w-full bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
            Guardar dirección
          </button>
        </div>
      )}

      {addresses.length === 0 ? (
        <p className="text-sm text-paper-ink-ghost">Aún no tienes direcciones guardadas.</p>
      ) : (
        <div className="space-y-2">
          {addresses.map((a: StoreAddress) => (
            <div key={a.id} className="flex items-start justify-between gap-3 bg-paper-surface rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-paper-ink flex items-center gap-2">
                  {a.label}
                  {a.isDefault && <span className="text-[10px] bg-brand-blue-100 text-brand-blue-700 font-bold px-2 py-0.5 rounded-full">Principal</span>}
                </p>
                <p className="text-xs text-paper-ink-soft">{a.address}, {a.district}</p>
                {a.reference && <p className="text-xs text-paper-ink-ghost">{a.reference}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!a.isDefault && (
                  <button onClick={() => defaultMutation.mutate(a.id)} title="Marcar como principal"
                    className="text-paper-ink-ghost hover:text-brand-blue-600 transition-colors">
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => deleteMutation.mutate(a.id)} title="Eliminar" className="text-paper-ink-ghost hover:text-brand-magenta-600 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Editar perfil ───────────────────────────────────────────────────── */
function ProfileEditor({ name, email }: { name: string; email: string | null }) {
  const queryClient = useQueryClient()
  const { customer, setCustomer } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name, email: email ?? '' })

  const mutation = useMutation({
    mutationFn: () => storeApi.updateProfile({ name: form.name, email: form.email || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['store-profile'] })
      if (customer) setCustomer({ ...customer, name: res.data.data.name, email: res.data.data.email })
      setEditing(false)
      toast.success('Perfil actualizado')
    },
    onError: () => toast.error('No se pudo actualizar el perfil'),
  })

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-paper-ink-ghost hover:text-brand-blue-600 flex items-center gap-1 transition-colors">
        <Pencil className="h-3 w-3" />Editar perfil
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="Nombre"
        className="bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-1.5 text-sm text-paper-ink outline-none transition-colors" />
      <input value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} placeholder="Email (opcional)"
        className="bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-3 py-1.5 text-sm text-paper-ink outline-none transition-colors" />
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
        className="bg-brand-green-600 hover:bg-brand-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">
        Guardar
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-paper-ink-ghost hover:text-paper-ink-soft px-2 transition-colors">Cancelar</button>
    </div>
  )
}

export function TrackOrderPage() {
  const { customer, isLoggedIn, logout } = useAuthStore()
  const { addItem, openCart } = useCartStore()
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [submitted, setSubmitted] = useState(isLoggedIn && customer ? customer.phone : '')
  const [showAuth, setShowAuth] = useState(false)

  const { data: profileData } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
    enabled: !!isLoggedIn,
  })
  const profile = profileData?.data.data

  const { data, isLoading } = useQuery({
    queryKey: ['track-orders', submitted],
    queryFn: () => storeApi.trackOrders(submitted),
    enabled: !!submitted,
    refetchInterval: 15000,
  })

  const orders = data?.data.data ?? []
  const totalSpent = orders.reduce((s, o) => s + Number(o.total), 0)

  const repeatOrder = (order: typeof orders[0]) => {
    order.items.forEach(item => {
      addItem({
        id: item.id, // not product id but ok for display
        name: item.name,
        salePrice: Number(item.unitPrice),
        currentStock: 99,
        imageUrl: null,
        barcode: null,
        description: null,
        category: { id: '', name: '' },
      })
    })
    openCart()
    toast.success('Productos del pedido agregados al carrito')
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        {isLoggedIn && customer ? (
          <>
            <div className="h-16 w-16 bg-brand-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 shadow-sm">
              {customer.name[0].toUpperCase()}
            </div>
            <h1 className="text-2xl font-black text-paper-ink">{customer.name}</h1>
            <p className="text-paper-ink-soft text-sm">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
            {profile && (
              <p className="text-xs text-paper-ink-faint flex items-center justify-center gap-1 mt-1">
                <CalendarDays className="h-3 w-3" />Cliente desde {new Date(profile.createdAt).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}
              </p>
            )}
            <div className="flex items-center justify-center gap-4 mt-2">
              <ProfileEditor name={customer.name} email={customer.email ?? null} />
              <button onClick={logout} className="text-xs text-paper-ink-ghost hover:text-brand-magenta-600 flex items-center gap-1 transition-colors">
                <LogOut className="h-3 w-3" />Cerrar sesión
              </button>
            </div>
          </>
        ) : (
          <>
            <Package className="h-12 w-12 mx-auto mb-4 text-brand-blue-600" />
            <h1 className="text-2xl font-black mb-1 text-paper-ink">Mis pedidos</h1>
            <p className="text-paper-ink-soft text-sm">Ingresa tu teléfono para ver tus pedidos</p>
          </>
        )}
      </div>

      {/* Stats — solo para clientes registrados */}
      {isLoggedIn && customer && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white border border-paper-line rounded-2xl shadow-sm p-4 text-center">
            <ShoppingBag className="h-4 w-4 text-brand-blue-600 mx-auto mb-1" />
            <p className="text-lg font-black text-paper-ink">{orders.length}</p>
            <p className="text-xs text-paper-ink-ghost">Pedidos</p>
          </div>
          <div className="bg-white border border-paper-line rounded-2xl shadow-sm p-4 text-center">
            <span className="text-sm font-black text-brand-blue-600 block mb-1">S/</span>
            <p className="text-lg font-black text-paper-ink">{totalSpent.toFixed(0)}</p>
            <p className="text-xs text-paper-ink-ghost">Comprado</p>
          </div>
          <div className="bg-white border border-paper-line rounded-2xl shadow-sm p-4 text-center">
            <div className="h-6 w-6 mx-auto mb-1 rounded-full border border-dashed border-brand-magenta-300 flex items-center justify-center">
              <Star className="h-3 w-3 text-brand-magenta-500" />
            </div>
            <p className="text-lg font-black text-paper-ink">{profile?.loyaltyPoints ?? 0}</p>
            <p className="text-xs text-paper-ink-ghost">Puntos</p>
          </div>
        </div>
      )}

      {/* Libreta de direcciones — solo para clientes registrados */}
      {isLoggedIn && customer && (
        <div className="mb-8">
          <AddressBook />
        </div>
      )}

      {/* Si no está logueado, mostrar opción de registro + búsqueda por teléfono */}
      {!isLoggedIn && (
        <div className="space-y-4 mb-8">
          <button onClick={() => setShowAuth(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-3 rounded-xl transition-colors">
            <User className="h-4 w-4" />Ingresar para ver todos mis pedidos
          </button>
          <div className="flex items-center gap-3 text-xs text-paper-ink-ghost">
            <div className="flex-1 h-px bg-paper-line" />o busca por teléfono<div className="flex-1 h-px bg-paper-line" />
          </div>
          <div className="flex gap-3">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Ej: 987654321"
              className="flex-1 bg-white border border-paper-line rounded-xl px-4 py-3 text-sm text-paper-ink focus:outline-none focus:border-brand-blue-400 transition-colors"
              onKeyDown={e => e.key === 'Enter' && setSubmitted(phone)} />
            <button onClick={() => setSubmitted(phone)}
              className="bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold px-5 rounded-xl transition-colors">
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {isLoggedIn && <h2 className="text-lg font-bold text-paper-ink mb-4">Historial de pedidos</h2>}

      {/* Lista de pedidos */}
      {isLoading && (
        <div className="text-center py-8 text-paper-ink-ghost">
          <div className="h-8 w-8 border-2 border-brand-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Buscando pedidos...
        </div>
      )}

      {submitted && !isLoading && orders.length === 0 && (
        <div className="text-center py-12 text-paper-ink-ghost">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-paper-ink-ghost">No se encontraron pedidos</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map(order => {
          const status = STATUS[order.status] ?? STATUS.PENDING
          return (
            <div key={order.id} className="bg-white rounded-2xl overflow-hidden border border-paper-line shadow-sm hover:shadow-md transition-shadow">
              <Link to={`/pedido/${order.orderNumber}`} className="block p-4 hover:bg-paper-surface transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-lg text-paper-ink">{order.orderNumber}</p>
                    <p className="text-xs text-paper-ink-ghost">{new Date(order.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${status.color}`}>{status.emoji} {status.label}</span>
                    <ChevronRight className="h-4 w-4 text-paper-ink-ghost" />
                  </div>
                </div>
                <div className="space-y-0.5 mb-3">
                  {order.items.slice(0, 3).map((item, i) => (
                    <p key={i} className="text-sm text-paper-ink-soft">• {item.name} ×{item.quantity}</p>
                  ))}
                  {order.items.length > 3 && <p className="text-xs text-paper-ink-ghost">+{order.items.length - 3} más</p>}
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-paper-line pt-3">
                  <span className="text-sm text-paper-ink-soft">
                    {order.deliveryType === 'DELIVERY' ? '🚚 Delivery' : '🏪 Recojo'} · {PAYMENT_LABELS[order.paymentMethod]}
                  </span>
                  <span className="text-paper-ink font-extrabold">S/ {Number(order.total).toFixed(2)}</span>
                </div>
              </Link>
              {/* Repetir pedido */}
              <div className="px-4 pb-3 border-t border-dashed border-paper-line">
                <button onClick={() => repeatOrder(order)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs text-paper-ink-ghost hover:text-brand-blue-600 transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" />Repetir este pedido
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  )
}
