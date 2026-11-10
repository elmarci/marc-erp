import { Mic } from 'lucide-react'
import { useVoiceSearch } from '../hooks/useVoiceSearch'

interface Props {
  onResult: (transcript: string) => void
  className?: string
}

// Botón de micrófono para buscar productos hablando — se ubica dentro de los
// buscadores (Header y CatalogPage). Se oculta solo si el navegador no
// soporta la Web Speech API (ej. Firefox), sin romper el resto del buscador.
export function VoiceSearchButton({ onResult, className = '' }: Props) {
  const { isListening, toggle, isSupported } = useVoiceSearch({ onResult })

  if (!isSupported) return null

  return (
    <button type="button" onClick={toggle}
      title={isListening ? 'Escuchando… toca para cancelar' : 'Buscar por voz'}
      aria-label="Buscar por voz"
      className={`flex items-center justify-center h-11 w-11 rounded-full transition-colors ${
        isListening
          ? 'bg-brand-magenta-500 text-white animate-pulse'
          : 'text-paper-ink-soft hover:text-brand-blue-600 hover:bg-brand-blue-50'
      } ${className}`}>
      <Mic className="h-5 w-5" />
    </button>
  )
}
