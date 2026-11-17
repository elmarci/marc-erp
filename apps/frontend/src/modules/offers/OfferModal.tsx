// Crear o editar una oferta: tipo, valor, vigencia, productos (por unidad o
// paquete), combo, hora feliz y banner de la tienda online.
import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Image, Upload, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, Check, Field, Modal, Segmented, fieldCls } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, todayLimaDateString, cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  DAY_LABELS, TYPE_LABELS, hasPackCfg, presentationLabel, priceOf, toSel,
  type Offer, type Product, type SelItem,
} from './offerTypes'

const numCls = cn(fieldCls, 'text-right tabular-nums')

// Resultados de búsqueda: cada producto con paquete ofrece dos filas, unidad y paquete.
function ProductResults({ products, allowPack, onPick }: {
  products: Product[]; allowPack: boolean; onPick: (p: Product, asPack: boolean) => void
}) {
  return (
    <div className="absolute z-10 mt-1 max-h-48 w-full divide-y divide-line overflow-y-auto rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
      {products.map(p => (
        <div key={p.id}>
          <button type="button" onClick={() => onPick(p, false)}
            className="flex w-full justify-between px-3 py-2 text-left text-table hover:bg-surface-2">
            <span>{p.name}</span>
            <span className="tabular-nums text-ink-muted">{formatCurrency(p.salePrice)}</span>
          </button>
          {allowPack && hasPackCfg(p) && (
            <button type="button" onClick={() => onPick(p, true)}
              className="flex w-full justify-between bg-surface-2 py-1.5 pl-7 pr-3 text-left text-meta hover:bg-ink/[0.05]">
              <span>{p.packLabel || 'Paquete'} x{p.packSize} de {p.name}</span>
              <span className="font-semibold tabular-nums">{formatCurrency(Number(p.packPrice))}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Unidad o paquete, para productos que tienen paquete configurado. */
function PackSwitch({ item, onChange }: { item: SelItem; onChange: (asPack: boolean) => void }) {
  return (
    <Segmented ariaLabel={`Presentación de ${item.name}`} value={item.asPack ? 'pack' : 'unit'} onChange={(v) => onChange(v === 'pack')}
      options={[['unit', 'Unidad'], ['pack', `${item.packLabel || 'Paquete'} x${item.packSize}`]]} />
  )
}

export function OfferModal({ offer, onClose }: { offer?: Offer; onClose: () => void }) {
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
    storeFullDesign: offer?.storeFullDesign ?? false,
    priority: String(offer?.priority ?? 0),
    items: offer && offer.type !== 'COMBO'
      ? offer.products.map(p => toSel({ id: p.product.id, name: p.product.name, salePrice: Number(p.product.salePrice ?? 0), packSize: p.product.packSize, packPrice: p.product.packPrice, packLabel: p.product.packLabel }, !!p.asPack))
      : ([] as SelItem[]),
    comboItems: offer?.type === 'COMBO'
      ? offer.products.map(p => ({
        ...toSel({ id: p.product.id, name: p.product.name, salePrice: Number(p.product.salePrice ?? 0), packSize: p.product.packSize, packPrice: p.product.packPrice, packLabel: p.product.packLabel }, !!p.asPack),
        quantity: p.quantity ?? 1,
      }))
      : ([] as Array<SelItem & { quantity: number }>),
  })
  const [productSearch, setProductSearch] = useState('')
  const debouncedProductSearch = useDebouncedValue(productSearch, 300)
  const bannerImageInputRef = useRef<HTMLInputElement>(null)
  const bannerVideoInputRef = useRef<HTMLInputElement>(null)

  const bannerImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('image', file)
      return api.post<{ data: { imageUrl: string } }>('/settings/upload-banner-image', body, {
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

  const comboSum = form.comboItems.reduce((s, i) => s + priceOf(i) * i.quantity, 0)

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
        payload.comboItems = form.comboItems.map(i => ({ productId: i.productId, quantity: i.quantity, asPack: i.asPack }))
        delete payload.productIds; delete payload.packProductIds
      } else {
        payload.productIds = form.items.map(i => i.productId)
        payload.packProductIds = form.items.filter(i => i.asPack).map(i => i.productId)
        delete payload.comboItems
      }
      delete payload.items
      return offer ? api.put(`/promotions/${offer.id}`, payload) : api.post('/promotions', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] })
      toast.success(offer ? 'Oferta actualizada.' : 'Oferta creada.')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  // Elegir un producto ya agregado cambia su presentación (unidad ↔ paquete):
  // en una misma oferta un producto entra de una sola forma.
  const addProduct = (p: Product, asPack = false) => {
    setForm(v => ({
      ...v,
      items: v.items.some(i => i.productId === p.id)
        ? v.items.map(i => i.productId === p.id ? toSel(p, asPack) : i)
        : [...v.items, toSel(p, asPack)],
    }))
    setProductSearch('')
  }
  const addComboProduct = (p: Product, asPack = false) => {
    setForm(v => ({
      ...v,
      comboItems: v.comboItems.some(i => i.productId === p.id)
        ? v.comboItems.map(i => i.productId === p.id ? { ...toSel(p, asPack), quantity: i.quantity } : i)
        : [...v.comboItems, { ...toSel(p, asPack), quantity: 1 }],
    }))
    setProductSearch('')
  }
  const setItemPack = (productId: string, asPack: boolean) =>
    setForm(v => ({ ...v, items: v.items.map(i => i.productId === productId ? { ...i, asPack } : i) }))
  const setComboPack = (productId: string, asPack: boolean) =>
    setForm(v => ({ ...v, comboItems: v.comboItems.map(i => i.productId === productId ? { ...i, asPack } : i) }))
  const updateComboQty = (productId: string, quantity: number) =>
    setForm(v => ({ ...v, comboItems: v.comboItems.map(i => i.productId === productId ? { ...i, quantity } : i) }))
  const removeComboProduct = (productId: string) =>
    setForm(v => ({ ...v, comboItems: v.comboItems.filter(i => i.productId !== productId) }))
  const removeProduct = (id: string) => setForm(v => ({ ...v, items: v.items.filter(x => x.productId !== id) }))
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const canSave = !(
    !form.name ||
    (!isCombo && form.items.length === 0) ||
    (isCombo && (form.comboItems.length < 2 || !form.value)) ||
    (form.type === 'PERCENTAGE_DISCOUNT' && !form.value) ||
    (form.type === 'FIXED_DISCOUNT' && !form.value) ||
    (form.type === 'BUNDLE_PRICE' && (!form.value || !form.getQuantity)) ||
    (form.type === 'BUY_X_GET_Y' && (!form.buyQuantity || !form.getQuantity)) ||
    (isHappyHour && (!form.value || !form.startTime || !form.endTime))
  )
  const search = (onPick: (p: Product, asPack: boolean) => void, allowPack: boolean) => (
    <div className="relative">
      <input className={fieldCls} placeholder="Buscar producto…" aria-label="Buscar producto" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
      {products && products.length > 0 && productSearch.length >= 2 && <ProductResults products={products} allowPack={allowPack} onPick={onPick} />}
    </div>
  )

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" keepOpen title={offer ? 'Editar oferta' : 'Nueva oferta'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSave}>{offer ? 'Guardar cambios' : 'Crear oferta'}</Btn>
      </>}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre de la oferta" required className="col-span-2"><input className={fieldCls} value={form.name} onChange={set('name')} placeholder="Ej: 20% en bebidas" /></Field>
          <Field label="Tipo de descuento">
            <select className={fieldCls} value={form.type} onChange={set('type')}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {!isPack && !isHappyHour && !isCombo && (
            <Field label={`Valor ${form.type === 'PERCENTAGE_DISCOUNT' ? '(%)' : '(S/)'}`}><input type="number" min={0} className={numCls} value={form.value} onChange={set('value')} placeholder="20" /></Field>
          )}
          {isCombo && (
            <Field label="Precio total del combo (S/)"><input type="number" min={0} step={0.1} className={numCls} value={form.value} onChange={set('value')} placeholder="4.30" /></Field>
          )}
          {form.type === 'BUNDLE_PRICE' && (<>
            <Field label="Precio del paquete (S/)"><input type="number" min={0} step={0.1} className={numCls} value={form.value} onChange={set('value')} placeholder="9.00" /></Field>
            <Field label="Unidades por paquete"><input type="number" min={1} className={numCls} value={form.getQuantity} onChange={set('getQuantity')} placeholder="2" /></Field>
          </>)}
          {form.type === 'BUY_X_GET_Y' && (<>
            <Field label="Paga (unidades)"><input type="number" min={1} className={numCls} value={form.buyQuantity} onChange={set('buyQuantity')} placeholder="2" /></Field>
            <Field label="Se lleva (unidades)"><input type="number" min={1} className={numCls} value={form.getQuantity} onChange={set('getQuantity')} placeholder="3" /></Field>
          </>)}
          {isHappyHour && (<>
            <Field label="Tipo de valor">
              <select className={fieldCls} value={form.valueType} onChange={set('valueType')}>
                <option value="PERCENTAGE">Porcentaje (%)</option>
                <option value="FIXED">Monto fijo (S/)</option>
              </select>
            </Field>
            <Field label={`Valor ${form.valueType === 'PERCENTAGE' ? '(%)' : '(S/)'}`}><input type="number" min={0} className={numCls} value={form.value} onChange={set('value')} placeholder="20" /></Field>
            <Field label="Hora inicio"><input type="time" className={fieldCls} value={form.startTime} onChange={set('startTime')} /></Field>
            <Field label="Hora fin"><input type="time" className={fieldCls} value={form.endTime} onChange={set('endTime')} /></Field>
            <div className="col-span-2 flex flex-col gap-1.5">
              <span className="text-table font-medium text-ink">Días (ninguno = todos los días)</span>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, idx) => {
                  const on = form.daysOfWeek.includes(idx)
                  return (
                    <button key={idx} type="button" aria-pressed={on}
                      onClick={() => setForm(v => ({ ...v, daysOfWeek: on ? v.daysOfWeek.filter(d => d !== idx) : [...v.daysOfWeek, idx] }))}
                      className={cn('tap h-8 rounded-ctl px-2.5 text-table font-medium transition-colors',
                        on ? 'bg-ink text-on-ink' : 'text-ink-muted shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2')}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>)}
          <Field label="Fecha inicio" required><input type="date" className={fieldCls} value={form.startDate} onChange={set('startDate')} /></Field>
          <Field label="Fecha fin (opcional)"><input type="date" className={fieldCls} value={form.endDate} onChange={set('endDate')} /></Field>
          <Field label="Badge en tienda"><input className={fieldCls} value={form.storeBadge} onChange={set('storeBadge')} placeholder="OFERTA, 2×1, HOY SOLO..." /></Field>
          <Field label="Prioridad (mayor = arriba)"><input type="number" className={numCls} value={form.priority} onChange={set('priority')} /></Field>
          <Field label="Descripción" className="col-span-2"><input className={fieldCls} value={form.description} onChange={set('description')} placeholder="Descripción visible en la tienda…" /></Field>
        </div>

        <div className="flex flex-wrap gap-5 text-table">
          <label className="flex cursor-pointer items-center gap-2">
            <Check checked={form.isActive} onChange={() => setForm(v => ({ ...v, isActive: !v.isActive }))} label="Activa" />Activa
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Check checked={form.showInStore} onChange={() => setForm(v => ({ ...v, showInStore: !v.showInStore }))} label="Mostrar en tienda online" />Mostrar en tienda online
          </label>
        </div>

        {form.showInStore && (
          <section className="flex flex-col gap-3 rounded-ctl border border-line p-3">
            <div>
              <p className="text-table font-medium text-ink">Banner del carrusel de ofertas</p>
              <p className="text-meta text-ink-muted">
                Si subes un video, se reproduce en el carrusel en lugar de la imagen (más llamativo). La imagen queda como
                respaldo si el navegador no puede reproducir el video. La imagen se muestra completa, sin recortarla: cualquier
                proporción funciona. Para que se vea a pantalla completa sin franjas de fondo, usa un formato horizontal ancho
                (ej. 1200×675px, 16:9).
              </p>
            </div>
            <div className="flex flex-wrap gap-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-ink-muted">Imagen</span>
                <div className="flex items-center gap-2">
                  <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-ctl bg-ink/[0.04] shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]">
                    {form.storeImage ? <img src={form.storeImage} alt="Banner" className="size-full object-cover" /> : <Image className="size-5 text-ink-muted/50" />}
                  </div>
                  <input ref={bannerImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) bannerImageMutation.mutate(f); e.target.value = '' }} />
                  <Btn size="sm" loading={bannerImageMutation.isPending} onClick={() => bannerImageInputRef.current?.click()}>
                    <Upload />{form.storeImage ? 'Cambiar' : 'Subir'}
                  </Btn>
                </div>
                {form.storeImage && (
                  <label className="flex max-w-xs cursor-pointer items-start gap-2 text-meta text-ink-muted">
                    <span className="pt-0.5"><Check checked={form.storeFullDesign} onChange={() => setForm(v => ({ ...v, storeFullDesign: !v.storeFullDesign }))} label="Es un diseño ya armado" /></span>
                    Es un diseño ya armado (flyer con texto y precio): no superponer título, badge ni precio
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-ink-muted">Video (opcional)</span>
                <div className="flex items-center gap-2">
                  <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-ctl bg-ink/[0.04] shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]">
                    {form.storeVideo ? <video src={form.storeVideo} className="size-full object-cover" muted loop autoPlay playsInline /> : <Video className="size-5 text-ink-muted/50" />}
                  </div>
                  <input ref={bannerVideoInputRef} type="file" accept="video/mp4,video/webm" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) bannerVideoMutation.mutate(f); e.target.value = '' }} />
                  <div className="flex flex-col gap-1">
                    <Btn size="sm" loading={bannerVideoMutation.isPending} onClick={() => bannerVideoInputRef.current?.click()}>
                      <Upload />{form.storeVideo ? 'Cambiar' : 'Subir'}
                    </Btn>
                    {form.storeVideo && <Btn size="sm" variant="ghost" onClick={() => setForm(v => ({ ...v, storeVideo: '' }))}>Quitar video</Btn>}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {isCombo ? (
          <section className="flex flex-col gap-2">
            <div>
              <p className="text-table font-medium text-ink">Productos del combo <span className="text-bad-ink">*</span> <span className="font-normal text-ink-muted">(mínimo 2 distintos)</span></p>
              <p className="text-meta text-ink-muted">Todos deben estar en el carrito juntos para que se aplique el precio del combo.</p>
            </div>
            {search(addComboProduct, true)}
            {form.comboItems.map(i => (
              <div key={i.productId} className="flex flex-wrap items-center gap-2 rounded-ctl border border-line px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-table">{i.name}</p>
                  <p className="text-meta text-ink-muted">{formatCurrency(priceOf(i))} c/u</p>
                </div>
                {hasPackCfg(i) && <PackSwitch item={i} onChange={(asPack) => setComboPack(i.productId, asPack)} />}
                <input type="number" min={1} aria-label={`Cantidad de ${i.name}`} value={i.quantity}
                  onChange={e => updateComboQty(i.productId, Math.max(1, Number(e.target.value)))} className={cn(numCls, 'h-8 w-16')} />
                <Btn size="sm" variant="ghost" aria-label={`Quitar ${i.name}`} onClick={() => removeComboProduct(i.productId)}><X /></Btn>
              </div>
            ))}
            {form.comboItems.length > 0 && (
              <p className="text-meta text-ink-muted">
                Suma por separado: <span className="line-through tabular-nums">{formatCurrency(comboSum)}</span>. Combo:{' '}
                <span className="font-semibold tabular-nums text-ink">{formatCurrency(Number(form.value) || 0)}</span>
                {comboSum > 0 && Number(form.value) > 0 && <> (ahorro {formatCurrency(comboSum - Number(form.value))})</>}
              </p>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-2">
            <div>
              <p className="text-table font-medium text-ink">Productos en la oferta <span className="text-bad-ink">*</span></p>
              <p className="text-meta text-ink-muted">Sin productos elegidos, la oferta no aparece ni se puede aplicar en el POS.</p>
            </div>
            {search(addProduct, !isHappyHour)}
            {form.items.map(i => (
              <div key={i.productId} className="flex flex-wrap items-center gap-2 rounded-ctl border border-line px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-table">{i.name}</p>
                  <p className="text-meta text-ink-muted">{presentationLabel(i)} · {formatCurrency(priceOf(i))}</p>
                </div>
                {hasPackCfg(i) && !isHappyHour && <PackSwitch item={i} onChange={(asPack) => setItemPack(i.productId, asPack)} />}
                <Btn size="sm" variant="ghost" aria-label={`Quitar ${i.name}`} onClick={() => removeProduct(i.productId)}><X /></Btn>
              </div>
            ))}
            {form.items.some(i => i.asPack) && (
              <p className="text-meta text-ink-muted">Las ofertas sobre paquetes/cajas se aplican solo en el punto de venta (no se muestran en la tienda online).</p>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
