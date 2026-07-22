import { useCallback, useEffect, useRef, useState } from 'react';

// Tipos mínimos de la Web Speech API — no vienen en lib.dom.d.ts de TS.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultLike[];
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface UseVoiceRecognitionOptions {
  onResult: (transcript: string) => void;
  lang?: string;
}

// Envuelve la Web Speech API nativa del navegador (gratis, sin backend ni
// costo por uso) para reconocimiento de voz en español. Solo Chrome/Edge la
// implementan — en otros navegadores isSupported queda en false y quien la
// use debe ocultar el botón de micrófono.
//
// Modo continuo: una sola activación queda escuchando varias frases seguidas
// (el cajero no necesita volver a tocar el botón entre comando y comando).
// Chrome a veces corta la sesión sola tras una pausa larga de silencio —
// mientras el cajero no la haya apagado manualmente, se reinicia sola.
export function useVoiceRecognition({ onResult, lang = 'es-PE' }: UseVoiceRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const shouldListenRef = useRef(false);

  const SpeechRecognitionCtor = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)
    : undefined;
  const isSupported = !!SpeechRecognitionCtor;

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // En modo continuo `results` acumula todas las frases reconocidas desde
      // que empezó a escuchar — solo nos interesa la última agregada.
      const last = event.results[event.results.length - 1];
      onResultRef.current(last[0].transcript);
    };
    recognition.onerror = (event) => {
      // "no-speech" es normal en modo continuo (silencio entre frases) — no
      // apagar el micrófono por eso, onend se encarga de reintentar.
      if (event?.error === 'not-allowed' || event?.error === 'audio-capture') {
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          // ya estaba iniciado o el navegador lo rechazó — se reintentará en el próximo onend
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      recognition.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, !!SpeechRecognitionCtor]);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    shouldListenRef.current = true;
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }, [isListening]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop(); else start();
  }, [isListening, start, stop]);

  return { isListening, start, stop, toggle, isSupported };
}
