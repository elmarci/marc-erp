import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { fetchOrder } from '../mockApi'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

const MOTIVOS = ['No abrió, dejé con vecino', 'Dirección incorrecta', 'Producto dañado', 'Cobré menos']

export function ConfirmacionEntregaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showNota, setShowNota] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalle, setDetalle] = useState('')

  const { data: order } = useQuery({ queryKey: ['order', id], queryFn: () => fetchOrder(id!), enabled: !!id })

  if (!order) return <div className="flex h-full items-center justify-center text-paper-ink-soft">Cargando…</div>

  if (showNota) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pt-5">
          <button onClick={() => setShowNota(false)} aria-label="Volver" className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-surface">
            <ArrowLeft size={20} strokeWidth={2.3} />
          </button>
        </div>
        <div className="mx-5 mt-3 flex items-center gap-2.5 rounded-2xl bg-brand-green-50 px-3.5 py-3">
          <CheckCircle2 size={18} className="text-brand-green-600" />
          <span className="text-[13px] font-bold">Entregado a {order.clienteNombre} · {order.direccion}</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                className={cn(
                  'rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-colors',
                  motivo === m ? 'border-brand-green-500 bg-brand-green-500 text-white' : 'border-paper-line text-paper-ink-soft',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Detalle (opcional)"
            rows={4}
            className="resize-none rounded-2xl border-[1.5px] border-paper-line bg-paper-surface p-4 text-sm outline-none"
          />
        </div>
        <div className="flex flex-col gap-3 px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}>
          <PrimaryButton
            className="w-full"
            onClick={() => {
              toast.success('Nota guardada.')
              navigate('/pedidos')
            }}
          >
            Guardar y volver a pedidos
          </PrimaryButton>
          <button onClick={() => setShowNota(false)} className="h-12 text-sm font-bold text-paper-ink-soft">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <div className="flex h-44 w-44 -rotate-[7deg] animate-stamp-in flex-col items-center justify-center gap-1.5 rounded-full border-[5px] border-brand-green-500">
          <CheckCircle2 size={52} strokeWidth={2.6} className="text-brand-green-500" />
          <div className="font-display text-xl font-extrabold tracking-wide text-brand-green-500">ENTREGADO</div>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="font-display text-xl font-extrabold">¡Buen trabajo!</div>
          <div className="text-sm text-paper-ink-soft">Confirmado hace unos segundos</div>
        </div>

        <div className="flex w-full flex-col gap-2.5 rounded-[20px] bg-paper-surface p-[18px]">
          <div className="flex justify-between text-[13px]">
            <span className="font-semibold text-paper-ink-soft">Cliente</span>
            <span className="font-extrabold">{order.clienteNombre}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="font-semibold text-paper-ink-soft">Dirección</span>
            <span className="max-w-[220px] text-right font-extrabold">{order.direccion.split(',')[0]}</span>
          </div>
          <div className="h-px bg-paper-line" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-paper-ink-soft">Cobrado</span>
            <span className="font-display text-xl font-extrabold">S/ {order.monto.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 30px)' }}>
        <PrimaryButton className="w-full" onClick={() => navigate('/pedidos')}>Volver a pedidos</PrimaryButton>
        <button onClick={() => setShowNota(true)} className="flex items-center justify-center gap-2 text-sm font-bold text-paper-ink-soft">
          <Pencil size={16} />
          ¿Algo salió diferente? Agregar nota
        </button>
      </div>
    </div>
  )
}
