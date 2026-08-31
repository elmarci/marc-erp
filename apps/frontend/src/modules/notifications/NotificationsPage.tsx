import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Send, Clock, X, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'
import { formatDateTime, cn } from '@/lib/utils'

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
]

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/ofertas')
  const [scheduledAt, setScheduledAt] = useState(nowForInput())

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
    if (mode === 'later' && new Date(scheduledAt) <= new Date()) {
      toast.error('Elige una fecha/hora futura para programar el envío.')
      return
    }
    const when = mode === 'now' ? new Date().toISOString() : new Date(scheduledAt).toISOString()
    sendMutation.mutate({ title: title.trim(), body: body.trim(), url, scheduledAt: when })
  }

  const pending = (notifications ?? []).filter(n => !n.sentAt)
  const sent = (notifications ?? []).filter(n => n.sentAt)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">Avisa a tus clientes lo que quieras, cuando quieras — no sólo ofertas automáticas</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {subscriberCount ?? '—'} suscritos a avisos
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Título <span className="text-muted-foreground font-normal">({title.length}/65)</span></label>
              <Input value={title} onChange={e => setTitle(e.target.value.slice(0, 65))}
                placeholder="Ej: Bajó el pollo 🐔" maxLength={65} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Mensaje <span className="text-muted-foreground font-normal">({body.length}/180)</span></label>
              <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 180))} rows={3} maxLength={180}
                placeholder="Ej: S/ 6.50 el kg, pídelo ahora por la app y recibe en 20min contra entrega."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            </div>

            <div className="flex flex-wrap gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Al tocarla, abre</label>
                <select value={url} onChange={e => setUrl(e.target.value)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {URL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">¿Cuándo?</label>
                <div className="flex rounded-lg bg-muted p-1 text-sm font-medium">
                  <button type="button" onClick={() => setMode('now')}
                    className={cn('flex-1 rounded-md px-4 py-1.5 transition-colors', mode === 'now' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    Ahora
                  </button>
                  <button type="button" onClick={() => setMode('later')}
                    className={cn('flex-1 rounded-md px-4 py-1.5 transition-colors', mode === 'later' ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    Programar
                  </button>
                </div>
              </div>

              {mode === 'later' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Fecha y hora</label>
                  <Input type="datetime-local" value={scheduledAt} min={nowForInput()} onChange={e => setScheduledAt(e.target.value)} />
                </div>
              )}
            </div>

            <Button type="submit" disabled={sendMutation.isPending}>
              {mode === 'now' ? <Send className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
              {sendMutation.isPending ? 'Enviando...' : mode === 'now' ? 'Enviar ahora' : 'Programar envío'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Programadas</h2>
            <div className="space-y-2">
              {pending.map(n => (
                <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />{formatDateTime(n.scheduledAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => cancelMutation.mutate(n.id)} aria-label="Cancelar">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Historial</h2>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando...</div>
          ) : sent.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/50" />
              Todavía no se envió ninguna notificación manual.
            </div>
          ) : (
            <div className="space-y-2">
              {sent.map(n => (
                <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{n.body}</p>
                  </div>
                  <Badge variant="success" className="shrink-0">Enviada {formatDateTime(n.sentAt)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
