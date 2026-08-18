import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos de la Web Speech API (ver useVoiceSearch.ts / el hook gemelo
// del POS en apps/frontend). Este es el modo "lista": queda escuchando en
// continuo mientras el cliente dicta varios productos seguidos ("cebolla,
// tomate, zanahoria..."), acumulando cada frase reconocida por separado —
// Chrome ya las corta solo en cada pausa, así que no hace falta que el
// cliente diga literalmente la palabra "coma".
interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlternativeLike; isFinal: boolean }
interface SpeechRecognitionEventLike { resultIndex: number; results: SpeechRecognitionResultLike[] }
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

interface UseVoiceListDictationOptions {
  lang?: string
}

export function useVoiceListDictation({ lang = 'es-PE' }: UseVoiceListDictationOptions = {}) {
  const [isListening, setIsListening] = useState(false)
  const [chunks, setChunks] = useState<string[]>([])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false)

  const SpeechRecognitionCtor = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)
    : undefined
  const isSupported = !!SpeechRecognitionCtor

  useEffect(() => {
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      // Solo agregamos los resultados nuevos desde resultIndex — en modo
      // continuo `results` acumula todo desde que empezó a escuchar.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal !== false) {
          const transcript = result[0]?.transcript?.trim()
          if (transcript) setChunks(prev => [...prev, transcript])
        }
      }
    }
    recognition.onerror = (event) => {
      if (event?.error === 'not-allowed' || event?.error === 'audio-capture') {
        shouldListenRef.current = false
        setIsListening(false)
      }
    }
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try { recognition.start() } catch { /* ya estaba iniciado */ }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    return () => {
      shouldListenRef.current = false
      recognition.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, !!SpeechRecognitionCtor])

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return
    setChunks([])
    shouldListenRef.current = true
    setIsListening(true)
    try {
      recognitionRef.current.start()
    } catch {
      shouldListenRef.current = false
      setIsListening(false)
    }
  }, [isListening])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const reset = useCallback(() => setChunks([]), [])

  return { isListening, chunks, start, stop, reset, isSupported }
}
