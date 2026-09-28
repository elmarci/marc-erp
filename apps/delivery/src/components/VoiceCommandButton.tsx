import { Mic } from 'lucide-react'
import { useVoiceCommand, type VoiceCommand } from '../hooks/useVoiceCommand'
import { cn } from '../lib/cn'

interface VoiceCommandButtonProps {
  comandos: VoiceCommand[]
}

// Fix pedido del dueño: los comandos de voz eran solo un switch decorativo.
// Esto reconoce frases reales (Web Speech API) y ejecuta la acción sin
// pedir otro toque de confirmación — decir la frase completa ya es un acto
// deliberado, a diferencia de un tap accidental en el bolsillo, así que no
// necesita el mismo freno que ConfirmSheet. El toast de "Deshacer" que ya
// existe en cada transición sigue siendo la red de seguridad.
export function VoiceCommandButton({ comandos }: VoiceCommandButtonProps) {
  const { supported, listening, status, start } = useVoiceCommand(comandos)

  if (!supported) return null

  const handleClick = () => {
    start()
  }

  return (
    <div className="fixed bottom-28 right-5 z-40 flex flex-col items-end gap-2">
      {status === 'no-entendi' && !listening && (
        <div className="animate-enter-up rounded-2xl bg-paper-raised px-3.5 py-2 text-xs font-bold text-paper-ink shadow-lg">
          No te entendí, intenta de nuevo
        </div>
      )}
      <button
        onClick={handleClick}
        aria-label="Activar comando de voz"
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95',
          listening ? 'animate-ring-pulse bg-brand-magenta-500' : 'bg-brand-blue-500',
        )}
      >
        <Mic size={24} className="text-white" />
      </button>
    </div>
  )
}
