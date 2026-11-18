// Ofertas y promociones: lista, activar o pausar, rendimiento por oferta,
// crear, editar y eliminar.
import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus, Tag, Trash2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  Btn, EmptyState, PageHeader, RowMenu, StatCard, StatGrid, StatusBadge, surfaceCls, tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, todayLimaDateString, cn } from '@/lib/utils'
import { OfferModal } from './OfferModal'
import { DAY_LABELS, TYPE_LABELS, offerValueText, type Offer } from './offerTypes'

// startDate/endDate se guardan a medianoche UTC representando el día de Lima:
// se leen en UTC para no correrlos un día.
const dateUTC = (d: string) => new Date(d).toLocaleDateString('es-PE', { timeZone: 'UTC' })

export function OffersPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [showModal, setShowModal] = useState(false)
  const [editOffer, setEditOffer] = useState<Offer | undefined>()
  const [viewPerf, setViewPerf] = useState<string | null>(null)

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

  const remove = async (offer: Offer) => {
    const r = await confirm({ title: `Eliminar la oferta "${offer.name}"`, confirmLabel: 'Eliminar', tone: 'danger' })
    if (r.ok) deleteMutation.mutate(offer.id)
  }
  const edit = (offer: Offer) => { setEditOffer(offer); setShowModal(true) }
  const offers = data ?? []

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Ofertas y promociones"
        actions={<Btn variant="primary" onClick={() => { setEditOffer(undefined); setShowModal(true) }}><Plus />Nueva oferta</Btn>}>
        <p className="text-table text-ink-muted">Ofertas del punto de venta y la tienda online</p>
      </PageHeader>

      <div className={cn('overflow-hidden', surfaceCls)}>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : offers.length === 0 ? <EmptyState icon={Tag} title="No hay ofertas creadas aún" /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Oferta</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Tipo</th>
                <th className={cn(thCls, 'text-right')}>Valor</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Vigencia</th>
                <th className={cn(thCls, 'hidden lg:table-cell')}>Tienda</th>
                <th className={thCls}>Estado</th>
                <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {offers.map((offer) => (
                  <Fragment key={offer.id}>
                    <tr className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="font-medium">{offer.name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-meta text-ink-muted">
                          {offer.storeBadge && <span className="rounded-[3px] bg-ink/[0.06] px-1 font-medium text-ink">{offer.storeBadge}</span>}
                          <span className="md:hidden">{TYPE_LABELS[offer.type] ?? offer.type}</span>
                        </div>
                      </td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{TYPE_LABELS[offer.type] ?? offer.type}</td>
                      <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{offerValueText(offer)}</td>
                      <td className={cn(tdCls, 'hidden text-meta text-ink-muted sm:table-cell')}>
                        {offer.type === 'HAPPY_HOUR' && offer.startTime && (
                          <div className="font-medium text-ink">
                            {offer.startTime}–{offer.endTime} {offer.daysOfWeek.length > 0 ? offer.daysOfWeek.map((d) => DAY_LABELS[d]).join(',') : 'Todos los días'}
                          </div>
                        )}
                        <div className="tabular-nums">{dateUTC(offer.startDate)}{offer.endDate ? ` al ${dateUTC(offer.endDate)}` : ''}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden lg:table-cell')}>
                        {offer.showInStore
                          ? <span className="inline-flex items-center gap-1 text-meta text-ink"><Eye className="size-4 text-ok" />Visible</span>
                          : <span className="inline-flex items-center gap-1 text-meta text-ink-muted"><EyeOff className="size-4" />Oculta</span>}
                      </td>
                      <td className={tdCls}>
                        <button type="button" onClick={() => toggleMutation.mutate(offer.id)} title={offer.isActive ? 'Pausar oferta' : 'Activar oferta'}
                          aria-label={offer.isActive ? `Pausar ${offer.name}` : `Activar ${offer.name}`}>
                          <StatusBadge tone={offer.isActive ? 'ok' : 'muted'}>{offer.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
                        </button>
                      </td>
                      <td className={cn(tdCls, 'px-1')}>
                        <div className="flex items-center justify-end gap-1">
                          <Btn size="sm" onClick={() => edit(offer)}><Pencil />Editar</Btn>
                          <RowMenu label={`Acciones de ${offer.name}`} actions={[
                            { label: viewPerf === offer.id ? 'Ocultar rendimiento' : 'Ver rendimiento', icon: TrendingUp, onSelect: () => setViewPerf(viewPerf === offer.id ? null : offer.id) },
                            { label: offer.isActive ? 'Pausar' : 'Activar', icon: offer.isActive ? EyeOff : Eye, onSelect: () => toggleMutation.mutate(offer.id) },
                            { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => remove(offer) },
                          ]} />
                        </div>
                      </td>
                    </tr>
                    {viewPerf === offer.id && (
                      <tr>
                        <td colSpan={7} className="border-b border-line bg-surface-2 px-4 py-4">
                          <p className="mb-3 text-table font-medium text-ink">Rendimiento de «{offer.name}»</p>
                          <OfferPerformance offer={offer} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <OfferModal offer={editOffer} onClose={() => setShowModal(false)} />}
    </div>
  )
}

/* ─── Rendimiento: ventas de los productos de la oferta en su vigencia ──── */
function OfferPerformance({ offer }: { offer: Offer }) {
  const { data } = useQuery({
    queryKey: ['offer-performance', offer.id],
    queryFn: async () => {
      const from = offer.startDate.split('T')[0]
      const to = offer.endDate ? offer.endDate.split('T')[0] : todayLimaDateString()
      const productIds = offer.products.map((p) => p.product.id)
      if (!productIds.length) return null
      const res = await api.get<{ data: Array<{ product_id: string; name: string; quantity: number; revenue: number; transactions: number }> }>(
        `/reports/top-products?from=${from}&to=${to}&limit=100`,
      )
      const offerProducts = res.data.data.filter((p) => productIds.includes(p.product_id))
      const totalRevenue = offerProducts.reduce((s, p) => s + p.revenue, 0)
      const totalQty = offerProducts.reduce((s, p) => s + p.quantity, 0)
      const totalTx = offerProducts.reduce((s, p) => s + p.transactions, 0)
      return { offerProducts, totalRevenue, totalQty, totalTx, from, to }
    },
    enabled: !!offer.products.length,
  })

  if (!data) return (
    <p className="py-4 text-center text-table text-ink-muted">
      {!offer.products.length ? 'No hay productos asignados a esta oferta' : 'Cargando rendimiento…'}
    </p>
  )

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-ink-muted">Periodo: {data.from} al {data.to}</p>
      <StatGrid cols={3}>
        <StatCard label="Ingresos generados" value={formatCurrency(data.totalRevenue)} />
        <StatCard label="Unidades vendidas" value={String(Math.round(data.totalQty))} />
        <StatCard label="Transacciones" value={String(data.totalTx)} />
      </StatGrid>
      {data.offerProducts.length > 0 ? (
        <table className={cn(tableCls, 'rounded-ctl bg-surface')}>
          <thead><tr>
            <th className={thCls}>Producto</th>
            <th className={cn(thCls, 'text-right')}>Uds.</th>
            <th className={cn(thCls, 'text-right')}>Ingresos</th>
          </tr></thead>
          <tbody>
            {data.offerProducts.map((p) => (
              <tr key={p.product_id}>
                <td className={cn(tdCls, 'font-medium')}>{p.name}</td>
                <td className={cn(tdCls, 'text-right tabular-nums')}>{Math.round(p.quantity)}</td>
                <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-3 text-center text-table text-ink-muted">Sin ventas registradas de los productos de esta oferta en el periodo</p>
      )}
    </div>
  )
}
