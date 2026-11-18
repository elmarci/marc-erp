import { BottomSheet } from './BottomSheet'
import { PrimaryButton } from './PrimaryButton'

interface ConfirmSheetProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// Se interpone antes de cada cambio de estado del pedido: en moto un toque
// accidental es muy probable. Después del cambio queda "Deshacer" 5 s.
export function ConfirmSheet({ title, description, confirmLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <BottomSheet onClose={onCancel}>
      <h2 className="num text-xl font-semibold">{title}</h2>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{description}</p>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton onClick={onConfirm}>{confirmLabel}</PrimaryButton>
        <button onClick={onCancel} className="h-12 text-[15px] font-medium text-ink-soft">Cancelar</button>
      </div>
    </BottomSheet>
  )
}
