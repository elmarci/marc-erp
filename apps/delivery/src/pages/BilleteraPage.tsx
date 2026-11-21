import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, ChevronRight, Smartphone } from 'lucide-react'
import { fetchWalletResumen, fetchLiquidaciones, solicitarLiquidacion, fetchHistory } from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { PrimaryButton } from '../components/PrimaryButton'
import { AppHeader } from '../components/AppHeader'
import type { Liquidacion, MetodoLiquidacion } from '../types'
import { cn } from '../lib/cn'

function SolicitarPagoSheet({
  pendiente,
  onClose,
  onDone,
}: {
  pendiente: number
  onClose: () => void
  onDone: (l: Liquidacion) => void
}) {
  const [metodo, setMetodo] = useState<MetodoLiquidacion>('Efectivo')
  const [enviando, setEnviando] = useState(false)

  const confirmar = async () => {
    setEnviando(true)
    try {
      const liq = await solicitarLiquidacion(metodo)
      onDone(liq)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      <h2 className="num text-xl font-semibold">Pedir mi pago de S/ {pendiente.toFixed(2)}</h2>
      <p className="mt-1 text-[15px] text-ink-soft">¿Cómo quieres recibirlo?</p>
      <div className="mt-4 flex flex-col overflow-hidden rounded-2xl border border-line">
        {(['Efectivo', 'Yape'] as const).map((m) => (
          <button key={m} onClick={() => setMetodo(m)}
            className="flex items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0">
            {m === 'Efectivo' ? <Banknote size={20} className="text-ink-soft" /> : <Smartphone size={20} className="text-ink-soft" />}
            <span className="text-[15px]">{m === 'Efectivo' ? 'Efectivo en la tienda' : 'Yape'}</span>
            <span className={cn('ml-auto h-5 w-5 rounded-full border-2', metodo === m ? 'border-[6px] border-blue' : 'border-line')} />
          </button>
        ))}
      </div>
      <PrimaryButton className="mt-5 w-full" disabled={enviando} onClick={confirmar}>
        {enviando ? 'Enviando…' : 'Pedir mi pago'}
      </PrimaryButton>
    </BottomSheet>
  )
}

function ReciboSheet({ liquidacion, numeroDe, onClose }: { liquidacion: Liquidacion; numeroDe: (id: string) => string; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Pago</div>
      <div className="num mt-1 text-[40px] font-semibold leading-none">S/ {liquidacion.monto.toFixed(2)}</div>
      <p className="mt-1.5 text-sm text-ink-soft">
        {liquidacion.metodo} · {new Date(liquidacion.fecha).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      <div className="mt-4 rounded-2xl bg-bg p-4">
        <div className="text-sm text-ink-soft">Cubre {liquidacion.pedidoIds.length} entrega{liquidacion.pedidoIds.length === 1 ? '' : 's'}</div>
        <div className="mt-1.5 text-sm">{liquidacion.pedidoIds.map(numeroDe).join(', ')}</div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-faint">Recibo N.° {liquidacion.id.slice(0, 8).toUpperCase()}</p>
    </BottomSheet>
  )
}

export function BilleteraPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pagando, setPagando] = useState(false)
  const [reciboActivo, setReciboActivo] = useState<Liquidacion | null>(null)

  const { data: resumen, isLoading } = useQuery({ queryKey: ['wallet-resumen'], queryFn: fetchWalletResumen })
  const { data: liquidaciones } = useQuery({ queryKey: ['liquidaciones'], queryFn: fetchLiquidaciones })
  const { data: historyAll } = useQuery({ queryKey: ['history'], queryFn: fetchHistory })

  const numeroDe = (id: string) => historyAll?.find((h) => h.id === id)?.numero ?? `#${id.slice(0, 6)}`

  const totales = useMemo(() => {
    const now = Date.now()
    const hoy = new Date().toDateString()
    let dia = 0, semana = 0, entregas = 0
    for (const o of historyAll ?? []) {
      if (!o.entregadoAt) continue
      const t = Date.parse(o.entregadoAt)
      if (new Date(t).toDateString() === hoy) dia += o.tarifaReparto
      if (now - t <= 7 * 86400000) { semana += o.tarifaReparto; entregas++ }
    }
    return { dia, semana, entregas }
  }, [historyAll])

  const pendientes = resumen?.pedidosPendientes ?? []

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <div className="mt-4 text-xs font-medium uppercase tracking-[0.06em] text-white/60">Por cobrar</div>
        <div className="num text-[44px] font-semibold leading-tight">S/ {(resumen?.pendiente ?? 0).toFixed(2)}</div>
        <p className="text-sm text-white/70">
          {isLoading ? 'Calculando…' : pendientes.length === 0 ? 'La tienda no te debe nada' : `De ${pendientes.length} entrega${pendientes.length === 1 ? '' : 's'} que la tienda aún no te paga`}
        </p>
      </AppHeader>

      <div className="no-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-5 pt-4">
        <PrimaryButton className="w-full" disabled={!resumen || resumen.pendiente <= 0} onClick={() => setPagando(true)}>
          Pedir mi pago
        </PrimaryButton>

        <div className="grid grid-cols-3 rounded-[20px] bg-card py-3.5 text-center shadow-card">
          <div><div className="num text-[20px] font-semibold">{totales.dia.toFixed(2)}</div><div className="text-[13px] text-ink-soft">hoy</div></div>
          <div className="border-x border-line"><div className="num text-[20px] font-semibold">{totales.semana.toFixed(2)}</div><div className="text-[13px] text-ink-soft">7 días</div></div>
          <div><div className="num text-[20px] font-semibold">{totales.entregas}</div><div className="text-[13px] text-ink-soft">entregas</div></div>
        </div>

        {pendientes.length > 0 && (
          <section>
            <h2 className="px-1 pb-2 pt-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Sin cobrar</h2>
            <div className="rounded-[20px] bg-card px-4 shadow-card">
              {pendientes.map((o) => (
                <div key={o.id} className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="min-w-0 truncate text-[15px]">{o.numero} <span className="text-ink-soft">· {o.direccion}</span></span>
                  <span className="flex-none tabular-nums">{o.tarifaReparto.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="px-1 pb-2 pt-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Pagos recibidos</h2>
          {!liquidaciones || liquidaciones.length === 0 ? (
            <p className="rounded-[20px] bg-card p-4 text-center text-sm text-ink-soft shadow-card">Aún no tienes pagos.</p>
          ) : (
            <div className="rounded-[20px] bg-card px-4 shadow-card">
              {liquidaciones.map((l) => (
                <button key={l.id} onClick={() => setReciboActivo(l)} className="flex w-full items-baseline justify-between gap-3 border-b border-line py-3 text-left last:border-b-0">
                  <span className="text-[15px]">
                    {new Date(l.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                    <span className="text-ink-soft"> · {l.metodo} · {l.pedidoIds.length} entrega{l.pedidoIds.length === 1 ? '' : 's'}</span>
                  </span>
                  <span className="flex-none tabular-nums">{l.monto.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <button onClick={() => navigate('/historial')} className="flex items-center justify-between rounded-[20px] bg-card px-4 py-3.5 text-left shadow-card">
          <span className="font-medium">Historial de entregas</span>
          <ChevronRight size={18} className="text-blue" />
        </button>
      </div>

      {pagando && resumen && (
        <SolicitarPagoSheet
          pendiente={resumen.pendiente}
          onClose={() => setPagando(false)}
          onDone={(liq) => {
            setPagando(false)
            queryClient.invalidateQueries({ queryKey: ['wallet-resumen'] })
            queryClient.invalidateQueries({ queryKey: ['liquidaciones'] })
            setReciboActivo(liq)
          }}
        />
      )}

      {reciboActivo && <ReciboSheet liquidacion={reciboActivo} numeroDe={numeroDe} onClose={() => setReciboActivo(null)} />}
    </div>
  )
}
