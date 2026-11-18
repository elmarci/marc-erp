// Piezas de la página Pantalla TV: textos de cada slide, subida de imágenes,
// vista previa escalada y panel de transmisión en vivo.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Megaphone, Play, QrCode, Radio, RotateCcw, ShoppingBasket, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, fieldCls, surfaceCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { liveSummary, type TvLiveOption, type TvLiveState, type TvSlideDraft, type TvSlideType } from './tvTypes';

const STORE_URL = ((import.meta.env['VITE_STORE_URL'] as string | undefined) ?? 'https://www.tiendasmarc.pe').replace(/\/$/, '');
export const TV_URL = `${STORE_URL}/tv`;

export const TYPE_META: Record<TvSlideType, { label: string; icon: React.ElementType }> = {
  OFFER: { label: 'Oferta', icon: Tag },
  PRODUCTS: { label: 'Productos', icon: ShoppingBasket },
  CUSTOM: { label: 'Aviso', icon: Megaphone },
  APP: { label: 'Llamado a la app', icon: QrCode },
};

const DURATIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '5 minutos', minutes: 5 },
  { label: '15 minutos', minutes: 15 },
  { label: '30 minutos', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: 'Hasta que lo cambie', minutes: null },
];

export function summary(s: TvSlideDraft): string {
  if (s.type === 'OFFER') return s.offerName ?? 'Promoción';
  if (s.type === 'PRODUCTS') {
    const name = s.title || 'Productos';
    return s.productIds.length > 0
      ? `${name} · ${s.productIds.length} productos elegidos`
      : `${name} · automático (más vendidos ${s.autoPage * 8 + 1}–${s.autoPage * 8 + 8})`;
  }
  if (s.type === 'CUSTOM') {
    if (s.label) return s.label;
    if (s.layout === 'IMAGE') return s.imageUrl ? 'Imagen a pantalla completa' : 'Imagen (falta subirla)';
    return s.title || 'Aviso';
  }
  return s.title || 'Pide desde tu celular (QR)';
}

export function scheduleNote(s: TvSlideDraft): string | null {
  const now = Date.now();
  if (s.type === 'OFFER' && s.offerActive === false) return 'La promoción ya no está vigente: no se muestra';
  if (s.type === 'PRODUCTS' && s.productIds.length === 0 && s.autoCount !== null && s.autoCount < 4) {
    return `Solo ${s.autoCount} productos con foto: no se muestra (elige productos o sube fotos)`;
  }
  if (s.endsAt && new Date(s.endsAt).getTime() < now) return 'Vencida: no se muestra';
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return 'Programada: aún no se muestra';
  return null;
}

export function typeLabel(s: TvSlideDraft): string {
  if (s.type === 'CUSTOM') return s.layout === 'IMAGE' ? 'Imagen' : s.layout === 'IMAGE_TEXT' ? 'Imagen y texto' : 'Texto';
  return TYPE_META[s.type].label;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await api.post<{ data: { imageUrl: string } }>('/tv/admin/upload-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data.imageUrl;
}

export const isImage = (f: File) => /^image\/(png|jpe?g|webp)$/.test(f.type);

/* ── Vista previa: la propia pantalla /tv, escalada al ancho disponible ───── */
// Es la pantalla real, así que también muestra lo que se transmite en vivo.
export function Preview({ refreshKey }: { refreshKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const measure = () => { if (box.current) setWidth(box.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const scale = width / 1920;
  return (
    <div ref={box} className="w-full overflow-hidden rounded-srf bg-black shadow-[0_0_0_1px_hsl(var(--line))]" style={{ height: 1080 * scale }}>
      <iframe
        key={refreshKey}
        src={TV_URL}
        title="Vista previa de la pantalla TV"
        style={{ width: 1920, height: 1080, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}
      />
    </div>
  );
}

/* ── Transmisión en vivo ───────────────────────────────────────────────────── */
export function LivePanel({ live, options, minutes, setMinutes, onClear, clearing }: {
  live: TvLiveState | undefined;
  options: TvLiveOption[];
  minutes: number | null;
  setMinutes: (m: number | null) => void;
  onClear: () => void;
  clearing: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [withFooter, setWithFooter] = useState(false);
  const onAir = !!live && live.mode !== 'AUTO';

  const sendImage = async (files: File[]) => {
    const file = files.find(isImage);
    if (!file) { toast.error('Sube una imagen PNG, JPG o WEBP.'); return; }
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      await api.put('/tv/live/only', { imageUrl, seconds: 30, minutes, footer: withFooter });
      queryClient.invalidateQueries({ queryKey: ['tv-live-state'] });
      toast.success('Imagen en la TV ahora.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn('p-4', surfaceCls, onAir && 'shadow-[inset_3px_0_0_hsl(var(--bad)),0_0_0_1px_hsl(var(--line))]')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-meta font-semibold',
          onAir ? 'bg-bad text-white' : 'bg-ink/[0.06] text-ink')}>
          <Radio className={cn('size-3.5', onAir ? 'animate-pulse' : 'text-ok')} />
          {onAir ? 'En vivo' : 'Automático'}
        </span>
        <p className="min-w-0 flex-1 text-table font-medium">
          {liveSummary(live, options)}
          {onAir && live?.expiresAt && (
            <span className="ml-2 text-meta font-normal text-ink-muted">
              · vuelve solo a las {new Date(live.expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
        {onAir && (
          <Btn size="sm" variant="primary" onClick={onClear} loading={clearing}>
            <RotateCcw />Volver al automático
          </Btn>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void sendImage(Array.from(e.dataTransfer.files)); }}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-ctl border border-dashed px-4 py-3 transition-colors',
            dragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-surface-2',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          <ImagePlus className="size-5 shrink-0 text-brand" />
          <span className="text-table">
            <span className="font-medium">{uploading ? 'Subiendo...' : 'Transmitir una imagen ahora'}</span>
            <span className="block text-meta text-ink-muted">
              Sube o arrastra una imagen y sale en la TV al instante, sin guardarla en la lista.
            </span>
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
            onChange={(e) => { void sendImage(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>

        <Field label="Cuánto tiempo en vivo">
          <select value={minutes === null ? 'forever' : String(minutes)}
            onChange={(e) => setMinutes(e.target.value === 'forever' ? null : Number(e.target.value))}
            className={cn(fieldCls, 'w-48')}>
            {DURATIONS.map((d) => (
              <option key={d.label} value={d.minutes === null ? 'forever' : String(d.minutes)}>{d.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-table text-ink-muted">
        <input type="checkbox" checked={withFooter} onChange={(e) => setWithFooter(e.target.checked)}
          className="size-4 accent-[hsl(var(--brand))]" />
        Mostrar la barra inferior (dirección y QR) en la imagen que transmito
      </label>
      <p className="mt-2 text-meta text-ink-muted">
        También puedes pulsar <Play className="inline size-3" /> en cualquier slide de la lista para fijarla en la TV, o marcar varias y mostrar solo esas.
        Desde el POS el cajero puede mostrar la venta y promos al cliente.
      </p>
    </div>
  );
}
