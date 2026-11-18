// Notificaciones push a clientes de la tienda online: enviar ahora o
// programar, con destino (ofertas, catálogo, inicio o un producto).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Clock, Package, Search, Send, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, EmptyState, Field, PageHeader, Panel, Segmented, StatusBadge, fieldCls, useConfirm } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatDateTime, cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

interface ScheduledNotification {
  id: string
  title: string
  body: string
  url: string
  scheduledAt: string
  sentAt: string | null
  createdAt: string
}

// Formatea "ahora" (hora del navegador) al formato que espera un input
// datetime-local (YYYY-MM-DDTHH:mm) — quien usa el ERP está físicamente en
// Pachacamac, así que la hora del navegador ya es la hora de Lima.
function nowForInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const URL_OPTIONS = [
  { value: '/ofertas', label: 'Ofertas' },
  { value: '/catalogo', label: 'Catálogo' },
  { value: '/', label: 'Inicio' },
  { value: '__product__', label: 'Un producto específico...' },
]

interface ProductOption { id: string; name: string; salePrice: number; imageUrl: string | null }

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/ofertas')
  const [scheduledAt, setScheduledAt] = useState(nowForInput())

  // Destino "producto específico": en vez de mandar al catálogo/ofertas
  // generales, la notificación abre directo /producto/:id — útil para avisos
  // puntuales tipo "bajó el huevo" donde el cliente quiere llegar al
  // producto ya, no navegar hasta encontrarlo.
  const [productSearch, setProductSearch] = useState('')
  const debouncedProductSearch = useDebouncedValue(productSearch, 300)
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)

  const { data: productResults } = useQuery({
    queryKey: ['notification-product-search', debouncedProductSearch],
    queryFn: async () => (await api.get<{ data: ProductOption[] }>(`/products?q=${encodeURIComponent(debouncedProductSearch)}&limit=8`)).data.data,
    enabled: url === '__product__' && debouncedProductSearch.length >= 2 && !selectedProduct,
  })

  const { data: subscriberCount } = useQuery({
    queryKey: ['push-subscriber-count'],
    queryFn: async () => (await api.get<{ data: { count: number } }>('/store/push/admin/subscriber-count')).data.data.count,
  })

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['scheduled-notifications'],
    queryFn: async () => (await api.get<{ data: ScheduledNotification[] }>('/store/push/admin/notifications')).data.data,
    refetchInterval: 30000,
  })

  const sendMutation = useMutation({
    mutationFn: (data: { title: string; body: string; url: string; scheduledAt: string }) =>
      api.post('/store/push/admin/notifications', data),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] })
      const isNow = new Date(vars.scheduledAt) <= new Date()
      toast.success(isNow ? 'Notificación enviada.' : 'Notificación programada.')
      setTitle(''); setBody(''); setUrl('/ofertas'); setScheduledAt(nowForInput()); setMode('now')
      setSelectedProduct(null); setProductSearch('')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/store/push/admin/notifications/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scheduled-notifications'] }); toast.success('Notificación cancelada.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { toast.error('Completa el título y el mensaje.'); return }
    if (url === '__product__' && !selectedProduct) { toast.error('Busca y elige el producto al que debe llevar la notificación.'); return }
    if (mode === 'later' && new Date(scheduledAt) <= new Date()) {
      toast.error('Elige una fecha/hora futura para programar el envío.')
      return
    }
    const when = mode === 'now' ? new Date().toISOString() : new Date(scheduledAt).toISOString()
    const targetUrl = url === '__product__' ? `/producto/${selectedProduct!.id}` : url
    sendMutation.mutate({ title: title.trim(), body: body.trim(), url: targetUrl, scheduledAt: when })
  }

  const pending = (notifications ?? []).filter(n => !n.sentAt)
  const sent = (notifications ?? []).filter(n => n.sentAt)
  const cancel = async (n: ScheduledNotification) => {
    const r = await confirm({ title: `Cancelar «${n.title}»`, description: 'La notificación programada no se enviará.', confirmLabel: 'Cancelar envío' })
    if (r.ok) cancelMutation.mutate(n.id)
  }
  const thumb = (p: ProductOption) => p.imageUrl
    ? <img src={p.imageUrl} alt="" className="size-6 rounded-[4px] object-cover" />
    : <Package className="size-4 text-ink-muted" />

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Notificaciones" actions={
        <span className="inline-flex items-center gap-1.5 text-table text-ink-muted"><Users className="size-4" />{subscriberCount ?? '—'} suscritos a avisos</span>
      }>
        <p className="text-table text-ink-muted">Avisa a tus clientes lo que quieras, cuando quieras, no sólo ofertas automáticas</p>
      </PageHeader>

      <Panel title="Nueva notificación" bodyClassName="p-4">
        <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
          <Field label={`Título (${title.length}/65)`}>
            <input className={fieldCls} value={title} onChange={e => setTitle(e.target.value.slice(0, 65))} placeholder="Ej: Bajó el pollo" maxLength={65} />
          </Field>
          <Field label={`Mensaje (${body.length}/180)`}>
            <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 180))} rows={3} maxLength={180}
              placeholder="Ej: S/ 6.50 el kg, pídelo ahora por la app y recibe en 20min contra entrega."
              className={cn(fieldCls, 'h-auto py-2')} />
          </Field>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="Al tocarla, abre">
              <select className={fieldCls} value={url} onChange={e => { setUrl(e.target.value); setSelectedProduct(null); setProductSearch('') }}>
                {URL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-table font-medium text-ink">¿Cuándo?</span>
              <Segmented ariaLabel="Cuándo enviar" size="md" value={mode} onChange={setMode} options={[['now', 'Ahora'], ['later', 'Programar']]} />
            </div>
            {mode === 'later' && (
              <Field label="Fecha y hora">
                <input type="datetime-local" className={fieldCls} value={scheduledAt} min={nowForInput()} onChange={e => setScheduledAt(e.target.value)} />
              </Field>
            )}
          </div>

          {url === '__product__' && (
            selectedProduct ? (
              <div className="flex max-w-sm items-center gap-2 rounded-ctl bg-surface-2 px-3 py-2 text-table">
                {thumb(selectedProduct)}
                <span className="flex-1 font-medium text-ink">{selectedProduct.name}</span>
                <Btn size="sm" variant="ghost" aria-label="Cambiar producto" onClick={() => { setSelectedProduct(null); setProductSearch('') }}><X /></Btn>
              </div>
            ) : (
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input className={cn(fieldCls, 'pl-8')} value={productSearch} onChange={e => setProductSearch(e.target.value)}
                  aria-label="Buscar producto" placeholder="Busca el producto (ej: huevo)..." />
                {debouncedProductSearch.length >= 2 && (productResults?.length ?? 0) > 0 && (
                  <div className="absolute z-10 mt-1 w-full divide-y divide-line rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
                    {productResults!.map(p => (
                      <button key={p.id} type="button" onClick={() => { setSelectedProduct(p); setProductSearch('') }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-table hover:bg-surface-2">
                        {thumb(p)}<span className="flex-1 truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {debouncedProductSearch.length >= 2 && productResults?.length === 0 && (
                  <p className="mt-1 text-meta text-ink-muted">Ningún producto coincide.</p>
                )}
              </div>
            )
          )}

          <div>
            <Btn type="submit" variant="primary" loading={sendMutation.isPending}>
              {!sendMutation.isPending && (mode === 'now' ? <Send /> : <Clock />)}
              {sendMutation.isPending ? 'Enviando...' : mode === 'now' ? 'Enviar ahora' : 'Programar envío'}
            </Btn>
          </div>
        </form>
      </Panel>

      {pending.length > 0 && (
        <Panel title="Programadas" meta={String(pending.length)} bodyClassName="divide-y divide-line">
          {pending.map(n => (
            <div key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-table font-medium text-ink">{n.title}</p>
                <p className="line-clamp-2 text-table text-ink-muted">{n.body}</p>
                <p className="mt-1 flex items-center gap-1 text-meta tabular-nums text-ink-muted"><Clock className="size-3" />{formatDateTime(n.scheduledAt)}</p>
              </div>
              <Btn size="sm" variant="ghost" aria-label={`Cancelar ${n.title}`} onClick={() => cancel(n)}><X /></Btn>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Historial" bodyClassName="divide-y divide-line">
        {isLoading ? (
          <div className="py-8 text-center text-table text-ink-muted">Cargando…</div>
        ) : sent.length === 0 ? (
          <EmptyState icon={Bell} title="Todavía no se envió ninguna notificación manual." />
        ) : sent.map(n => (
          <div key={n.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-table font-medium text-ink">{n.title}</p>
              <p className="line-clamp-2 text-table text-ink-muted">{n.body}</p>
            </div>
            <StatusBadge tone="ok" className="shrink-0">Enviada {formatDateTime(n.sentAt!)}</StatusBadge>
          </div>
        ))}
      </Panel>
    </div>
  )
}
