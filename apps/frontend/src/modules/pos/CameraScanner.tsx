import { useEffect, useRef, useState } from 'react';
import { X, Flashlight, FlashlightOff, ScanLine, ZoomIn } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { usePosStore } from '@/stores/posStore';
import { useProductCacheStore } from '@/stores/productCacheStore';

/**
 * Escáner de códigos de barra con la cámara del celular, pensado para vender
 * seguido sin soltar el celular.
 *
 * Lectura:
 * - Solo se analiza la zona del recuadro (no toda la imagen): menos lecturas
 *   de códigos vecinos y cada cuadro se procesa más rápido.
 * - Lector nativo (BarcodeDetector, Chrome Android) o ZXing como respaldo.
 * - Solo formatos de producto: EAN-13/8, UPC-A/E (de fábrica) y Code 128
 *   (etiquetas internas PRO…). Formatos como Codabar/ITF/Code 39 generaban
 *   lecturas "fantasma" al confundir partes de otros códigos.
 *
 * Anti-errores:
 * - EAN/UPC con dígito verificador inválido se descartan (salvo que el
 *   código exista tal cual en el catálogo).
 * - Un código se acepta solo si se lee igual en varios cuadros seguidos
 *   (2 si está en el catálogo, 3 si no): una lectura suelta equivocada no
 *   llega al carrito.
 * - El mismo código no se vuelve a sumar mientras siga frente a la cámara;
 *   hay que apartarlo y volver a apuntar (o subir la cantidad en el carrito).
 */

const SCAN_INTERVAL_MS = 90;
const CONFIRM_KNOWN = 2;
const CONFIRM_UNKNOWN = 3;
const CONFIRM_WINDOW_MS = 900;
const SAME_CODE_GAP_MS = 1500; // tiempo sin verlo para poder sumarlo de nuevo
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const ZOOM_STEPS = [1, 1.5, 2];

interface DetectedBarcode { rawValue: string }
interface NativeBarcodeDetector { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type NativeBarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

interface CameraScannerProps {
  /** Devuelve si el producto se agregó al carrito. */
  onDetected: (code: string) => Promise<boolean> | boolean | void;
  onClose: () => void;
  onCheckout?: () => void;
}

export function isCameraScanSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/* ─── Validación y normalización ─────────────────────────────────────────── */

/** Dígito verificador GTIN (EAN-8, UPC-A, EAN-13). */
function gtinValid(code: string): boolean {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

function isPlausible(code: string): boolean {
  if (code.length < 3 || code.length > 40) return false;
  if (/^\d+$/.test(code) && [8, 12, 13].includes(code.length)) return gtinValid(code);
  return /^[\x20-\x7e]+$/.test(code);
}

/** UPC-A (12) y EAN-13 con 0 adelante son el mismo código: usa el que tenga el catálogo. */
function resolveInCatalog(code: string): { code: string; known: boolean; name?: string; price?: number } {
  const cache = useProductCacheStore.getState();
  const variants = [code];
  if (/^\d{12}$/.test(code)) variants.push('0' + code);
  if (/^0\d{12}$/.test(code)) variants.push(code.slice(1));
  for (const v of variants) {
    const p = cache.findByBarcode(v);
    if (p) {
      const price = p.matchedPack && p.packPrice != null ? Number(p.packPrice) : Number(p.salePrice);
      return { code: v, known: true, name: p.matchedPack ? `${p.name} (${p.packLabel || 'paquete'})` : p.name, price };
    }
  }
  return { code, known: false };
}

/* ─── Sonidos ────────────────────────────────────────────────────────────── */

let audioCtx: AudioContext | null = null;
function tone(freq: number, ms: number, type: OscillatorType = 'square') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* sin audio no es crítico */ }
}
const okFeedback = () => { tone(1760, 90); try { navigator.vibrate?.(50); } catch { /* */ } };
const errFeedback = () => { tone(220, 260, 'sawtooth'); try { navigator.vibrate?.([80, 60, 80]); } catch { /* */ } };

/* ─── Componente ─────────────────────────────────────────────────────────── */

type LastResult = { kind: 'ok'; name: string; price?: number } | { kind: 'error'; code: string } | null;

export function CameraScanner({ onDetected, onClose, onCheckout }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [last, setLast] = useState<LastResult>(null);
  const [flash, setFlash] = useState<'ok' | 'error' | null>(null);

  const cartCount = usePosStore(s => s.items.length);
  const cartTotal = usePosStore(s => s.total);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Estado de confirmación / repetición
    let candidate = { code: '', hits: 0, at: 0 };
    let lastAccepted = { code: '', seenAt: 0 };
    let busy = false; // esperando que el POS agregue el producto

    const accept = async (raw: string) => {
      const { code, known, name, price } = resolveInCatalog(raw);
      busy = true;
      let ok = false;
      try { ok = (await onDetectedRef.current(code)) !== false; } catch { ok = false; }
      busy = false;
      if (stopped) return;
      if (ok) {
        okFeedback();
        setLast({ kind: 'ok', name: name ?? code, price: known ? price : undefined });
      } else {
        errFeedback();
        setLast({ kind: 'error', code });
      }
      setFlash(ok ? 'ok' : 'error');
      setTimeout(() => setFlash(null), 300);
    };

    const handleRead = (raw: string | null) => {
      const now = Date.now();
      const code = raw?.trim() ?? '';
      if (!code) return;
      // Un código idéntico al del catálogo se acepta aunque su dígito
      // verificador no cuadre (algunos se cargaron a mano).
      const known = resolveInCatalog(code).known;
      if (!known && !isPlausible(code)) return;

      // Sigue frente a la cámara el que ya se sumó: no repetir.
      if (code === lastAccepted.code && now - lastAccepted.seenAt < SAME_CODE_GAP_MS) {
        lastAccepted.seenAt = now;
        return;
      }
      if (code === candidate.code && now - candidate.at < CONFIRM_WINDOW_MS) {
        candidate = { code, hits: candidate.hits + 1, at: now };
      } else {
        candidate = { code, hits: 1, at: now };
      }
      const needed = known ? CONFIRM_KNOWN : CONFIRM_UNKNOWN;
      if (candidate.hits >= needed && !busy) {
        lastAccepted = { code, seenAt: now };
        candidate = { code: '', hits: 0, at: 0 };
        accept(code);
      }
    };

    const start = async () => {
      setStarting(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean; zoom?: { min: number; max: number }; focusMode?: string[];
        };
        setTorchAvailable(!!caps.torch);
        // Enfoque continuo cuando la cámara lo permite.
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
        // Un poco de zoom evita acercar demasiado el producto (de cerca la
        // cámara no enfoca y el código sale borroso).
        if (caps.zoom && caps.zoom.max >= 1.5) {
          setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
          const initial = Math.min(1.5, caps.zoom.max);
          track.applyConstraints({ advanced: [{ zoom: initial } as MediaTrackConstraintSet] })
            .then(() => setZoom(initial)).catch(() => undefined);
        }
        setStarting(false);

        // Lector: nativo si soporta los formatos; si no, ZXing.
        let decode: (c: HTMLCanvasElement) => Promise<string | null>;
        const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
        let nativeFormats: string[] = [];
        if (Native) {
          try {
            const supported = (await Native.getSupportedFormats?.()) ?? NATIVE_FORMATS;
            nativeFormats = NATIVE_FORMATS.filter(f => supported.includes(f));
          } catch { nativeFormats = []; }
        }
        if (Native && nativeFormats.length >= 3) {
          const detector = new Native({ formats: nativeFormats });
          decode = async (c) => {
            const found = await detector.detect(c);
            return found[0]?.rawValue ?? null;
          };
        } else {
          const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
            import('@zxing/browser'), import('@zxing/library'),
          ]);
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          decode = async (c) => {
            try { return reader.decodeFromCanvas(c).getText(); } catch { return null; }
          };
        }
        if (stopped) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        const tick = async () => {
          if (stopped) return;
          const t0 = performance.now();
          try {
            if (video.readyState >= 2 && video.videoWidth && guideRef.current) {
              // Zona del recuadro en coordenadas del video (el video se ve con
              // object-cover: escala + recorte centrado). Se agranda un poco.
              const vr = video.getBoundingClientRect();
              const gr = guideRef.current.getBoundingClientRect();
              const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
              const offX = (vr.width - video.videoWidth * scale) / 2;
              const offY = (vr.height - video.videoHeight * scale) / 2;
              const padX = gr.width * 0.08, padY = gr.height * 0.35;
              let sx = (gr.left - vr.left - padX - offX) / scale;
              let sy = (gr.top - vr.top - padY - offY) / scale;
              let sw = (gr.width + padX * 2) / scale;
              let sh = (gr.height + padY * 2) / scale;
              sx = Math.max(0, sx); sy = Math.max(0, sy);
              sw = Math.min(video.videoWidth - sx, sw); sh = Math.min(video.videoHeight - sy, sh);
              const down = Math.min(1, 1280 / sw);
              canvas.width = Math.round(sw * down);
              canvas.height = Math.round(sh * down);
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              handleRead(await decode(canvas));
            }
          } catch { /* cuadro inválido: se ignora */ }
          const elapsed = performance.now() - t0;
          timer = setTimeout(tick, Math.max(0, SCAN_INTERVAL_MS - elapsed));
        };
        tick();
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
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(v => !v);
    } catch { setTorchAvailable(false); }
  };

  const cycleZoom = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    const steps = ZOOM_STEPS.filter(z => z >= zoomRange.min && z <= zoomRange.max);
    const next = steps[(steps.findIndex(z => z >= zoom - 0.01) + 1) % steps.length] ?? 1;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] });
      setZoom(next);
    } catch { setZoomRange(null); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        {/* Recuadro guía: solo se lee lo que está dentro */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div ref={guideRef} className={cn(
              'relative h-36 w-[82%] max-w-md rounded-2xl border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors',
              flash === 'ok' ? 'border-green-400 bg-green-400/25' : flash === 'error' ? 'border-red-500 bg-red-500/25' : 'border-white/90',
            )}>
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            </div>
            <p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
              Código dentro del recuadro, a unos 15–20 cm
            </p>
          </div>
        )}

        {/* Barra superior */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={onClose} aria-label="Cerrar escáner"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 active:bg-black/80">
            <X className="h-6 w-6" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ScanLine className="h-4 w-4" />Escanear
          </span>
          <div className="flex gap-2">
            {zoomRange && (
              <button onClick={cycleZoom} aria-label="Zoom"
                className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-full bg-black/50 px-3 text-sm font-bold active:bg-black/80">
                <ZoomIn className="h-4 w-4" />{zoom}x
              </button>
            )}
            {torchAvailable && (
              <button onClick={toggleTorch} aria-label="Linterna"
                className={cn('flex h-12 w-12 items-center justify-center rounded-full', torchOn ? 'bg-amber-400 text-black' : 'bg-black/50')}>
                {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
              </button>
            )}
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

      {/* Pie: último producto, carrito y cobrar sin salir del escáner */}
      <div className="space-y-2 bg-black p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={cn(
          'flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm',
          last?.kind === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-white/10',
        )}>
          {last == null && <span className="text-white/70">Apunta al código. Cada producto se suma solo al carrito.</span>}
          {last?.kind === 'ok' && (
            <>
              <span className="min-w-0 truncate font-semibold">✓ {last.name}</span>
              {last.price != null && <span className="shrink-0 font-bold">{formatCurrency(last.price)}</span>}
            </>
          )}
          {last?.kind === 'error' && <span className="min-w-0 truncate">✕ No registrado: <span className="font-mono">{last.code}</span></span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="h-14 flex-1 rounded-xl border border-white/30 px-3 text-left active:bg-white/10">
            <span className="block text-[11px] leading-tight text-white/60">{cartCount} en carrito · seguir</span>
            <span className="block text-lg font-black leading-tight">{formatCurrency(cartTotal)}</span>
          </button>
          {onCheckout && (
            <button onClick={onCheckout} disabled={cartCount === 0}
              className="h-14 flex-1 rounded-xl bg-green-500 text-lg font-bold text-white active:bg-green-600 disabled:opacity-40">
              Cobrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
