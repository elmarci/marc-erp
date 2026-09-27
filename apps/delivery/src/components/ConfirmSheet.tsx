import { AlertTriangle } from 'lucide-react'

interface ConfirmSheetProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// Fix P1 (crítica de diseño): antes, el CTA principal avanzaba el estado del
// pedido con un solo tap y sin vuelta atrás — en moto, con el celular en el
// bolsillo o guantes puestos, un toque accidental es muy probable. Esta hoja
// de confirmación se interpone antes de cualquier transición irreversible;
// el llamador además ofrece "Deshacer" por 5s tras confirmar (ver
// PedidoDetallePage).
export function ConfirmSheet({ title, description, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-[390px] animate-enter-up rounded-t-3xl bg-paper-bg p-6 pb-8"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-paper-line" />
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-achiote-50">
            <AlertTriangle size={22} className="text-brand-achiote-500" />
          </div>
          <div className="font-display text-lg font-bold">{title}</div>
          <div className="text-sm leading-snug text-paper-ink-soft">{description}</div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            className="h-14 rounded-2xl bg-brand-green-700 text-lg font-extrabold text-white transition-transform active:scale-[0.97]"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="h-12 rounded-2xl text-base font-bold text-paper-ink-soft transition-transform active:scale-[0.97]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
