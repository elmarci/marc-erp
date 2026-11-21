import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { fetchOrder } from '../api'
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

  if (!order) return <div className="flex h-full items-center justify-center text-ink-soft">Cargando…</div>

  const safeBottom = { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }

  if (showNota) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>
          <button onClick={() => setShowNota(false)} aria-label="Volver" className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-card">
            <ArrowLeft size={20} />
          </button>
          <h1 className="num text-xl font-semibold">Agregar nota</h1>
        </div>
        <p className="px-4 pt-3 text-sm text-ink-soft">{order.numero} · {order.direccion}</p>
        <div className="flex flex-1 flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <button key={m} onClick={() => setMotivo(m)}
                className={cn('h-9 rounded-full border px-3.5 text-sm', motivo === m ? 'border-ink bg-ink font-semibold text-white' : 'border-line bg-card text-ink-soft')}>
                {m}
              </button>
            ))}
          </div>
          <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Detalle (opcional)" rows={4}
            className="resize-none rounded-2xl border border-line bg-card p-4 text-base outline-none focus:border-blue" />
        </div>
        <div className="flex flex-col gap-2 px-4" style={safeBottom}>
          <PrimaryButton className="w-full" onClick={() => { toast.success('Nota guardada.'); navigate('/pedidos') }}>Guardar y volver a pedidos</PrimaryButton>
          <button onClick={() => setShowNota(false)} className="h-11 text-sm font-medium text-ink-soft">Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col overflow-y-auto px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}>
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink">
          <Check size={28} strokeWidth={2.4} />
        </div>
        <h1 className="num mt-5 text-[28px] font-semibold leading-tight">Entregado</h1>
        <p className="text-sm text-ink-soft">{order.numero} · {order.direccion.split(',')[0]}{order.duracionMin ? ` · ${order.duracionMin} min` : ''}</p>

        <div className="mt-8 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Ganaste</div>
        <div className="num text-[52px] font-semibold leading-none">S/ {order.tarifaReparto.toFixed(2)}</div>
        <p className="mt-1 text-sm text-ink-soft">Se suma a lo que la tienda te debe.</p>

        <div className="mt-6 rounded-[20px] bg-card px-4 shadow-card">
          <div className="flex justify-between gap-4 border-b border-line py-3 text-[15px]"><span className="text-ink-soft">Cliente</span><span>{order.clienteNombre}</span></div>
          {order.contraEntrega ? (
            <>
              <div className="flex justify-between gap-4 border-b border-line py-3 text-[15px]"><span className="text-ink-soft">Cobraste · {order.metodoPago}</span><span className="tabular-nums">S/ {order.monto.toFixed(2)}</span></div>
              <div className="flex justify-between gap-4 py-3 text-[15px]"><span className="text-ink-soft">Entrégalo en</span><span>Caja de la tienda</span></div>
            </>
          ) : (
            <div className="flex justify-between gap-4 py-3 text-[15px]"><span className="text-ink-soft">Pago</span><span>Ya pagado · {order.metodoPago}</span></div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-5 pt-3" style={safeBottom}>
        <PrimaryButton className="w-full" onClick={() => navigate('/pedidos')}>Volver a pedidos</PrimaryButton>
        <button onClick={() => setShowNota(true)} className="flex h-11 items-center justify-center gap-2 text-sm font-medium text-blue">
          <Pencil size={15} /> ¿Algo salió diferente? Agregar nota
        </button>
      </div>
    </div>
  )
}
