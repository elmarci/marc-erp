import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import type { TvProductRef, TvSlideDraft } from './tvTypes';

const MAX_PRODUCTS = 8;

interface Props {
  slide: TvSlideDraft;
  onChange: (patch: Partial<TvSlideDraft>) => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post<{ data: { imageUrl: string } }>('/tv/admin/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.data.imageUrl);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-20 w-36 rounded-lg border object-contain bg-muted" />
      ) : (
        <div className="flex h-20 w-36 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Sin imagen
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          <ImagePlus className="h-4 w-4" />
          {uploading ? 'Subiendo...' : value ? 'Cambiar imagen' : 'Subir imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {value && (
          <button type="button" className="min-h-0 text-left text-xs text-destructive hover:underline" onClick={() => onChange('')}>
            Quitar imagen
          </button>
        )}
      </div>
    </div>
  );
}

function ProductPicker({ selected, onChange }: { selected: TvProductRef[]; onChange: (products: TvProductRef[]) => void }) {
  const [search, setSearch] = useState('');

  const { data: results, isFetching } = useQuery({
    queryKey: ['tv-product-search', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string; salePrice: number; imageUrl: string | null }> }>(
        '/products', { params: { q: search.trim(), limit: 8, status: 'ACTIVE' } },
      );
      return res.data.data;
    },
  });

  const add = (p: TvProductRef) => {
    if (selected.some((s) => s.id === p.id)) return;
    if (selected.length >= MAX_PRODUCTS) { toast.error(`Máximo ${MAX_PRODUCTS} productos por slide.`); return; }
    onChange([...selected, { id: p.id, name: p.name, salePrice: Number(p.salePrice), imageUrl: p.imageUrl }]);
    setSearch('');
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-2 text-sm">
              {p.imageUrl
                ? <img src={p.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">{p.name.charAt(0)}</span>}
              <span className="max-w-[180px] truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">{formatCurrency(p.salePrice)}</span>
              {!p.imageUrl && <span className="text-xs text-amber-600" title="Sin foto: en la TV se verá una letra">sin foto</span>}
              <button type="button" className="min-h-0 min-w-0" aria-label={`Quitar ${p.name}`} onClick={() => onChange(selected.filter((s) => s.id !== p.id))}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Buscar producto para agregar (${selected.length}/${MAX_PRODUCTS})...`}
          startIcon={<Search className="h-4 w-4" />}
        />
        {search.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-card shadow-lg">
            {isFetching && <p className="p-3 text-sm text-muted-foreground">Buscando...</p>}
            {!isFetching && (results ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>}
            {(results ?? []).map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  : <span className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs">{p.name.charAt(0)}</span>}
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-muted-foreground">{formatCurrency(Number(p.salePrice))}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TvSlideEditor({ slide, onChange }: Props) {
  const showSchedule = slide.type === 'CUSTOM' || slide.type === 'PRODUCTS';

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4">
      {slide.type === 'OFFER' && (
        <p className="text-sm text-muted-foreground">
          Esta slide muestra la promoción tal como está en <b>Ofertas</b> (foto, precio y fecha). Para cambiar su contenido
          edítala allá; aquí solo decides si sale, en qué orden y por cuánto tiempo.
        </p>
      )}

      {slide.type === 'APP' && (
        <>
          <Field label="Título" hint="Vacío = «Pide desde tu celular»">
            <Input value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Texto de apoyo" hint="Vacío = «Delivery en Manchay o recoge en tienda. Ofertas y puntos que solo encuentras en la app.»">
            <textarea value={slide.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} maxLength={240} rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </Field>
        </>
      )}

      {slide.type === 'CUSTOM' && (
        <>
          <Field label="Título" hint="Ej. «Hoy pollo a S/ 6.50». Si lo dejas vacío y subes una imagen, se muestra solo la imagen a pantalla completa.">
            <Input value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Texto de apoyo (opcional)">
            <textarea value={slide.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} maxLength={240} rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </Field>
          <Field label="Imagen (opcional)">
            <ImagePicker value={slide.imageUrl} onChange={(imageUrl) => onChange({ imageUrl })} />
          </Field>
        </>
      )}

      {slide.type === 'PRODUCTS' && (
        <>
          <Field label="Título de la slide">
            <Input value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} placeholder="Los más vendidos" />
          </Field>
          <Field
            label="Productos"
            hint={slide.productIds.length === 0
              ? 'Ahora es automática: muestra los más vendidos que tienen foto. Elige productos para fijar tú la selección.'
              : 'Selección manual. Quita todos los productos para volver al modo automático.'}
          >
            {slide.productIds.length === 0 && (
              <div className="mb-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Bloque de más vendidos:</span>
                {[0, 1, 2].map((page) => (
                  <button key={page} type="button" onClick={() => onChange({ autoPage: page })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${slide.autoPage === page ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>
                    Top {page * 8 + 1}–{page * 8 + 8}
                  </button>
                ))}
              </div>
            )}
            <ProductPicker
              selected={slide.products}
              onChange={(products) => onChange({ products, productIds: products.map((p) => p.id) })}
            />
          </Field>
        </>
      )}

      {showSchedule && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mostrar desde (opcional)">
            <Input type="datetime-local" value={slide.startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} />
          </Field>
          <Field label="Mostrar hasta (opcional)" hint="Pasada esta fecha la slide se oculta sola.">
            <Input type="datetime-local" value={slide.endsAt} onChange={(e) => onChange({ endsAt: e.target.value })} />
          </Field>
        </div>
      )}

      {(slide.startsAt || slide.endsAt) && showSchedule && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ startsAt: '', endsAt: '' })}>Quitar horario</Button>
      )}
    </div>
  );
}
