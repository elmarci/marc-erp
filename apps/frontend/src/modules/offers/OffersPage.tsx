import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Tag, Eye, EyeOff, Trash2, TrendingUp, ShoppingCart, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'

interface Offer {
  id: string; name: string; description: string | null; type: string; value: number
  startDate: string; endDate: string | null; isActive: boolean; showInStore: boolean
  storeBadge: string | null; storeImage: string | null; priority: number
  products: Array<{ product: { id: string; name: string; imageUrl: string | null } }>
}

interface Product { id: string; name: string; salePrice: number }

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'Descuento %', FIXED_DISCOUNT: 'Descuento S/',
  BUY_X_GET_Y: '2×1 / Lleva más', BUNDLE_PRICE: 'Precio paquete', HAPPY_HOUR: 'Hora feliz',
}

function OfferModal({ offer, onClose }: { offer?: Offer; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: offer?.name ?? '',
    description: offer?.description ?? '',
    type: offer?.type ?? 'PERCENTAGE_DISCOUNT',
    value: String(offer?.value ?? ''),
    startDate: offer?.startDate ? offer.startDate.split('T')[0] : new Date().toISOString().split('T')[0],
    endDate: offer?.endDate ? offer.endDate.split('T')[0] : '',
    isActive: offer?.isActive ?? true,
    showInStore: offer?.showInStore ?? true,
    storeBadge: offer?.storeBadge ?? '',
    storeImage: offer?.storeImage ?? '',
    priority: String(offer?.priority ?? 0),
    productIds: offer?.products.map(p => p.product.id) ?? [],
  })
  const [productSearch, setProductSearch] = useState('')

  const { data: products } = useQuery({
    queryKey: ['products-offer-search', productSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?search=${productSearch}&limit=10`)).data.data,
    enabled: productSearch.length >= 2,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, value: Number(form.value), priority: Number(form.priority), endDate: form.endDate || undefined }
      return offer ? api.put(`/promotions/${offer.id}`, payload) : api.post('/promotions', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success(offer ? 'Oferta actualizada.' : 'Oferta creada.')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const addProduct = (p: Product) => {
    if (!form.productIds.includes(p.id)) setForm(v => ({ ...v, productIds: [...v.productIds, p.id] }))
    setProductSearch('')
  }
  const removeProduct = (id: string) => setForm(v => ({ ...v, productIds: v.productIds.filter(x => x !== id) }))
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">{offer ? 'Editar oferta' : 'Nueva oferta'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Nombre de la oferta *</label>
              <Input value={form.name} onChange={set('name')} placeholder="Ej: 20% en bebidas" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Tipo de descuento</label>
              <select value={form.type} onChange={set('type')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Valor {form.type === 'PERCENTAGE_DISCOUNT' ? '(%)' : '(S/)'}
              </label>
              <Input type="number" min={0} value={form.value} onChange={set('value')} placeholder="20" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha inicio *</label>
              <Input type="date" value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha fin (opcional)</label>
              <Input type="date" value={form.endDate} onChange={set('endDate')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Badge en tienda</label>
              <Input value={form.storeBadge} onChange={set('storeBadge')} placeholder="OFERTA, 2×1, HOY SOLO..." />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Prioridad (mayor = arriba)</label>
              <Input type="number" value={form.priority} onChange={set('priority')} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Descripción</label>
              <Input value={form.description} onChange={set('description')} placeholder="Descripción visible en la tienda..." />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))}
                className="h-4 w-4 rounded" />
              <span className="text-sm">Activa</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.showInStore}
                onChange={e => setForm(v => ({ ...v, showInStore: e.target.checked }))}
                className="h-4 w-4 rounded" />
              <span className="text-sm">Mostrar en tienda online</span>
            </label>
          </div>

          {/* Products */}
          <div>
            <label className="mb-1 block text-sm font-medium">Productos en oferta (opcional)</label>
            <div className="relative mb-2">
              <Input placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              {products && products.length > 0 && productSearch.length >= 2 && (
                <div className="absolute z-10 w-full mt-1 border rounded-lg bg-popover shadow divide-y max-h-40 overflow-y-auto">
                  {products.map(p => (
                    <button key={p.id} onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">{formatCurrency(p.salePrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {form.productIds.map(id => {
                const p = offer?.products.find(op => op.product.id === id)
                return (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {p?.product.name ?? id.slice(0, 8)}
                    <button onClick={() => removeProduct(id)}><X className="h-3 w-3" /></button>
                  </Badge>
                )
              })}
            </div>
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name || !form.value}>
            {offer ? 'Guardar cambios' : 'Crear oferta'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function OffersPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editOffer, setEditOffer] = useState<Offer | undefined>()
  const [viewPerf, setViewPerf] = useState<string | null>(null) // offer ID con panel rendimiento abierto

  const { data, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: async () => (await api.get<{ data: Offer[] }>('/promotions?limit=50')).data.data,
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/promotions/${id}/toggle`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['offers'] }); toast.success('Estado actualizado.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['offers'] }); toast.success('Oferta eliminada.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ofertas y Promociones</h1>
          <p className="text-sm text-muted-foreground">Gestiona las ofertas del ERP y la tienda online</p>
        </div>
        <Button onClick={() => { setEditOffer(undefined); setShowModal(true) }}>
          <Plus className="mr-2 h-4 w-4" />Nueva Oferta
        </Button>
      </div>

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Oferta</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Vigencia</th>
                <th className="px-4 py-3 font-medium text-center">En tienda</th>
                <th className="px-4 py-3 font-medium text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y">
                {(data ?? []).map(offer => (
                  <tr key={offer.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{offer.name}</p>
                      {offer.storeBadge && <Badge variant="outline" className="text-xs mt-0.5">{offer.storeBadge}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[offer.type] ?? offer.type}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.value}%` : formatCurrency(offer.value)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>{new Date(offer.startDate).toLocaleDateString('es-PE')}</p>
                      {offer.endDate && <p>→ {new Date(offer.endDate).toLocaleDateString('es-PE')}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {offer.showInStore
                        ? <Eye className="h-4 w-4 text-success mx-auto" />
                        : <EyeOff className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleMutation.mutate(offer.id)}>
                        <Badge variant={offer.isActive ? 'success' : 'secondary'}>
                          {offer.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditOffer(offer); setShowModal(true) }}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => setViewPerf(viewPerf === offer.id ? null : offer.id)}>
                          <TrendingUp className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => { if (confirm('¿Eliminar esta oferta?')) deleteMutation.mutate(offer.id) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {/* Panel de rendimiento expandible */}
                  {viewPerf === offer.id && (
                    <tr key={`${offer.id}-perf`}>
                      <td colSpan={7} className="bg-muted/20 px-6 py-4">
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />Rendimiento de "{offer.name}"
                        </p>
                        <OfferPerformance offer={offer} />
                      </td>
                    </tr>
                  )}
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center">
                    <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p className="text-muted-foreground">No hay ofertas creadas aún</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && <OfferModal offer={editOffer} onClose={() => setShowModal(false)} />}
    </div>
  )
}

/* ─── Panel de Rendimiento de Ofertas ───────────────────────────────────── */
function OfferPerformance({ offer }: { offer: Offer }) {
  const { data } = useQuery({
    queryKey: ['offer-performance', offer.id],
    queryFn: async () => {
      // Buscar ventas que incluyan productos de esta oferta en su período
      const from = offer.startDate.split('T')[0]
      const to = offer.endDate ? offer.endDate.split('T')[0] : new Date().toISOString().split('T')[0]
      const productIds = offer.products.map(p => p.product.id)
      if (!productIds.length) return null

      // Traemos top-products filtrando por fecha de la oferta
      const res = await api.get<{ data: Array<{ product_id: string; name: string; quantity: number; revenue: number; transactions: number }> }>(
        `/reports/top-products?from=${from}&to=${to}&limit=100`
      )
      const offerProducts = res.data.data.filter(p => productIds.includes(p.product_id))
      const totalRevenue = offerProducts.reduce((s, p) => s + p.revenue, 0)
      const totalQty = offerProducts.reduce((s, p) => s + p.quantity, 0)
      const totalTx = offerProducts.reduce((s, p) => s + p.transactions, 0)
      return { offerProducts, totalRevenue, totalQty, totalTx, from, to }
    },
    enabled: !!offer.products.length,
  })

  if (!data) return (
    <div className="text-center py-6 text-muted-foreground text-sm">
      {!offer.products.length ? 'No hay productos asignados a esta oferta' : 'Cargando rendimiento...'}
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Período: {data.from} → {data.to}
      </p>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: DollarSign, label: 'Ingresos generados', value: formatCurrency(data.totalRevenue), color: 'text-success' },
          { icon: ShoppingCart, label: 'Unidades vendidas', value: String(Math.round(data.totalQty)), color: 'text-primary' },
          { icon: TrendingUp, label: 'Transacciones', value: String(data.totalTx), color: 'text-foreground' },
        ].map(k => (
          <div key={k.label} className="bg-muted/50 rounded-xl p-3 text-center">
            <k.icon className={`h-4 w-4 mx-auto mb-1 ${k.color}`} />
            <p className={`font-bold text-lg ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla por producto */}
      {data.offerProducts.length > 0 ? (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left">
            <th className="py-2 font-medium">Producto</th>
            <th className="py-2 font-medium text-right">Uds.</th>
            <th className="py-2 font-medium text-right">Ingresos</th>
          </tr></thead>
          <tbody className="divide-y">
            {data.offerProducts.map(p => (
              <tr key={p.product_id}>
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2 text-right">{Math.round(p.quantity)}</td>
                <td className="py-2 text-right text-success font-medium">{formatCurrency(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-4">
          Sin ventas registradas de los productos de esta oferta en el período
        </p>
      )}
    </div>
  )
}
