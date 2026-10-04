import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, ExternalLink, Megaphone, Pencil, Plus, QrCode, RotateCcw, Save, ShoppingBasket, Tag, Trash2, Tv,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { TvSlideEditor } from './TvSlideEditor';
import {
  blankSlide, fromApi, toPayload,
  type TvSlideDraft, type TvSlideFromApi, type TvSlideType,
} from './tvTypes';

const STORE_URL = ((import.meta.env['VITE_STORE_URL'] as string | undefined) ?? 'https://www.tiendasmarc.pe').replace(/\/$/, '');
const TV_URL = `${STORE_URL}/tv`;

const TYPE_META: Record<TvSlideType, { label: string; icon: React.ElementType }> = {
  OFFER: { label: 'Oferta', icon: Tag },
  PRODUCTS: { label: 'Productos', icon: ShoppingBasket },
  CUSTOM: { label: 'Aviso', icon: Megaphone },
  APP: { label: 'Llamado a la app', icon: QrCode },
};

function summary(s: TvSlideDraft): string {
  if (s.type === 'OFFER') return s.offerName ?? 'Promoción';
  if (s.type === 'PRODUCTS') {
    const name = s.title || 'Productos';
    return s.productIds.length > 0
      ? `${name} · ${s.productIds.length} productos elegidos`
      : `${name} · automático (más vendidos ${s.autoPage * 8 + 1}–${s.autoPage * 8 + 8})`;
  }
  if (s.type === 'CUSTOM') return s.title || 'Aviso con imagen';
  return s.title || 'Pide desde tu celular (QR)';
}

function scheduleNote(s: TvSlideDraft): string | null {
  const now = Date.now();
  if (s.type === 'OFFER' && s.offerActive === false) return 'La promoción ya no está vigente: no se muestra';
  if (s.type === 'PRODUCTS' && s.productIds.length === 0 && s.autoCount !== null && s.autoCount < 4) {
    return `Solo ${s.autoCount} productos con foto en este bloque: no se muestra (elige productos a mano o sube fotos)`;
  }
  if (s.endsAt && new Date(s.endsAt).getTime() < now) return 'Vencida: no se muestra';
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return 'Programada: aún no se muestra';
  return null;
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={cn('relative h-6 min-h-0 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-muted-foreground/30')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

// Vista previa real: la propia pantalla /tv en un iframe a 1920x1080 reducido
// a un tercio. Muestra lo ya guardado (se refresca al guardar).
function Preview({ refreshKey }: { refreshKey: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-black" style={{ width: 640, height: 360, maxWidth: '100%' }}>
      <iframe
        key={refreshKey}
        src={TV_URL}
        title="Vista previa de la pantalla TV"
        style={{ width: 1920, height: 1080, border: 0, transform: 'scale(0.3333)', transformOrigin: '0 0' }}
      />
    </div>
  );
}

export function TvScreenPage() {
  const queryClient = useQueryClient();
  const [slides, setSlides] = useState<TvSlideDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['tv-admin-slides'],
    queryFn: async () => (await api.get<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides')).data.data,
  });

  useEffect(() => {
    if (data && !dirty) setSlides(data.slides.map(fromApi));
  }, [data, dirty]);

  const update = (key: string, patch: Partial<TvSlideDraft>) => {
    setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const next = slides.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next);
    setDirty(true);
  };

  const remove = (key: string) => {
    setSlides((prev) => prev.filter((s) => s.key !== key));
    setDirty(true);
  };

  const add = (type: TvSlideType) => {
    const slide = blankSlide(type);
    setSlides((prev) => [...prev, slide]);
    setOpenKey(slide.key);
    setDirty(true);
  };

  const applyServer = (serverSlides: TvSlideFromApi[]) => {
    setSlides(serverSlides.map(fromApi));
    setDirty(false);
    setOpenKey(null);
    setPreviewKey((k) => k + 1);
    queryClient.setQueryData(['tv-admin-slides'], { slides: serverSlides });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await api.put<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides', { slides: slides.map(toPayload) })).data.data,
    onSuccess: (res) => { applyServer(res.slides); toast.success('Pantalla TV actualizada. La TV lo toma en menos de 5 minutos.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: async () => (await api.delete<{ data: { slides: TvSlideFromApi[] } }>('/tv/admin/slides')).data.data,
    onSuccess: (res) => { applyServer(res.slides); toast.success('Se restauró el armado automático.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const visibleCount = useMemo(
    () => slides.filter((s) => s.isActive && !scheduleNote(s)).length,
    [slides],
  );
  const totalSeconds = useMemo(
    () => slides.filter((s) => s.isActive && !scheduleNote(s)).reduce((sum, s) => sum + s.seconds, 0),
    [slides],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Tv className="h-6 w-6" />Pantalla TV</h1>
          <p className="text-sm text-muted-foreground">
            Lo que se muestra en la TV de la tienda. Abre <b>{TV_URL.replace('https://', '')}</b> en el navegador de la TV.
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
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!dirty}>
            <Save className="mr-2 h-4 w-4" />Guardar cambios
          </Button>
        </div>
      </div>

      {dirty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Tienes cambios sin guardar. La TV no los ve hasta que presiones <b>Guardar cambios</b>.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_660px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {visibleCount} slides visibles · una vuelta completa dura {Math.floor(totalSeconds / 60)} min {totalSeconds % 60} s
            </p>
          </div>

          {isLoading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
          ) : (
            slides.map((s, i) => {
              const meta = TYPE_META[s.type];
              const Icon = meta.icon;
              const note = scheduleNote(s);
              const isOpen = openKey === s.key;
              const thumb = s.type === 'OFFER' ? s.offerImage : s.type === 'CUSTOM' ? s.imageUrl : s.type === 'PRODUCTS' ? s.products[0]?.imageUrl : null;
              return (
                <Card key={s.key} className={cn(!s.isActive && 'opacity-60')}>
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5 text-muted-foreground" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{meta.label}</Badge>
                        {s.virtual && <Badge variant="outline" className="text-xs">Nueva</Badge>}
                        {note && <span className="text-xs text-amber-600">{note}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">{summary(s)}</p>
                    </div>

                    <div className="flex items-center gap-1" title="Segundos en pantalla">
                      <input type="number" min={4} max={120} value={s.seconds}
                        onChange={(e) => update(s.key, { seconds: Math.max(4, Math.min(120, parseInt(e.target.value, 10) || 4)) })}
                        className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center text-sm" />
                      <span className="text-xs text-muted-foreground">s</span>
                    </div>

                    <Toggle on={s.isActive} onClick={() => update(s.key, { isActive: !s.isActive })} label={s.isActive ? 'Ocultar slide' : 'Mostrar slide'} />

                    <div className="flex items-center">
                      <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Bajar" disabled={i === slides.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setOpenKey(isOpen ? null : s.key)}>
                        <Pencil className={cn('h-4 w-4', isOpen && 'text-primary')} />
                      </Button>
                      {s.type !== 'OFFER' && (
                        <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label="Eliminar" onClick={() => remove(s.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isOpen && <TvSlideEditor slide={s} onChange={(patch) => update(s.key, patch)} />}
                </Card>
              );
            })
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => add('CUSTOM')}><Plus className="mr-1.5 h-4 w-4" />Aviso (imagen o texto)</Button>
            <Button variant="outline" size="sm" onClick={() => add('PRODUCTS')}><Plus className="mr-1.5 h-4 w-4" />Selección de productos</Button>
            <Button variant="outline" size="sm" onClick={() => add('APP')}><Plus className="mr-1.5 h-4 w-4" />Llamado a la app</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Las ofertas activas en la tienda se agregan solas al final de la lista; si no quieres alguna en la TV, apágala con el interruptor.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Vista previa</p>
            <Button variant="ghost" size="sm" onClick={() => setPreviewKey((k) => k + 1)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Actualizar</Button>
          </div>
          <Preview refreshKey={previewKey} />
          <p className="text-xs text-muted-foreground">Muestra lo último guardado, rotando igual que en la TV.</p>
        </div>
      </div>
    </div>
  );
}
