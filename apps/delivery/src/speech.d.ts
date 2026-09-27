// TypeScript no incluye los tipos de Web Speech API en lib.dom — declaración
// mínima con solo lo que useVoiceCommand.ts necesita.
interface SpeechRecognitionResultLike {
  transcript: string
}
interface SpeechRecognitionAlternativeList {
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEvent extends Event {
  results: { [index: number]: SpeechRecognitionAlternativeList }
}
interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  start(): void
  stop(): void
}
