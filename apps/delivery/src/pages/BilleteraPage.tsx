import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CheckCircle2, Receipt, Smartphone, Wallet } from 'lucide-react'
import { fetchWalletResumen, fetchLiquidaciones, solicitarLiquidacion, fetchHistory } from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { PrimaryButton } from '../components/PrimaryButton'
import { TopBar } from '../components/TopBar'
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
      <div className="mb-5 flex flex-col items-center gap-1 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-900/40">
          <Wallet size={22} className="text-accent-green" />
        </div>
        <div className="font-display text-lg font-bold">Cobrar S/ {pendiente.toFixed(2)}</div>
        <div className="text-sm text-paper-ink-soft">Elige cómo quieres que te paguemos.</div>
      </div>
      <div className="mb-5 flex flex-col gap-2.5">
        {(['Efectivo', 'Yape'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetodo(m)}
            className={cn(
              'flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-colors',
              metodo === m ? 'border-accent-green bg-brand-green-900/30' : 'border-paper-line',
            )}
          >
            {m === 'Efectivo' ? (
              <Banknote size={20} className="text-paper-ink-soft" />
            ) : (
              <Smartphone size={20} className="text-paper-ink-soft" />
            )}
            <span className="text-[15px] font-bold">{m}</span>
            {metodo === m && <CheckCircle2 size={18} className="ml-auto text-accent-green" />}
          </button>
        ))}
      </div>
      <PrimaryButton className="w-full" disabled={enviando} onClick={confirmar}>
        {enviando ? 'Procesando…' : 'Confirmar cobro'}
      </PrimaryButton>
    </BottomSheet>
  )
}

function ReciboSheet({ liquidacion, numeroDe, onClose }: { liquidacion: Liquidacion; numeroDe: (id: string) => string; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-900/40">
          <Receipt size={26} className="text-accent-green" />
        </div>
        <div className="font-display text-3xl font-extrabold">S/ {liquidacion.monto.toFixed(2)}</div>
        <div className="text-sm text-paper-ink-soft">
          Pagado por {liquidacion.metodo} · {new Date(liquidacion.fecha).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </div>
      <div className="mb-5 rounded-2xl border-[1.5px] border-dashed border-paper-line p-4">
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-paper-ink-soft">
          Cubre {liquidacion.pedidoIds.length} entrega{liquidacion.pedidoIds.length === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {liquidacion.pedidoIds.map((id) => (
            <span key={id} className="rounded-full bg-paper-surface px-2.5 py-1 text-xs font-bold">
              {numeroDe(id)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-center text-xs font-semibold text-paper-ink-soft">Recibo N.° {liquidacion.id.toUpperCase()}</div>
    </BottomSheet>
  )
}

export function BilleteraPage() {
  const queryClient = useQueryClient()
  const [pagando, setPagando] = useState(false)
  const [reciboActivo, setReciboActivo] = useState<Liquidacion | null>(null)

  const { data: resumen, isLoading } = useQuery({ queryKey: ['wallet-resumen'], queryFn: fetchWalletResumen })
  const { data: liquidaciones } = useQuery({ queryKey: ['liquidaciones'], queryFn: fetchLiquidaciones })
  const { data: historyAll } = useQuery({ queryKey: ['history'], queryFn: fetchHistory })

  const numeroDe = (id: string) => historyAll?.find((h) => h.id === id)?.numero ?? `#${id}`

  return (
    <div className="flex h-full flex-col">
      <TopBar title="BILLETERA" />

      <div className="no-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-2">
        <div className="rounded-[24px] border-[1.5px] border-brand-green-700/50 bg-brand-green-900/25 p-6">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-accent-green">Por cobrar</div>
          <div className="font-display mt-1 text-5xl font-extrabold text-accent-green">
            S/ {(resumen?.pendiente ?? 0).toFixed(2)}
          </div>
          <div className="mt-1 text-sm font-semibold text-accent-green">
            {isLoading
              ? 'Calculando…'
              : `${resumen?.pedidosPendientes.length ?? 0} entrega${resumen?.pedidosPendientes.length === 1 ? '' : 's'} por pagar`}
          </div>
          <PrimaryButton
            className="mt-4 w-full"
            disabled={!resumen || resumen.pendiente <= 0}
            onClick={() => setPagando(true)}
          >
            Cobrar ahora
          </PrimaryButton>
        </div>

        {resumen && resumen.pedidosPendientes.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Entregas sin cobrar</div>
            <div className="flex flex-col overflow-hidden rounded-[20px] border-[1.5px] border-paper-line">
              {resumen.pedidosPendientes.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-paper-line px-4 py-3.5 last:border-b-0">
                  <div>
                    <div className="text-sm font-extrabold">{o.numero}</div>
                    <div className="text-xs font-semibold text-paper-ink-soft">{o.direccion}</div>
                  </div>
                  <div className="font-display text-sm font-extrabold text-accent-green">S/ {o.tarifaReparto.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="text-[13px] font-extrabold uppercase tracking-wide text-paper-ink-soft">Historial de pagos</div>
          {!liquidaciones || liquidaciones.length === 0 ? (
            <div className="rounded-[20px] border-[1.5px] border-dashed border-paper-line p-5 text-center text-sm text-paper-ink-soft">
              Todavía no te hemos pagado ninguna liquidación.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {liquidaciones.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setReciboActivo(l)}
                  className="flex items-center gap-3 rounded-[20px] bg-paper-surface p-4 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-green-900/40">
                    <Receipt size={18} className="text-accent-green" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold">S/ {l.monto.toFixed(2)} · {l.metodo}</div>
                    <div className="text-xs font-semibold text-paper-ink-soft">
                      {new Date(l.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} · {l.pedidoIds.length} entrega
                      {l.pedidoIds.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
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
