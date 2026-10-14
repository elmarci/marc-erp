import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Copy, ExternalLink, GripVertical, ImagePlus, Megaphone, Minus, Play, Plus, QrCode,
  Radio, RotateCcw, Save, ShoppingBasket, Tag, Trash2, Tv, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { TvSlideEditor } from './TvSlideEditor';
import {
  blankSlide, fromApi, liveSummary, newKey, toPayload,
  type TvLiveOption, type TvLiveState, type TvSlideDraft, type TvSlideFromApi, type TvSlideType,
} from './tvTypes';

const STORE_URL = ((import.meta.env['VITE_STORE_URL'] as string | undefined) ?? 'https://www.tiendasmarc.pe').replace(/\/$/, '');
const TV_URL = `${STORE_URL}/tv`;

const TYPE_META: Record<TvSlideType, { label: string; icon: React.ElementType }> = {
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

function summary(s: TvSlideDraft): string {
  if (s.type === 'OFFER') return s.offerName ?? 'Promoción';
  if (s.type === 'PRODUCTS') {
    const name = s.title || 'Productos';
    return s.productIds.length > 0
      ? `${name} · ${s.productIds.length} productos elegidos`
      : `${name} · automático (más vendidos ${s.autoPage * 8 + 1}–${s.autoPage * 8 + 8})`;
  }
  if (s.type === 'CUSTOM') return s.title || (s.imageUrl ? 'Imagen a pantalla completa' : 'Aviso');
  return s.title || 'Pide desde tu celular (QR)';
}

function scheduleNote(s: TvSlideDraft): string | null {
  const now = Date.now();
  if (s.type === 'OFFER' && s.offerActive === false) return 'La promoción ya no está vigente: no se muestra';
  if (s.type === 'PRODUCTS' && s.productIds.length === 0 && s.autoCount !== null && s.autoCount < 4) {
    return `Solo ${s.autoCount} productos con foto: no se muestra (elige productos o sube fotos)`;
  }
  if (s.endsAt && new Date(s.endsAt).getTime() < now) return 'Vencida: no se muestra';
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return 'Programada: aún no se muestra';
  return null;
}

function typeLabel(s: TvSlideDraft): string {
  return s.type === 'CUSTOM' && s.imageUrl && !s.title && !s.subtitle ? 'Imagen' : TYPE_META[s.type].label;
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={onClick}
      className={cn('relative h-6 min-h-0 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-muted-foreground/30')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await api.post<{ data: { imageUrl: string } }>('/tv/admin/upload-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data.imageUrl;
}

const isImage = (f: File) => /^image\/(png|jpe?g|webp)$/.test(f.type);

/* ── Vista previa: la propia pantalla /tv, escalada al ancho disponible ───── */
// Es la pantalla real, así que también muestra lo que se transmite en vivo.
function Preview({ refreshKey }: { refreshKey: number }) {
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
    <div ref={box} className="w-full overflow-hidden rounded-xl border bg-black" style={{ height: 1080 * scale }}>
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
function LivePanel({ live, options, minutes, setMinutes, onClear, clearing }: {
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
  const onAir = !!live && live.mode !== 'AUTO';

  const sendImage = async (files: File[]) => {
    const file = files.find(isImage);
    if (!file) { toast.error('Sube una imagen PNG, JPG o WEBP.'); return; }
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      await api.put('/tv/live/only', { imageUrl, seconds: 30, minutes });
      queryClient.invalidateQueries({ queryKey: ['tv-live-state'] });
      toast.success('Imagen en la TV ahora.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn('rounded-xl border p-4', onAir ? 'border-red-500/40 bg-red-500/5' : 'bg-card')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
          onAir ? 'bg-red-500 text-white' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>
          <Radio className={cn('h-3.5 w-3.5', onAir && 'animate-pulse')} />
          {onAir ? 'En vivo' : 'Automático'}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">
          {liveSummary(live, options)}
          {onAir && live?.expiresAt && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · vuelve solo a las {new Date(live.expiresAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
        {onAir && (
          <Button size="sm" onClick={onClear} loading={clearing}>
            <RotateCcw className="mr-1.5 h-4 w-4" />Volver al automático
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void sendImage(Array.from(e.dataTransfer.files)); }}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-colors',
            dragging ? 'border-primary bg-primary/10' : 'border-primary/40 hover:bg-primary/5',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          <ImagePlus className="h-6 w-6 shrink-0 text-primary" />
          <span className="text-sm">
            <b className="text-primary">{uploading ? 'Subiendo...' : 'Transmitir una imagen ahora'}</b>
            <span className="block text-xs text-muted-foreground">
              Sube o arrastra una imagen y sale en la TV al instante, sin guardarla en la lista.
            </span>
          </span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
            onChange={(e) => { void sendImage(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Cuánto tiempo en vivo</label>
          <select value={minutes === null ? 'forever' : String(minutes)}
            onChange={(e) => setMinutes(e.target.value === 'forever' ? null : Number(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {DURATIONS.map((d) => (
              <option key={d.label} value={d.minutes === null ? 'forever' : String(d.minutes)}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        También puedes pulsar <Play className="inline h-3 w-3" /> en cualquier slide de la lista para fijarla en la TV, o marcar varias y mostrar solo esas.
        Desde el POS el cajero puede mostrar la venta y promos al cliente.
      </p>
    </div>
  );
}

export function TvScreenPage() {
  const queryClient = useQueryClient();
  const [slides, setSlides] = useState<TvSlideDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [minutes, setMinutes] = useState<number | null>(15);
  const [previewKey, setPreviewKey] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [uploadingMany, setUploadingMany] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tv-admin-slides'],
    queryFn: async () => (await api.get<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides')).data.data,
  });

  const { data: live } = useQuery({
    queryKey: ['tv-live-state'],
    queryFn: async () => (await api.get<{ data: TvLiveState }>('/tv/live/state')).data.data,
    refetchInterval: 4000,
  });

  const { data: options } = useQuery({
    queryKey: ['tv-live-options'],
    queryFn: async () => (await api.get<{ data: TvLiveOption[] }>('/tv/live/options')).data.data,
  });

  useEffect(() => {
    if (data && !dirty) setSlides(data.slides.map(fromApi));
  }, [data, dirty]);

  const editing = slides.find((s) => s.key === editKey) ?? null;

  const update = (key: string, patch: Partial<TvSlideDraft>) => {
    setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return;
    const next = slides.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSlides(next);
    setDirty(true);
  };

  const remove = (key: string) => {
    setSlides((prev) => prev.filter((s) => s.key !== key));
    setChecked((prev) => { const n = new Set(prev); n.delete(key); return n; });
    if (editKey === key) setEditKey(null);
    setDirty(true);
  };

  const duplicate = (s: TvSlideDraft) => {
    const copy: TvSlideDraft = { ...s, key: newKey(), liveKey: null, virtual: false };
    const at = slides.findIndex((x) => x.key === s.key);
    const next = slides.slice();
    next.splice(at + 1, 0, copy);
    setSlides(next);
    setEditKey(copy.key);
    setDirty(true);
  };

  const add = (type: TvSlideType) => {
    const slide = blankSlide(type);
    setSlides((prev) => [...prev, slide]);
    setEditKey(slide.key);
    setDirty(true);
  };

  const addImages = async (files: File[]) => {
    const images = files.filter(isImage);
    if (images.length === 0) { toast.error('Sube imágenes PNG, JPG o WEBP.'); return; }
    setUploadingMany(true);
    const created: TvSlideDraft[] = [];
    for (const file of images) {
      try {
        created.push({ ...blankSlide('CUSTOM'), imageUrl: await uploadImage(file) });
      } catch (err) {
        toast.error(`${file.name}: ${getErrorMessage(err)}`);
      }
    }
    setUploadingMany(false);
    if (created.length === 0) return;
    setSlides((prev) => [...prev, ...created]);
    setEditKey(created[created.length - 1].key);
    setDirty(true);
    toast.success(created.length === 1
      ? 'Imagen agregada al final. Guarda los cambios para que salga en la rotación.'
      : `${created.length} imágenes agregadas al final. Guarda los cambios para que salgan en la rotación.`);
  };

  const applyServer = (serverSlides: TvSlideFromApi[]) => {
    setSlides(serverSlides.map(fromApi));
    setDirty(false);
    setEditKey(null);
    setChecked(new Set());
    setPreviewKey((k) => k + 1);
    queryClient.setQueryData(['tv-admin-slides'], { slides: serverSlides });
    queryClient.invalidateQueries({ queryKey: ['tv-live-options'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await api.put<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides', { slides: slides.map(toPayload) })).data.data,
    onSuccess: (res) => { applyServer(res.slides); toast.success('Guardado. La TV lo toma en menos de 5 minutos.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: async () => (await api.delete<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides')).data.data,
    onSuccess: (res) => { applyServer(res.slides); toast.success('Se restauró el armado automático.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // En vivo
  const afterLive = () => {
    queryClient.invalidateQueries({ queryKey: ['tv-live-state'] });
    setPreviewKey((k) => k + 1);
  };
  const showMutation = useMutation({
    mutationFn: (keys: string[]) => api.put('/tv/live/only', { keys, minutes }),
    onSuccess: (_r, keys) => {
      afterLive();
      setChecked(new Set());
      toast.success(keys.length === 1 ? 'Esa slide quedó fija en la TV.' : `La TV muestra solo esas ${keys.length} slides.`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const clearMutation = useMutation({
    mutationFn: () => api.delete('/tv/live'),
    onSuccess: () => { afterLive(); toast.success('La TV volvió al automático.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const visibleCount = useMemo(() => slides.filter((s) => s.isActive && !scheduleNote(s)).length, [slides]);
  const totalSeconds = useMemo(
    () => slides.filter((s) => s.isActive && !scheduleNote(s)).reduce((sum, s) => sum + s.seconds, 0),
    [slides],
  );

  const checkedKeys = slides.filter((s) => checked.has(s.key) && s.liveKey).map((s) => s.liveKey as string);
  const liveKeys = new Set(live?.mode === 'ONLY' ? live.keys : []);

  return (
    <div className="space-y-5 animate-fade-in pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Tv className="h-6 w-6" />Pantalla TV</h1>
          <p className="text-sm text-muted-foreground">
            Arma la lista que rota en la TV y toma el control en vivo cuando lo necesites. La TV abre <b>{TV_URL.replace('https://', '')}</b>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={TV_URL} target="_blank" rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted">
            <ExternalLink className="h-4 w-4" />Abrir pantalla
          </a>
          <Button variant="outline" loading={resetMutation.isPending}
            onClick={() => { if (confirm('Esto borra tu selección y orden, y vuelve al armado automático (todas las ofertas + más vendidos + app). ¿Continuar?')) resetMutation.mutate(); }}>
            <RotateCcw className="mr-2 h-4 w-4" />Restaurar automático
          </Button>
        </div>
      </div>

      <LivePanel live={live} options={options ?? []} minutes={minutes} setMinutes={setMinutes}
        onClear={() => clearMutation.mutate()} clearing={clearMutation.isPending} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        {/* ── Lista que rota ── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Lista que rota</h2>
              <p className="text-xs text-muted-foreground">
                {visibleCount} slides visibles · una vuelta dura {Math.floor(totalSeconds / 60)} min {totalSeconds % 60} s · arrastra <GripVertical className="inline h-3 w-3" /> para ordenar
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={cn('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90', uploadingMany && 'pointer-events-none opacity-70')}>
                <ImagePlus className="h-4 w-4" />{uploadingMany ? 'Subiendo...' : 'Subir imágenes'}
                <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => { void addImages(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              </label>
              <Button variant="outline" size="sm" onClick={() => add('CUSTOM')}><Plus className="mr-1 h-4 w-4" />Aviso con texto</Button>
              <Button variant="outline" size="sm" onClick={() => add('PRODUCTS')}><Plus className="mr-1 h-4 w-4" />Productos</Button>
              <Button variant="outline" size="sm" onClick={() => add('APP')}><Plus className="mr-1 h-4 w-4" />App (QR)</Button>
            </div>
          </div>

          {checked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{checked.size} seleccionada{checked.size === 1 ? '' : 's'}</span>
              <Button size="sm" disabled={checkedKeys.length === 0} loading={showMutation.isPending}
                onClick={() => showMutation.mutate(checkedKeys)}>
                <Radio className="mr-1.5 h-4 w-4" />Mostrar solo estas en la TV
              </Button>
              <button type="button" className="min-h-0 text-xs text-muted-foreground hover:underline" onClick={() => setChecked(new Set())}>Quitar selección</button>
              {checkedKeys.length < checked.size && <span className="text-xs text-amber-600">Las nuevas sin guardar no se pueden transmitir todavía.</span>}
            </div>
          )}

          {isLoading ? (
            <div className="rounded-xl border p-8 text-center text-muted-foreground">Cargando...</div>
          ) : slides.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay slides. Sube una imagen o agrega un aviso para empezar.
            </div>
          ) : (
            <ul className="space-y-2">
              {slides.map((s, i) => {
                const Icon = TYPE_META[s.type].icon;
                const note = scheduleNote(s);
                const thumb = s.type === 'OFFER' ? s.offerImage : s.type === 'CUSTOM' ? s.imageUrl : s.type === 'PRODUCTS' ? s.products[0]?.imageUrl : null;
                const isEditing = editKey === s.key;
                const isLive = !!s.liveKey && liveKeys.has(s.liveKey);
                return (
                  <li key={s.key}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => { e.preventDefault(); if (dragFrom !== null) setDragOver(i); }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-2.5 transition-colors',
                      isEditing && 'border-primary ring-1 ring-primary',
                      isLive && 'border-red-500/60 bg-red-500/5',
                      !s.isActive && 'opacity-60',
                      dragOver === i && dragFrom !== null && dragFrom !== i && 'border-primary border-dashed bg-primary/5',
                    )}
                  >
                    <span className="hidden cursor-grab text-muted-foreground active:cursor-grabbing sm:block" title="Arrastrar para ordenar">
                      <GripVertical className="h-5 w-5" />
                    </span>
                    <input type="checkbox" aria-label="Seleccionar para mostrar en la TV"
                      checked={checked.has(s.key)}
                      onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(s.key); else n.delete(s.key); return n; })}
                      className="h-4 w-4 min-h-0 min-w-0 shrink-0 rounded border-input" />

                    <button type="button" onClick={() => setEditKey(isEditing ? null : s.key)}
                      className="flex min-h-0 min-w-[170px] flex-1 basis-[190px] items-center gap-3 text-left">
                      <span className="flex h-11 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5 text-muted-foreground" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{typeLabel(s)}</span>
                          {isLive && <span className="rounded bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">EN VIVO</span>}
                          {s.virtual && <span className="rounded border px-1.5 py-0.5 text-[11px]">Nueva</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">{summary(s)}</span>
                        {note && <span className="block truncate text-xs text-amber-600">{note}</span>}
                      </span>
                    </button>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                    <div className="flex shrink-0 items-center rounded-md border" title="Segundos en pantalla">
                      <button type="button" aria-label="Menos tiempo" className="flex h-8 min-h-0 w-7 min-w-0 items-center justify-center hover:bg-muted"
                        onClick={() => update(s.key, { seconds: Math.max(4, s.seconds - 1) })}><Minus className="h-3.5 w-3.5" /></button>
                      <span className="w-9 text-center text-sm tabular-nums">{s.seconds}s</span>
                      <button type="button" aria-label="Más tiempo" className="flex h-8 min-h-0 w-7 min-w-0 items-center justify-center hover:bg-muted"
                        onClick={() => update(s.key, { seconds: Math.min(120, s.seconds + 1) })}><Plus className="h-3.5 w-3.5" /></button>
                    </div>

                    <Toggle on={s.isActive} onClick={() => update(s.key, { isActive: !s.isActive })} label={s.isActive ? 'Está en la rotación (clic para ocultar)' : 'Oculta de la rotación (clic para mostrar)'} />

                    <Button variant={isLive ? 'default' : 'outline'} size="sm" className="shrink-0"
                      disabled={!s.liveKey} loading={showMutation.isPending && showMutation.variables?.[0] === s.liveKey}
                      title={s.liveKey ? 'Mostrar esta slide ahora en la TV' : 'Guarda los cambios para poder transmitirla'}
                      onClick={() => s.liveKey && showMutation.mutate([s.liveKey])}>
                      <Play className="mr-1 h-3.5 w-3.5" />Ahora
                    </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Las ofertas activas en la tienda se agregan solas al final; si no quieres alguna en la TV, ocúltala con el interruptor.
          </p>
        </div>

        {/* ── Vista previa + edición ── */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Así se ve en la TV</p>
              <Button variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Actualizar
              </Button>
            </div>
            <Preview refreshKey={previewKey} />
            <p className="text-xs text-muted-foreground">Es la pantalla real: muestra lo guardado y lo que transmitas en vivo.</p>
          </div>

          {editing ? (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="min-w-0 truncate text-sm font-semibold">Editar: {summary(editing)}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Subir en la lista" disabled={slides[0]?.key === editing.key}
                    onClick={() => moveTo(slides.indexOf(editing), slides.indexOf(editing) - 1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Bajar en la lista" disabled={slides[slides.length - 1]?.key === editing.key}
                    onClick={() => moveTo(slides.indexOf(editing), slides.indexOf(editing) + 1)}><ArrowDown className="h-4 w-4" /></Button>
                  {editing.type !== 'OFFER' && (
                    <Button variant="ghost" size="icon-sm" aria-label="Duplicar" onClick={() => duplicate(editing)}><Copy className="h-4 w-4" /></Button>
                  )}
                  {editing.type !== 'OFFER' && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label="Eliminar"
                      onClick={() => { if (confirm('¿Eliminar esta slide de la lista?')) remove(editing.key); }}><Trash2 className="h-4 w-4" /></Button>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Cerrar edición" onClick={() => setEditKey(null)}><X className="h-4 w-4" /></Button>
                </div>
              </div>
              <TvSlideEditor slide={editing} onChange={(patch) => update(editing.key, patch)} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Toca una slide de la lista para editarla aquí.
            </p>
          )}
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-20 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-card px-4 py-3 shadow-lg">
          <p className="text-sm"><b>Tienes cambios sin guardar.</b> La rotación de la TV no los ve hasta que guardes.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDirty(false); setEditKey(null); setChecked(new Set()); if (data) setSlides(data.slides.map(fromApi)); }}>
              Descartar
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              <Save className="mr-1.5 h-4 w-4" />Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
