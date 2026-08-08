import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Tag, Eye, EyeOff, Trash2, TrendingUp, ShoppingCart, DollarSign, Image, Video, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, todayLimaDateString, cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

interface Offer {
  id: string; name: string; description: string | null; type: string; value: number
  valueType: 'PERCENTAGE' | 'FIXED' | null
  buyQuantity: number | null; getQuantity: number | null
  startTime: string | null; endTime: string | null; daysOfWeek: number[]
  startDate: string; endDate: string | null; isActive: boolean; showInStore: boolean
  storeBadge: string | null; storeImage: string | null; storeVideo: string | null; priority: number
  products: Array<{ quantity?: number; product: { id: string; name: string; imageUrl: string | null; salePrice?: number } }>
}

interface Product { id: string; name: string; salePrice: number }

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'Descuento %', FIXED_DISCOUNT: 'Descuento S/',
  BUY_X_GET_Y: '2×1 / Lleva más', BUNDLE_PRICE: 'Precio paquete (mismo producto)',
  COMBO: 'Combo (productos distintos)', HAPPY_HOUR: 'Hora feliz',
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function OfferModal({ offer, onClose }: { offer?: Offer; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: offer?.name ?? '',
    description: offer?.description ?? '',
    type: offer?.type ?? 'PERCENTAGE_DISCOUNT',
    value: String(offer?.value ?? ''),
    valueType: offer?.valueType ?? 'PERCENTAGE',
    buyQuantity: String(offer?.buyQuantity ?? 2),
    getQuantity: String(offer?.getQuantity ?? 3),
    startTime: offer?.startTime ?? '14:00',
    endTime: offer?.endTime ?? '18:00',
    daysOfWeek: offer?.daysOfWeek ?? ([] as number[]),
    startDate: offer?.startDate ? offer.startDate.split('T')[0] : todayLimaDateString(),
    endDate: offer?.endDate ? offer.endDate.split('T')[0] : '',
    isActive: offer?.isActive ?? true,
    showInStore: offer?.showInStore ?? true,
    storeBadge: offer?.storeBadge ?? '',
    storeImage: offer?.storeImage ?? '',
    storeVideo: offer?.storeVideo ?? '',
    priority: String(offer?.priority ?? 0),
    productIds: offer?.type !== 'COMBO' ? (offer?.products.map(p => p.product.id) ?? []) : [],
    comboItems: offer?.type === 'COMBO'
      ? offer.products.map(p => ({ productId: p.product.id, name: p.product.name, quantity: p.quantity ?? 1, salePrice: Number(p.product.salePrice ?? 0) }))
      : ([] as Array<{ productId: string; name: string; quantity: number; salePrice: number }>),
  })
  const [productSearch, setProductSearch] = useState('')
  const debouncedProductSearch = useDebouncedValue(productSearch, 300)
  const bannerImageInputRef = useRef<HTMLInputElement>(null)
  const bannerVideoInputRef = useRef<HTMLInputElement>(null)

  const bannerImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('image', file)
      return api.post<{ data: { imageUrl: string } }>('/products/upload-image', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res) => setForm(v => ({ ...v, storeImage: res.data.data.imageUrl })),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const bannerVideoMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('video', file)
      return api.post<{ data: { videoUrl: string } }>('/settings/upload-video', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res) => setForm(v => ({ ...v, storeVideo: res.data.data.videoUrl })),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const { data: products } = useQuery({
    queryKey: ['products-offer-search', debouncedProductSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${debouncedProductSearch}&limit=10`)).data.data,
    enabled: debouncedProductSearch.length >= 2,
  })

  const isPack = form.type === 'BUY_X_GET_Y' || form.type === 'BUNDLE_PRICE'
  const isCombo = form.type === 'COMBO'
  const isHappyHour = form.type === 'HAPPY_HOUR'

  const comboSum = form.comboItems.reduce((s, i) => s + i.salePrice * i.quantity, 0)

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        ...form,
        value: form.type === 'BUY_X_GET_Y' ? 0 : Number(form.value),
        priority: Number(form.priority),
        endDate: form.endDate || undefined,
      }
      if (isPack) {
        payload.buyQuantity = Number(form.buyQuantity)
        payload.getQuantity = Number(form.getQuantity)
      } else {
        delete payload.buyQuantity; delete payload.getQuantity
      }
      if (isHappyHour) {
        payload.valueType = form.valueType
        payload.startTime = form.startTime
        payload.endTime = form.endTime
        payload.daysOfWeek = form.daysOfWeek
      } else {
        delete payload.valueType; delete payload.startTime; delete payload.endTime; delete payload.daysOfWeek
      }
      if (isCombo) {
        payload.comboItems = form.comboItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
        delete payload.productIds
      } else {
        delete payload.comboItems
      }
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
  const addComboProduct = (p: Product) => {
    if (form.comboItems.some(i => i.productId === p.id)) return
    setForm(v => ({ ...v, comboItems: [...v.comboItems, { productId: p.id, name: p.name, quantity: 1, salePrice: Number(p.salePrice) }] }))
    setProductSearch('')
  }
  const updateComboQty = (productId: string, quantity: number) =>
    setForm(v => ({ ...v, comboItems: v.comboItems.map(i => i.productId === productId ? { ...i, quantity } : i) }))
  const removeComboProduct = (productId: string) =>
    setForm(v => ({ ...v, comboItems: v.comboItems.filter(i => i.productId !== productId) }))
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
            {!isPack && !isHappyHour && !isCombo && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Valor {form.type === 'PERCENTAGE_DISCOUNT' ? '(%)' : '(S/)'}
                </label>
                <Input type="number" min={0} value={form.value} onChange={set('value')} placeholder="20" />
              </div>
            )}
            {isCombo && (
              <div>
                <label className="mb-1 block text-sm font-medium">Precio total del combo (S/)</label>
                <Input type="number" min={0} step={0.1} value={form.value} onChange={set('value')} placeholder="4.30" />
              </div>
            )}
            {form.type === 'BUNDLE_PRICE' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Precio del paquete (S/)</label>
                <Input type="number" min={0} step={0.1} value={form.value} onChange={set('value')} placeholder="9.00" />
              </div>
            )}
            {form.type === 'BUY_X_GET_Y' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Paga (unidades)</label>
                  <Input type="number" min={1} value={form.buyQuantity} onChange={set('buyQuantity')} placeholder="2" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Se lleva (unidades)</label>
                  <Input type="number" min={1} value={form.getQuantity} onChange={set('getQuantity')} placeholder="3" />
                </div>
              </>
            )}
            {form.type === 'BUNDLE_PRICE' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Unidades por paquete</label>
                <Input type="number" min={1} value={form.getQuantity} onChange={set('getQuantity')} placeholder="2" />
              </div>
            )}
            {isHappyHour && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo de valor</label>
                  <select value={form.valueType} onChange={set('valueType')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="PERCENTAGE">Porcentaje (%)</option>
                    <option value="FIXED">Monto fijo (S/)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Valor {form.valueType === 'PERCENTAGE' ? '(%)' : '(S/)'}
                  </label>
                  <Input type="number" min={0} value={form.value} onChange={set('value')} placeholder="20" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Hora inicio</label>
                  <Input type="time" value={form.startTime} onChange={set('startTime')} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Hora fin</label>
                  <Input type="time" value={form.endTime} onChange={set('endTime')} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium">Días (ninguno = todos los días)</label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, idx) => (
                      <button key={idx} type="button"
                        onClick={() => setForm(v => ({
                          ...v,
                          daysOfWeek: v.daysOfWeek.includes(idx) ? v.daysOfWeek.filter(d => d !== idx) : [...v.daysOfWeek, idx],
                        }))}
                        className={cn('px-2.5 py-1 rounded-md text-xs font-medium border',
                          form.daysOfWeek.includes(idx) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background')}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
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

          {form.showInStore && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Banner del carrusel de ofertas</p>
              <p className="text-xs text-muted-foreground -mt-2">
                Si subes un video, se reproduce en el carrusel en lugar de la imagen (más llamativo). La imagen
                queda como respaldo si el navegador no puede reproducir el video.
              </p>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Imagen</label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden shrink-0">
                      {form.storeImage ? (
                        <img src={form.storeImage} alt="Banner" className="h-full w-full object-cover" />
                      ) : (
                        <Image className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <input ref={bannerImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) bannerImageMutation.mutate(f); e.target.value = '' }} />
                    <Button type="button" variant="outline" size="sm" loading={bannerImageMutation.isPending}
                      onClick={() => bannerImageInputRef.current?.click()}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />{form.storeImage ? 'Cambiar' : 'Subir'}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Video (opcional)</label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden shrink-0">
                      {form.storeVideo ? (
                        <video src={form.storeVideo} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                      ) : (
                        <Video className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <input ref={bannerVideoInputRef} type="file" accept="video/mp4,video/webm" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) bannerVideoMutation.mutate(f); e.target.value = '' }} />
                    <div className="flex flex-col gap-1">
                      <Button type="button" variant="outline" size="sm" loading={bannerVideoMutation.isPending}
                        onClick={() => bannerVideoInputRef.current?.click()}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />{form.storeVideo ? 'Cambiar' : 'Subir'}
                      </Button>
                      {form.storeVideo && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => setForm(v => ({ ...v, storeVideo: '' }))}>
                          Quitar video
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Products */}
          {isCombo ? (
            <div>
              <label className="mb-1 block text-sm font-medium">Productos del combo * (mínimo 2 distintos)</label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Todos deben estar en el carrito juntos para que se aplique el precio del combo.
              </p>
              <div className="relative mb-2">
                <Input placeholder="Buscar producto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                {products && products.length > 0 && productSearch.length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 border rounded-lg bg-popover shadow divide-y max-h-40 overflow-y-auto">
                    {products.map(p => (
                      <button key={p.id} onClick={() => addComboProduct(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">{formatCurrency(p.salePrice)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {form.comboItems.map(i => (
                  <div key={i.productId} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <span className="text-sm flex-1">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{formatCurrency(i.salePrice)} c/u</span>
                    <Input type="number" min={1} value={i.quantity}
                      onChange={e => updateComboQty(i.productId, Math.max(1, Number(e.target.value)))}
                      className="h-8 w-16 text-center" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => removeComboProduct(i.productId)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {form.comboItems.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Suma por separado: <span className="line-through">{formatCurrency(comboSum)}</span>
                  {' '}→ Combo: <span className="font-bold text-success">{formatCurrency(Number(form.value) || 0)}</span>
                  {comboSum > 0 && Number(form.value) > 0 && (
                    <> (ahorro {formatCurrency(comboSum - Number(form.value))})</>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">Productos en la oferta *</label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Sin productos elegidos, la oferta no aparece ni se puede aplicar en el POS.
              </p>
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
          )}
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={
            !form.name ||
            (!isCombo && form.productIds.length === 0) ||
            (isCombo && (form.comboItems.length < 2 || !form.value)) ||
            (form.type === 'PERCENTAGE_DISCOUNT' && !form.value) ||
            (form.type === 'FIXED_DISCOUNT' && !form.value) ||
            (form.type === 'BUNDLE_PRICE' && (!form.value || !form.getQuantity)) ||
            (form.type === 'BUY_X_GET_Y' && (!form.buyQuantity || !form.getQuantity)) ||
            (isHappyHour && (!form.value || !form.startTime || !form.endTime))
          }>
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
                      {offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.value}%` :
                       offer.type === 'BUNDLE_PRICE' ? `${offer.getQuantity ?? '?'} x ${formatCurrency(offer.value)}` :
                       offer.type === 'BUY_X_GET_Y' ? `Paga ${offer.buyQuantity ?? '?'}, lleva ${offer.getQuantity ?? '?'}` :
                       offer.type === 'HAPPY_HOUR' ? (offer.valueType === 'FIXED' ? formatCurrency(offer.value) : `${offer.value}%`) :
                       offer.type === 'COMBO' ? `${offer.products.length} productos = ${formatCurrency(offer.value)}` :
                       formatCurrency(offer.value)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {offer.type === 'HAPPY_HOUR' && offer.startTime && (
                        <p className="font-medium text-foreground">
                          {offer.startTime}–{offer.endTime} {offer.daysOfWeek.length > 0 ? offer.daysOfWeek.map(d => DAY_LABELS[d]).join(',') : 'Todos los días'}
                        </p>
                      )}
                      {/* startDate/endDate se guardan como fecha (sin hora) en UTC medianoche
                          representando el día calendario de Lima — hay que leerlos en UTC, no
                          en hora de Lima, o se corren un día para atrás. */}
                      <p>{new Date(offer.startDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</p>
                      {offer.endDate && <p>→ {new Date(offer.endDate).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</p>}
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
                        <Button variant="ghost" size="sm" onClick={() => setViewPerf(viewPerf === offer.id ? null : offer.id)}
                          title="Ver rendimiento">
                          <TrendingUp className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => { if (confirm('¿Eliminar esta oferta?')) deleteMutation.mutate(offer.id) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Filas de rendimiento — separadas para evitar JSX inválido dentro del map */}
                {viewPerf && (data ?? []).filter(o => o.id === viewPerf).map(offer => (
                  <tr key={`${offer.id}-perf`}>
                    <td colSpan={7} className="bg-muted/20 px-6 py-4">
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />Rendimiento de "{offer.name}"
                      </p>
                      <OfferPerformance offer={offer} />
                    </td>
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
      const to = offer.endDate ? offer.endDate.split('T')[0] : todayLimaDateString()
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
