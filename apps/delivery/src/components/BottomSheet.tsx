import type { ReactNode } from 'react'

// Hoja inferior para formularios y listas cortas.
export function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center bg-night/40" onClick={onClose}>
      <div
        className="w-full max-w-[480px] animate-enter-up rounded-t-[24px] bg-card p-5 shadow-sheet"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>
  )
}
