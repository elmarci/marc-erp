import type { ReactNode } from 'react'

// Shell reutilizable para hojas con contenido libre (formularios, listas) —
// ConfirmSheet cubre solo título+descripción+botón; esto es para todo lo demás.
export function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[390px] animate-enter-up rounded-t-3xl bg-paper-bg p-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-paper-line" />
        {children}
      </div>
    </div>
  )
}
