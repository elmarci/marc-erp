import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Segmented, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { TvProductRef, TvSlideDraft } from './tvTypes';

const MAX_PRODUCTS = 8;

interface Props {
  slide: TvSlideDraft;
  onChange: (patch: Partial<TvSlideDraft>) => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-meta font-medium text-ink-muted">{label}</p>
      {children}
      {hint && <p className="mt-1 text-meta text-ink-muted">{hint}</p>}
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
        <img src={value} alt="" className="h-20 w-36 rounded-ctl bg-surface-2 object-contain shadow-[0_0_0_1px_hsl(var(--line))]" />
      ) : (
        <div className="flex h-20 w-36 items-center justify-center rounded-ctl border border-dashed border-line-strong text-meta text-ink-muted">
          Sin imagen
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="tap inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-ctl bg-surface px-2.5 text-table font-medium shadow-[0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2">
          <ImagePlus className="size-4" />
          {uploading ? 'Subiendo...' : value ? 'Cambiar imagen' : 'Subir imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
            onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {value && (
          <button type="button" className="text-left text-meta text-bad-ink hover:underline" onClick={() => onChange('')}>
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
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-2 text-table shadow-[0_0_0_1px_hsl(var(--line-strong))]">
              {p.imageUrl
                ? <img src={p.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                : <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-meta">{p.name.charAt(0)}</span>}
              <span className="max-w-[180px] truncate">{p.name}</span>
              <span className="text-meta tabular-nums text-ink-muted">{formatCurrency(p.salePrice)}</span>
              {!p.imageUrl && <span className="text-meta text-warn-ink" title="Sin foto: en la TV se verá una letra">sin foto</span>}
              <button type="button" className="grid size-5 place-items-center rounded-full" aria-label={`Quitar ${p.name}`} onClick={() => onChange(selected.filter((s) => s.id !== p.id))}>
                <X className="size-3.5 text-ink-muted hover:text-bad-ink" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Buscar producto para agregar (${selected.length}/${MAX_PRODUCTS})...`}
          className={cn(fieldCls, 'pl-8')}
        />
        {search.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_rgb(0_0_0/0.12)]">
            {isFetching && <p className="p-3 text-table text-ink-muted">Buscando...</p>}
            {!isFetching && (results ?? []).length === 0 && <p className="p-3 text-table text-ink-muted">Sin resultados.</p>}
            {(results ?? []).map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-table hover:bg-surface-2">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" className="size-8 rounded object-cover" />
                  : <span className="flex size-8 items-center justify-center rounded bg-surface-2 text-meta">{p.name.charAt(0)}</span>}
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-ink-muted">{formatCurrency(Number(p.salePrice))}</span>
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
    <div className="flex flex-col gap-4 bg-surface-2/50 px-4 py-4">
      {slide.type === 'OFFER' && (
        <p className="text-table text-ink-muted">
          Esta slide muestra la promoción tal como está en <span className="font-medium text-ink">Ofertas</span> (foto, precio y fecha). Para cambiar su contenido
          edítala allá; aquí solo decides si sale, en qué orden y por cuánto tiempo.
        </p>
      )}

      {slide.type === 'APP' && (
        <>
          <Field label="Título" hint="Vacío = «Pide desde tu celular»">
            <input className={fieldCls} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Texto de apoyo" hint="Vacío = «Delivery en Manchay o recoge en tienda. Ofertas y puntos que solo encuentras en la app.»">
            <textarea value={slide.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} maxLength={240} rows={2}
              className={cn(fieldCls, 'h-auto py-2')} />
          </Field>
        </>
      )}

      {slide.type === 'CUSTOM' && (
        <>
          <Field label="Nombre (solo para ti)" hint="Para reconocerla en la lista. No sale en la TV.">
            <input className={fieldCls} value={slide.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={80} placeholder="Ej. Catálogo de frutas" />
          </Field>

          <Field label="Cómo se ve en la TV">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['IMAGE', 'Solo imagen', 'A pantalla completa'],
                ['IMAGE_TEXT', 'Imagen y texto', 'Foto + mensaje grande'],
                ['TEXT', 'Solo texto', 'Mensaje grande'],
              ] as const).map(([value, title, sub]) => (
                <button key={value} type="button"
                  onClick={() => {
                    // Al pasar a "solo imagen", el título escrito antes no se pierde: queda como nombre.
                    if (value === 'IMAGE' && slide.title && !slide.label) onChange({ layout: value, label: slide.title });
                    else onChange({ layout: value });
                  }}
                  className={cn('rounded-ctl bg-surface px-3 py-2 text-left transition-colors', slide.layout === value ? 'bg-brand-soft shadow-[0_0_0_2px_hsl(var(--brand))]' : 'shadow-[0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2')}>
                  <span className="block text-table font-semibold">{title}</span>
                  <span className="block text-meta text-ink-muted">{sub}</span>
                </button>
              ))}
            </div>
          </Field>

          {slide.layout !== 'TEXT' && (
            <Field label="Imagen">
              <ImagePicker value={slide.imageUrl} onChange={(imageUrl) => onChange({ imageUrl })} />
            </Field>
          )}

          {slide.layout !== 'IMAGE' && (
            <>
              <Field label="Mensaje principal" hint="Ej. «Hoy pollo a S/ 6.50». Es el texto grande que ve el cliente en la TV.">
                <input className={fieldCls} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
              </Field>
              <Field label="Texto de apoyo (opcional)">
                <textarea value={slide.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} maxLength={240} rows={2}
                  className={cn(fieldCls, 'h-auto py-2')} />
              </Field>
            </>
          )}
        </>
      )}

      {slide.type === 'PRODUCTS' && (
        <>
          <Field label="Título de la slide">
            <input className={fieldCls} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} placeholder="Los más vendidos" />
          </Field>
          <Field
            label="Productos"
            hint={slide.productIds.length === 0
              ? 'Ahora es automática: muestra los más vendidos que tienen foto. Elige productos para fijar tú la selección.'
              : 'Selección manual. Quita todos los productos para volver al modo automático.'}
          >
            {slide.productIds.length === 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-table">
                <span className="text-ink-muted">Bloque de más vendidos:</span>
                <Segmented size="sm" className="inline-flex" ariaLabel="Bloque de más vendidos" value={String(slide.autoPage)}
                  onChange={(page) => onChange({ autoPage: Number(page) })}
                  options={[0, 1, 2].map((page) => [String(page), `Top ${page * 8 + 1}–${page * 8 + 8}`] as const)} />
              </div>
            )}
            <ProductPicker
              selected={slide.products}
              onChange={(products) => onChange({ products, productIds: products.map((p) => p.id) })}
            />
          </Field>
        </>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-ctl bg-surface px-3 py-2.5 shadow-[0_0_0_1px_hsl(var(--line))]">
        <input type="checkbox" checked={slide.showFooter} onChange={(e) => onChange({ showFooter: e.target.checked })}
          className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
        <span>
          <span className="block text-table font-medium">Mostrar la barra inferior (dirección y QR)</span>
          <span className="block text-meta text-ink-muted">
            Desmárcala para que esta slide ocupe toda la pantalla, sin la franja azul.
          </span>
        </span>
      </label>

      {showSchedule && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mostrar desde (opcional)">
            <input className={fieldCls} type="datetime-local" value={slide.startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} />
          </Field>
          <Field label="Mostrar hasta (opcional)" hint="Pasada esta fecha la slide se oculta sola.">
            <input className={fieldCls} type="datetime-local" value={slide.endsAt} onChange={(e) => onChange({ endsAt: e.target.value })} />
          </Field>
        </div>
      )}

      {(slide.startsAt || slide.endsAt) && showSchedule && (
        <Btn variant="ghost" size="sm" className="self-start" onClick={() => onChange({ startsAt: '', endsAt: '' })}>Quitar horario</Btn>
      )}
    </div>
  );
}
