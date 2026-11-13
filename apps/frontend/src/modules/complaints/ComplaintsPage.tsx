import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Mail, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">N.º {c.code}</span>
        <Badge variant={c.kind === 'RECLAMO' ? 'default' : 'secondary'}>{c.kind === 'RECLAMO' ? 'Reclamo' : 'Queja'}</Badge>
        {c.status === 'RESPONDIDO'
          ? <Badge variant="outline" className="border-green-600 text-green-700">Respondido</Badge>
          : <Badge variant="outline" className={cn(left <= 3 ? 'border-red-600 text-red-700' : 'border-amber-500 text-amber-700')}>
              {left >= 0 ? `Responder en ${left} día${left === 1 ? '' : 's'}` : `Vencido hace ${-left} día${left === -1 ? '' : 's'}`}
            </Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
      </div>

      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <p><b>{c.consumerName}</b> · {c.docType} {c.docNumber}</p>
        <p>{c.phone} · {c.email}</p>
        <p className="sm:col-span-2 text-muted-foreground">{c.address}</p>
        {c.isMinor && <p className="sm:col-span-2">Menor de edad · apoderado: {c.guardianName}</p>}
        <p className="sm:col-span-2">
          {c.itemType === 'PRODUCTO' ? 'Producto' : 'Servicio'}: {c.itemDescription}
          {c.amount != null && <> · {formatCurrency(c.amount)}</>}
          {c.orderNumber && <> · pedido {c.orderNumber}</>}
        </p>
      </div>
      <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
        <p><b>Detalle:</b> {c.detail}</p>
        <p><b>Solicita:</b> {c.request}</p>
      </div>

      {c.status === 'RESPONDIDO' ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm space-y-1">
          <p className="text-xs text-green-800">Respondido el {c.respondedAt && formatDateTime(c.respondedAt)}</p>
          <p className="whitespace-pre-wrap">{c.response}</p>
          <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline"
            href={mailto(c, `Estimado(a) ${c.consumerName}:\n\n${c.response}\n\n---\n${sheetText(c)}\n\nAtentamente,\nTiendas Marc`, `Respuesta a su ${c.kind === 'RECLAMO' ? 'reclamo' : 'queja'} N.º ${c.code}`)}>
            <Mail className="h-4 w-4" />Enviar respuesta por correo
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={3000}
            placeholder="Escribe la respuesta: qué se revisó y qué solución se ofrece."
            className="w-full rounded-md border border-input bg-background p-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={response.trim().length < 10 || respond.isPending} onClick={() => respond.mutate()}>
              Guardar respuesta
            </Button>
            <a className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm h-9"
              href={mailto(c, `Estimado(a) ${c.consumerName}:\n\nRecibimos su ${c.kind === 'RECLAMO' ? 'reclamo' : 'queja'}. Le enviamos copia de la hoja registrada. Le responderemos en un plazo máximo de 15 días hábiles.\n\n---\n${sheetText(c)}\n\nAtentamente,\nTiendas Marc`, `Copia de su hoja de reclamación N.º ${c.code}`)}>
              <Mail className="h-4 w-4" />Enviar copia al cliente
            </a>
          </div>
        </div>
      )}
    </Card>
  )
}

export function ComplaintsPage() {
  const [filter, setFilter] = useState<'PENDIENTE' | 'RESPONDIDO' | ''>('PENDIENTE')
  const { data, isLoading } = useQuery({
    queryKey: ['store-complaints', filter],
    queryFn: async () => (await api.get<{ data: Complaint[] }>('/store/admin/complaints', { params: filter ? { status: filter } : {} })).data.data,
    refetchInterval: 60000,
  })
  const rows = data ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Libro de Reclamaciones</h1>
          <p className="text-sm text-muted-foreground">Hojas registradas en la tienda online. Plazo de respuesta: 15 días hábiles.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />Imprimir
        </Button>
      </div>
      <div className="flex gap-2">
        {([['PENDIENTE', 'Por responder'], ['RESPONDIDO', 'Respondidas'], ['', 'Todas']] as const).map(([v, label]) => (
          <Button key={v} size="sm" variant={filter === v ? 'default' : 'outline'} onClick={() => setFilter(v)}>{label}</Button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No hay hojas {filter === 'PENDIENTE' ? 'por responder' : filter === 'RESPONDIDO' ? 'respondidas' : 'registradas'}.</Card>
      )}
      <div className="space-y-3">{rows.map((c) => <ComplaintCard key={c.id} c={c} />)}</div>
    </div>
  )
}
