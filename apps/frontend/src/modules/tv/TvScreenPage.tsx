// Pantalla TV: lista de slides que rota, vista previa y control en vivo.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, Copy, ExternalLink, GripVertical, ImagePlus, Minus, Play, Plus,
  Radio, RotateCcw, Save, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, PageHeader, Toggle, surfaceCls, useConfirm } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { TvSlideEditor } from './TvSlideEditor';
import {
  blankSlide, fromApi, newKey, toPayload,
  type TvLiveOption, type TvLiveState, type TvSlideDraft, type TvSlideFromApi, type TvSlideType,
} from './tvTypes';
import { LivePanel, Preview, TV_URL, TYPE_META, isImage, scheduleNote, summary, typeLabel, uploadImage } from './tvParts';

export function TvScreenPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
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
        created.push({ ...blankSlide('CUSTOM'), layout: 'IMAGE', imageUrl: await uploadImage(file) });
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

  const resetAuto = async () => {
    const r = await confirm({
      title: 'Restaurar el armado automático',
      description: 'Esto borra tu selección y orden, y vuelve al armado automático (todas las ofertas + más vendidos + app).',
      confirmLabel: 'Restaurar', tone: 'primary',
    });
    if (r.ok) resetMutation.mutate();
  };
  const askRemove = async (key: string) => {
    const r = await confirm({ title: '¿Eliminar esta slide de la lista?', confirmLabel: 'Eliminar' });
    if (r.ok) remove(key);
  };
  const tag = 'rounded bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-medium';

  return (
    <div className="erp flex flex-col gap-5 pb-20">
      <PageHeader title="Pantalla TV" actions={<>
        <a href={TV_URL} target="_blank" rel="noreferrer"
          className="tap inline-flex h-9 items-center gap-1.5 rounded-ctl bg-surface px-3 text-body font-medium text-ink shadow-[0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2 [&_svg]:size-4">
          <ExternalLink />Abrir pantalla
        </a>
        <Btn loading={resetMutation.isPending} onClick={resetAuto}><RotateCcw />Restaurar automático</Btn>
      </>}>
        <p className="text-table text-ink-muted">
          Arma la lista que rota en la TV y toma el control en vivo cuando lo necesites. La TV abre <span className="font-medium text-ink">{TV_URL.replace('https://', '')}</span>.
        </p>
      </PageHeader>

      <LivePanel live={live} options={options ?? []} minutes={minutes} setMinutes={setMinutes}
        onClear={() => clearMutation.mutate()} clearing={clearMutation.isPending} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        {/* ── Lista que rota ── */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-section font-semibold">Lista que rota</h2>
              <p className="text-meta text-ink-muted">
                {visibleCount} slides visibles · una vuelta dura {Math.floor(totalSeconds / 60)} min {totalSeconds % 60} s · arrastra <GripVertical className="inline size-3" /> para ordenar
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={cn('tap inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-ctl bg-brand px-2.5 text-table font-medium text-white hover:bg-brand/90 [&_svg]:size-4', uploadingMany && 'pointer-events-none opacity-70')}>
                <ImagePlus />{uploadingMany ? 'Subiendo...' : 'Subir imágenes'}
                <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => { void addImages(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              </label>
              <Btn size="sm" onClick={() => add('CUSTOM')}><Plus />Aviso con texto</Btn>
              <Btn size="sm" onClick={() => add('PRODUCTS')}><Plus />Productos</Btn>
              <Btn size="sm" onClick={() => add('APP')}><Plus />App (QR)</Btn>
            </div>
          </div>

          {checked.size > 0 && (
            <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2 text-table', surfaceCls, 'shadow-[inset_3px_0_0_hsl(var(--brand)),0_0_0_1px_hsl(var(--line))]')}>
              <span className="font-medium">{checked.size} seleccionada{checked.size === 1 ? '' : 's'}</span>
              <Btn size="sm" variant="primary" disabled={checkedKeys.length === 0} loading={showMutation.isPending}
                onClick={() => showMutation.mutate(checkedKeys)}>
                <Radio />Mostrar solo estas en la TV
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Quitar selección</Btn>
              {checkedKeys.length < checked.size && <span className="text-meta text-warn-ink">Las nuevas sin guardar no se pueden transmitir todavía.</span>}
            </div>
          )}

          {isLoading ? (
            <div className={cn('p-8 text-center text-table text-ink-muted', surfaceCls)}>Cargando...</div>
          ) : slides.length === 0 ? (
            <div className="rounded-srf border border-dashed border-line-strong p-8 text-center text-table text-ink-muted">
              No hay slides. Sube una imagen o agrega un aviso para empezar.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
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
                      'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-srf bg-surface p-2.5 shadow-[0_0_0_1px_hsl(var(--line))] transition-colors',
                      isEditing && 'shadow-[0_0_0_2px_hsl(var(--brand))]',
                      isLive && !isEditing && 'shadow-[inset_3px_0_0_hsl(var(--bad)),0_0_0_1px_hsl(var(--line))]',
                      !s.isActive && 'opacity-60',
                      dragOver === i && dragFrom !== null && dragFrom !== i && 'bg-brand-soft shadow-[0_0_0_1px_hsl(var(--brand))]',
                    )}
                  >
                    <span className="hidden cursor-grab text-ink-muted active:cursor-grabbing sm:block" title="Arrastrar para ordenar">
                      <GripVertical className="size-5" />
                    </span>
                    <Check label="Seleccionar para mostrar en la TV" checked={checked.has(s.key)}
                      onChange={() => setChecked((prev) => { const n = new Set(prev); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })} />

                    <button type="button" onClick={() => setEditKey(isEditing ? null : s.key)}
                      className="flex min-w-[170px] flex-1 basis-[190px] items-center gap-3 text-left">
                      <span className="flex h-11 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-ctl bg-surface-2">
                        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="size-5 text-ink-muted" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={tag}>{typeLabel(s)}</span>
                          {isLive && <span className="rounded bg-bad px-1.5 py-0.5 text-[11px] font-semibold text-white">EN VIVO</span>}
                          {s.virtual && <span className={tag}>Nueva</span>}
                          {!s.showFooter && <span className={cn(tag, 'text-ink-muted')} title="Esta slide ocupa toda la pantalla">Sin barra</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-table font-medium">{summary(s)}</span>
                        {note && <span className="block truncate text-meta text-warn-ink">{note}</span>}
                      </span>
                    </button>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <div className="flex shrink-0 items-center rounded-ctl shadow-[0_0_0_1px_hsl(var(--line-strong))]" title="Segundos en pantalla">
                        <button type="button" aria-label="Menos tiempo" className="grid h-7 w-7 place-items-center rounded-l-ctl hover:bg-surface-2"
                          onClick={() => update(s.key, { seconds: Math.max(4, s.seconds - 1) })}><Minus className="size-3.5" /></button>
                        <span className="w-9 text-center text-table tabular-nums">{s.seconds}s</span>
                        <button type="button" aria-label="Más tiempo" className="grid h-7 w-7 place-items-center rounded-r-ctl hover:bg-surface-2"
                          onClick={() => update(s.key, { seconds: Math.min(120, s.seconds + 1) })}><Plus className="size-3.5" /></button>
                      </div>

                      <Toggle on={s.isActive} onChange={() => update(s.key, { isActive: !s.isActive })} label={s.isActive ? 'Está en la rotación (clic para ocultar)' : 'Oculta de la rotación (clic para mostrar)'} />

                      <Btn variant={isLive ? 'primary' : 'secondary'} size="sm" className="shrink-0"
                        disabled={!s.liveKey} loading={showMutation.isPending && showMutation.variables?.[0] === s.liveKey}
                        title={s.liveKey ? 'Mostrar esta slide ahora en la TV' : 'Guarda los cambios para poder transmitirla'}
                        onClick={() => s.liveKey && showMutation.mutate([s.liveKey])}>
                        <Play />Ahora
                      </Btn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-meta text-ink-muted">
            Las ofertas activas en la tienda se agregan solas al final; si no quieres alguna en la TV, ocúltala con el interruptor.
          </p>
        </div>

        {/* ── Vista previa + edición ── */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-16 xl:self-start">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-table font-medium">Así se ve en la TV</p>
              <Btn variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)}><RotateCcw />Actualizar</Btn>
            </div>
            <Preview refreshKey={previewKey} />
            <p className="text-meta text-ink-muted">Es la pantalla real: muestra lo guardado y lo que transmitas en vivo.</p>
          </div>

          {editing ? (
            <div className={cn('overflow-hidden', surfaceCls)}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <p className="min-w-0 truncate text-table font-semibold">Editar: {summary(editing)}</p>
                <div className="flex items-center gap-0.5">
                  <Btn variant="ghost" size="sm" aria-label="Subir en la lista" disabled={slides[0]?.key === editing.key}
                    onClick={() => moveTo(slides.indexOf(editing), slides.indexOf(editing) - 1)}><ArrowUp /></Btn>
                  <Btn variant="ghost" size="sm" aria-label="Bajar en la lista" disabled={slides[slides.length - 1]?.key === editing.key}
                    onClick={() => moveTo(slides.indexOf(editing), slides.indexOf(editing) + 1)}><ArrowDown /></Btn>
                  {editing.type !== 'OFFER' && (
                    <Btn variant="ghost" size="sm" aria-label="Duplicar" onClick={() => duplicate(editing)}><Copy /></Btn>
                  )}
                  {editing.type !== 'OFFER' && (
                    <Btn variant="ghost" size="sm" className="text-bad-ink" aria-label="Eliminar" onClick={() => askRemove(editing.key)}><Trash2 /></Btn>
                  )}
                  <Btn variant="ghost" size="sm" aria-label="Cerrar edición" onClick={() => setEditKey(null)}><X /></Btn>
                </div>
              </div>
              <TvSlideEditor slide={editing} onChange={(patch) => update(editing.key, patch)} />
            </div>
          ) : (
            <p className="rounded-srf border border-dashed border-line-strong p-4 text-center text-table text-ink-muted">
              Toca una slide de la lista para editarla aquí.
            </p>
          )}
        </div>
      </div>

      {dirty && (
        <div className={cn('sticky bottom-4 z-20 mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3', surfaceCls, 'shadow-[inset_3px_0_0_hsl(var(--warn)),0_0_0_1px_hsl(var(--line)),0_8px_24px_rgb(0_0_0/0.12)]')}>
          <p className="text-table"><span className="font-semibold">Tienes cambios sin guardar.</span> La rotación de la TV no los ve hasta que guardes.</p>
          <div className="flex gap-2">
            <Btn size="sm" onClick={() => { setDirty(false); setEditKey(null); setChecked(new Set()); if (data) setSlides(data.slides.map(fromApi)); }}>
              Descartar
            </Btn>
            <Btn size="sm" variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              <Save />Guardar cambios
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
