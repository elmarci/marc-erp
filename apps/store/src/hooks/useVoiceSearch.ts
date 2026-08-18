import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos de la Web Speech API — no vienen en lib.dom.d.ts de TS.
// (mismo patrón que apps/frontend/src/hooks/useVoiceRecognition.ts, pero en
// modo "una sola frase" en vez de continuo: para buscar un producto basta con
// decirlo una vez, no hace falta seguir escuchando después.)
interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlternativeLike }
interface SpeechRecognitionEventLike { results: SpeechRecognitionResultLike[] }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

interface UseVoiceSearchOptions {
  onResult: (transcript: string) => void
  lang?: string
}

// Solo Chrome/Edge implementan la Web Speech API — en el resto isSupported
// queda en false y el botón de micrófono no debe mostrarse.
export function useVoiceSearch({ onResult, lang = 'es-PE' }: UseVoiceSearchOptions) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const SpeechRecognitionCtor = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)
    : undefined
  const isSupported = !!SpeechRecognitionCtor

  useEffect(() => {
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) onResultRef.current(transcript)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    return () => recognition.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, !!SpeechRecognitionCtor])

  const start = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stop(); else start()
  }, [isListening, start, stop])

  return { isListening, start, stop, toggle, isSupported }
}
