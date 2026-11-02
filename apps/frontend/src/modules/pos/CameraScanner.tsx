import { useEffect, useRef, useState } from 'react';
import { X, Flashlight, FlashlightOff, SwitchCamera, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Escáner de códigos de barra con la cámara del celular.
 *
 * - Usa el lector nativo del navegador (BarcodeDetector: Chrome en Android) y,
 *   si no existe (iPhone/Safari, algunos navegadores), cae a ZXing, que se
 *   carga sólo al abrir el escáner para no engordar el POS.
 * - Modo ráfaga: queda abierto y cada código leído se suma al carrito (con
 *   bip + vibración). El mismo código no se vuelve a sumar hasta pasado
 *   REPEAT_MS, así no se duplican productos por dejar la cámara apuntando;
 *   para vender 2 iguales se aparta y se vuelve a apuntar, o se sube la
 *   cantidad en el carrito.
 * - Necesita HTTPS (Railway ya lo da) o localhost.
 */

const REPEAT_MS = 1800;
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];

interface DetectedBarcode { rawValue: string }
interface NativeBarcodeDetector { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type NativeBarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

interface CameraScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export function isCameraScanSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1760;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch { /* sin audio no es crítico */ }
  try { navigator.vibrate?.(60); } catch { /* idem */ }
}

export function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stopped = false;
    let rafId = 0;
    let zxingControls: { stop: () => void } | null = null;

    const handleCode = (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastRef.current.code && now - lastRef.current.at < REPEAT_MS) {
        lastRef.current.at = now; // sigue apuntando al mismo: no repetir
        return;
      }
      lastRef.current = { code, at: now };
      beep();
      setLastCode(code);
      setFlash(true);
      setTimeout(() => setFlash(false), 250);
      onDetectedRef.current(code);
    };

    const start = async () => {
      setStarting(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // @ts-expect-error — enfoque continuo: Chrome Android lo acepta
            focusMode: 'continuous',
          },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchAvailable(!!caps.torch);
        setStarting(false);

        const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
        let nativeOk = false;
        if (Native) {
          try {
            const supported = (await Native.getSupportedFormats?.()) ?? NATIVE_FORMATS;
            const formats = NATIVE_FORMATS.filter(f => supported.includes(f));
            nativeOk = formats.length > 0;
            if (nativeOk) {
              const detector = new Native({ formats });
              let busy = false;
              const loop = async () => {
                if (stopped) return;
                if (!busy && video.readyState >= 2) {
                  busy = true;
                  try {
                    const found = await detector.detect(video);
                    if (found[0]?.rawValue) handleCode(found[0].rawValue);
                  } catch { /* cuadro inválido: se ignora */ }
                  busy = false;
                }
                rafId = requestAnimationFrame(loop);
              };
              loop();
            }
          } catch { nativeOk = false; }
        }

        if (!nativeOk) {
          const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
            import('@zxing/browser'), import('@zxing/library'),
          ]);
          if (stopped) return;
          // Solo los formatos de productos: menos lectores por cuadro = más
          // rápido en celulares modestos.
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE,
          ]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
          zxingControls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) handleCode(result.getText());
          });
        }
      } catch (err) {
        const name = (err as { name?: string })?.name;
        setStarting(false);
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('No hay permiso para usar la cámara. Actívalo en el candado de la barra de direcciones (Permisos → Cámara) y vuelve a intentar.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('No se encontró una cámara en este equipo.');
        } else if (!window.isSecureContext) {
          setError('La cámara solo funciona con conexión segura (https).');
        } else {
          setError('No se pudo abrir la cámara. Cierra otras apps que la estén usando y vuelve a intentar.');
        }
      }
    };

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setTorchOn(false);
    };
  }, [facing]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(v => !v);
    } catch { setTorchAvailable(false); }
  };

  // Atrás del celular (Android) cierra el escáner en vez de salir del POS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        {/* Recuadro guía */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={cn(
              'relative h-40 w-[78%] max-w-md rounded-2xl border-4 transition-colors',
              flash ? 'border-green-400 bg-green-400/20' : 'border-white/80',
            )}>
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            </div>
          </div>
        )}

        {/* Barra superior */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={onClose} aria-label="Cerrar escáner"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 active:bg-black/80">
            <X className="h-6 w-6" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ScanLine className="h-4 w-4" />Escanear productos
          </span>
          <div className="flex gap-2">
            {torchAvailable && (
              <button onClick={toggleTorch} aria-label="Linterna"
                className={cn('flex h-12 w-12 items-center justify-center rounded-full', torchOn ? 'bg-amber-400 text-black' : 'bg-black/50')}>
                {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
              </button>
            )}
            <button onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} aria-label="Cambiar cámara"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 active:bg-black/80">
              <SwitchCamera className="h-5 w-5" />
            </button>
          </div>
        </div>

        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Abriendo cámara…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-sm text-gray-900">
              <p className="mb-4">{error}</p>
              <button onClick={onClose} className="w-full rounded-xl bg-gray-900 py-3 font-semibold text-white">Cerrar</button>
            </div>
          </div>
        )}
      </div>

      {/* Pie: último código + listo */}
      <div className="flex items-center gap-3 bg-black p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1 text-xs text-white/70">
          {lastCode ? <>Último: <span className="font-mono text-white">{lastCode}</span></> : 'Apunta al código de barras. Se suma solo al carrito.'}
        </div>
        <button onClick={onClose}
          className="h-12 shrink-0 rounded-xl bg-white px-6 text-base font-bold text-black active:bg-white/80">
          Listo
        </button>
      </div>
    </div>
  );
}
