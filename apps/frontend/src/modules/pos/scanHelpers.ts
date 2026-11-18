// Ayudas del escáner con cámara: validar y normalizar códigos leídos, buscarlos
// en el catálogo local y los sonidos de acierto o error.
import { useProductCacheStore } from '@/stores/productCacheStore';

/* ─── Validación y normalización ─────────────────────────────────────────── */

/** Dígito verificador GTIN (EAN-8, UPC-A, EAN-13). */
export function gtinValid(code: string): boolean {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

export function isPlausible(code: string): boolean {
  if (code.length < 3 || code.length > 40) return false;
  if (/^\d+$/.test(code) && [8, 12, 13].includes(code.length)) return gtinValid(code);
  return /^[\x20-\x7e]+$/.test(code);
}

/** UPC-A (12) y EAN-13 con 0 adelante son el mismo código: usa el que tenga el catálogo. */
export function resolveInCatalog(code: string): { code: string; known: boolean; name?: string; price?: number } {
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
export const okFeedback = () => { tone(1760, 90); try { navigator.vibrate?.(50); } catch { /* */ } };
export const errFeedback = () => { tone(220, 260, 'sawtooth'); try { navigator.vibrate?.([80, 60, 80]); } catch { /* */ } };
