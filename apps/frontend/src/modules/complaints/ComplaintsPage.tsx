import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Mail, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, EmptyState, PageHeader, Segmented, StatusBadge, fieldCls, surfaceCls } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'

// Libro de Reclamaciones de la tienda online. Las hojas no se editan ni se
// borran: solo se responden (máximo 15 días hábiles). La respuesta se envía
// al cliente por correo desde aquí (abre el correo del encargado con el texto
// listo) y queda guardada con fecha y usuario.

interface Complaint {
  id: string; number: number; code: string; kind: 'RECLAMO' | 'QUEJA'
  consumerName: string; docType: string; docNumber: string; address: string; phone: string; email: string
  isMinor: boolean; guardianName: string | null
  itemType: 'PRODUCTO' | 'SERVICIO'; amount: number | null; itemDescription: string; orderNumber: string | null
  detail: string; request: string
  status: 'PENDIENTE' | 'RESPONDIDO'; response: string | null; respondedAt: string | null
  createdAt: string; dueAt: string
}

const PROVIDER = 'María del Rosario Ruiz Chávez · RUC 10771669471 · Minimarket Marc (Tienda Marc)'

function daysLeft(dueAt: string) {
  return Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000)
}

function mailto(c: Complaint, body: string, subject: string) {
  return `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function sheetText(c: Complaint) {
  return [
    `Hoja de reclamación virtual N.º ${c.code}`,
    `Fecha: ${formatDateTime(c.createdAt)}`,
    `Proveedor: ${PROVIDER}`,
    `Consumidor: ${c.consumerName} · ${c.docType} ${c.docNumber}`,
    `Domicilio: ${c.address} · Cel. ${c.phone} · ${c.email}`,
    c.isMinor ? `Apoderado: ${c.guardianName}` : '',
    `Bien: ${c.itemType === 'PRODUCTO' ? 'Producto' : 'Servicio'} — ${c.itemDescription}${c.amount != null ? ` · ${formatCurrency(c.amount)}` : ''}${c.orderNumber ? ` · Pedido ${c.orderNumber}` : ''}`,
    `Tipo: ${c.kind === 'RECLAMO' ? 'Reclamo' : 'Queja'}`,
    `Detalle: ${c.detail}`,
    `Pedido del consumidor: ${c.request}`,
  ].filter(Boolean).join('\n')
}

const openMail = (href: string) => { window.location.href = href }

function ComplaintCard({ c }: { c: Complaint }) {
  const queryClient = useQueryClient()
  const [response, setResponse] = useState('')
  const respond = useMutation({
    mutationFn: () => api.post(`/store/admin/complaints/${c.id}/respond`, { response }),
    onSuccess: () => {
      toast.success('Respuesta guardada. Envíala por correo al cliente.')
      queryClient.invalidateQueries({ queryKey: ['store-complaints'] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
  const left = daysLeft(c.dueAt)
  const kindLabel = c.kind === 'RECLAMO' ? 'reclamo' : 'queja'

  return (
    <article className={cn('flex flex-col gap-3 p-4', surfaceCls)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-table font-semibold text-ink">N.º {c.code}</span>
        <StatusBadge tone="neutral">{c.kind === 'RECLAMO' ? 'Reclamo' : 'Queja'}</StatusBadge>
        {c.status === 'RESPONDIDO'
          ? <StatusBadge tone="ok">Respondido</StatusBadge>
          : <StatusBadge tone={left <= 3 ? 'bad' : 'warn'}>
              {left >= 0 ? `Responder en ${left} día${left === 1 ? '' : 's'}` : `Vencido hace ${-left} día${left === -1 ? '' : 's'}`}
            </StatusBadge>}
        <span className="ml-auto text-meta tabular-nums text-ink-muted">{formatDateTime(c.createdAt)}</span>
      </div>

      <div className="grid gap-1 text-table text-ink sm:grid-cols-2">
        <p><span className="font-medium">{c.consumerName}</span> · {c.docType} {c.docNumber}</p>
        <p className="tabular-nums">{c.phone} · {c.email}</p>
        <p className="text-ink-muted sm:col-span-2">{c.address}</p>
        {c.isMinor && <p className="sm:col-span-2">Menor de edad · apoderado: {c.guardianName}</p>}
        <p className="sm:col-span-2">
          {c.itemType === 'PRODUCTO' ? 'Producto' : 'Servicio'}: {c.itemDescription}
          {c.amount != null && <> · {formatCurrency(c.amount)}</>}
          {c.orderNumber && <> · pedido {c.orderNumber}</>}
        </p>
      </div>
      <div className="flex flex-col gap-1 rounded-ctl bg-surface-2 p-3 text-table text-ink">
        <p><span className="font-medium">Detalle:</span> {c.detail}</p>
        <p><span className="font-medium">Solicita:</span> {c.request}</p>
      </div>

      {c.status === 'RESPONDIDO' ? (
        <div className="flex flex-col gap-2 rounded-ctl border border-line p-3 text-table text-ink">
          <p className="text-meta text-ok-ink">Respondido el {c.respondedAt && formatDateTime(c.respondedAt)}</p>
          <p className="whitespace-pre-wrap">{c.response}</p>
          <div>
            <Btn size="sm" onClick={() => openMail(mailto(c, `Estimado(a) ${c.consumerName}:\n\n${c.response}\n\n---\n${sheetText(c)}\n\nAtentamente,\nTiendas Marc`, `Respuesta a su ${kindLabel} N.º ${c.code}`))}>
              <Mail />Enviar respuesta por correo
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={3000}
            aria-label={`Respuesta a la hoja ${c.code}`}
            placeholder="Escribe la respuesta: qué se revisó y qué solución se ofrece."
            className={cn(fieldCls, 'h-auto py-2')} />
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="primary" disabled={response.trim().length < 10} loading={respond.isPending} onClick={() => respond.mutate()}>
              Guardar respuesta
            </Btn>
            <Btn size="sm" onClick={() => openMail(mailto(c, `Estimado(a) ${c.consumerName}:\n\nRecibimos su ${kindLabel}. Le enviamos copia de la hoja registrada. Le responderemos en un plazo máximo de 15 días hábiles.\n\n---\n${sheetText(c)}\n\nAtentamente,\nTiendas Marc`, `Copia de su hoja de reclamación N.º ${c.code}`))}>
              <Mail />Enviar copia al cliente
            </Btn>
          </div>
        </div>
      )}
    </article>
  )
}

type Filter = 'PENDIENTE' | 'RESPONDIDO' | 'ALL'

export function ComplaintsPage() {
  const [filter, setFilter] = useState<Filter>('PENDIENTE')
  const { data, isLoading } = useQuery({
    queryKey: ['store-complaints', filter],
    queryFn: async () => (await api.get<{ data: Complaint[] }>('/store/admin/complaints', { params: filter !== 'ALL' ? { status: filter } : {} })).data.data,
    refetchInterval: 60000,
  })
  const rows = data ?? []

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Libro de Reclamaciones" actions={<Btn onClick={() => window.print()}><Printer />Imprimir</Btn>}>
        <p className="text-table text-ink-muted">Hojas registradas en la tienda online. Plazo de respuesta: 15 días hábiles.</p>
      </PageHeader>
      <div>
        <Segmented ariaLabel="Filtrar hojas" className="inline-flex" value={filter} onChange={(v) => setFilter(v as Filter)}
          options={[['PENDIENTE', 'Por responder'], ['RESPONDIDO', 'Respondidas'], ['ALL', 'Todas']]} />
      </div>
      {isLoading && <p className="text-table text-ink-muted">Cargando…</p>}
      {!isLoading && rows.length === 0 && (
        <div className={surfaceCls}>
          <EmptyState icon={BookOpen} title={`No hay hojas ${filter === 'PENDIENTE' ? 'por responder' : filter === 'RESPONDIDO' ? 'respondidas' : 'registradas'}.`} />
        </div>
      )}
      <div className="flex flex-col gap-3">{rows.map((c) => <ComplaintCard key={c.id} c={c} />)}</div>
    </div>
  )
}
