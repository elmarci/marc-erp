import { useCallback, useRef, useState } from 'react'

// Web Speech API — solo Android/Chrome la soporta de verdad (Safari/iOS no
// tiene SpeechRecognition, o es muy limitado). La tienda ya trata Android
// como plataforma principal para instalar el PWA, así que no bloquea a la
// mayoría de repartidores, pero el botón se auto-oculta donde no funciona
// en vez de fallar en silencio.
type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface VoiceCommand {
  frases: string[]
  accion: () => void
}

export function useVoiceCommand(comandos: VoiceCommand[]) {
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<'idle' | 'escuchando' | 'no-entendi' | 'ok'>('idle')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const Ctor = getSpeechRecognition()

  const start = useCallback(() => {
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = 'es-PE'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => {
      setListening(true)
      setStatus('escuchando')
    }
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const texto = e.results[0]?.[0]?.transcript?.toLowerCase() ?? ''
      const match = comandos.find((c) => c.frases.some((f) => texto.includes(f)))
      if (match) {
        setStatus('ok')
        match.accion()
      } else {
        setStatus('no-entendi')
      }
    }
    recognition.onerror = () => setStatus('no-entendi')
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }, [Ctor, comandos])

  return { supported: !!Ctor, listening, status, start }
}
