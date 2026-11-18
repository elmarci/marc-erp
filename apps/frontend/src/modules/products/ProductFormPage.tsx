// Crear o editar un producto: datos, precios, venta a granel o por paquete,
// vencimiento, garantía de envase e imagen.
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Save, Image, Upload, X } from 'lucide-react';
import { Btn, Field, Panel, fieldCls, invalidCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(200),
  barcode: z.string().optional(),
  internalCode: z.string().optional(),
  categoryId: z.string().uuid('Categoría requerida'),
  unitOfMeasure: z.string().default('UNIT'),
  costPrice: z.coerce.number().min(0, 'Costo requerido'),
  salePrice: z.coerce.number().min(0, 'Precio requerido'),
  minStock: z.coerce.number().min(0).default(0),
  currentStock: z.coerce.number().min(0).default(0),
  description: z.string().optional(),
  isBulk: z.boolean().default(false),
  bulkUnit: z.string().optional(),
  trackExpiry: z.boolean().default(false),
  sellsByPack: z.boolean().default(false),
  marginAlertMuted: z.boolean().default(false),
  packSize: z.coerce.number().int().optional(),
  packPrice: z.coerce.number().optional(),
  packLabel: z.string().optional(),
  packBarcode: z.string().optional(),
  bottleDeposit: z.coerce.number().min(0).default(0),
  imageUrl: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CategoryOption {
  id: string; name: string; requiresExpiry?: boolean;
  children?: Array<{ id: string; name: string; requiresExpiry?: boolean }>;
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<{ data: CategoryOption[] }>('/products/categories');
      return res.data.data;
    },
  });

  const { data: product } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get<{ data: FormData & { id: string } }>(`/products/${id}`);
      return res.data.data;
    },
    enabled: isEdit,
  });

  const imageInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const imageUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('image', file);
      return api.post<{ data: { imageUrl: string } }>('/products/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => setValue('imageUrl', res.data.data.imageUrl),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Solo se cargan los campos que este formulario realmente gestiona — antes
  // se copiaba el producto completo tal cual venía de la API, así que campos
  // que no están en este form (sku, brandId, supplierId, taxRateId...)
  // viajaban de vuelta como `null` en el guardado y el backend los rechazaba
  // (por eso a veces "no dejaba editar" salvo que algún otro campo, como la
  // imagen, tapara el error).
  useEffect(() => {
    if (product) {
      const p = product as unknown as Record<string, unknown>;
      reset({
        name: (p['name'] as string) ?? '',
        barcode: (p['barcode'] as string) ?? '',
        internalCode: (p['internalCode'] as string) ?? '',
        categoryId: (p['categoryId'] as string) ?? '',
        unitOfMeasure: (p['unitOfMeasure'] as string) ?? 'UNIT',
        costPrice: Number(p['costPrice'] ?? 0),
        salePrice: Number(p['salePrice'] ?? 0),
        minStock: Number(p['minStock'] ?? 0),
        currentStock: Number(p['currentStock'] ?? 0),
        description: (p['description'] as string) ?? '',
        isBulk: Boolean(p['isBulk']),
        bulkUnit: (p['bulkUnit'] as string) ?? '',
        trackExpiry: Boolean(p['trackExpiry']),
        marginAlertMuted: Boolean(p['marginAlertMuted']),
        sellsByPack: p['packSize'] != null && p['packPrice'] != null,
        packSize: p['packSize'] != null ? Number(p['packSize']) : undefined,
        packPrice: p['packPrice'] != null ? Number(p['packPrice']) : undefined,
        packLabel: (p['packLabel'] as string) ?? '',
        packBarcode: (p['packBarcode'] as string) ?? '',
        bottleDeposit: Number(p['bottleDeposit'] ?? 0),
        imageUrl: (p['imageUrl'] as string) ?? '',
      });
    }
  }, [product, reset]);

  // Lácteos, panadería, carnes y embutidos: el vencimiento no es opcional.
  const selectedCategoryId = watch('categoryId');
  const expiryForced = !!categories?.some((c) =>
    (c.id === selectedCategoryId && c.requiresExpiry)
    || c.children?.some((ch) => ch.id === selectedCategoryId && (ch.requiresExpiry || c.requiresExpiry)));
  useEffect(() => {
    if (expiryForced) setValue('trackExpiry', true);
  }, [expiryForced, setValue]);

  const sellsByPack = watch('sellsByPack');
  const packSizeNum = Number(watch('packSize') ?? 0);
  const packPriceNum = Number(watch('packPrice') ?? 0);
  const unitPriceNum = Number(watch('salePrice') ?? 0);
  const packSavings = sellsByPack && packSizeNum >= 2 && packPriceNum > 0
    ? Math.round((unitPriceNum * packSizeNum - packPriceNum) * 100) / 100
    : null;

  const mutation = useMutation({
    mutationFn: ({ sellsByPack: byPack, ...data }: FormData) => {
      // Sin paquete se mandan null: así editar un producto puede quitarle el
      // paquete que tenía, en vez de dejarlo como estaba.
      const payload = {
        ...data,
        packSize: byPack ? data.packSize : null,
        packPrice: byPack ? data.packPrice : null,
        packLabel: byPack ? (data.packLabel?.trim() || null) : null,
        packBarcode: byPack ? (data.packBarcode?.trim() || null) : null,
      };
      return isEdit ? api.patch(`/products/${id}`, payload) : api.post('/products', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      toast.success(isEdit ? 'Producto actualizado.' : 'Producto creado.');
      // Vuelve a la página/filtros de donde vino (navigate(-1)) en vez de
      // resetear siempre a /products — así no se pierde la página en la que
      // estaba el cajero/admin al editar un producto en medio de una lista larga.
      navigate(-1);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isBulk = watch('isBulk');
  const imageUrl = watch('imageUrl');
  const num = (bad?: unknown) => cn(fieldCls, 'text-right tabular-nums', !!bad && invalidCls);
  const checkCls = 'mt-0.5 size-4 shrink-0 accent-[hsl(var(--brand))] disabled:opacity-60';
  const optionCls = 'flex cursor-pointer items-start gap-3 px-4 py-3';

  return (
    <div className="erp flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <Btn variant="ghost" size="sm" aria-label="Volver" onClick={() => navigate(-1)}><ArrowLeft /></Btn>
        <h1 className="text-title font-semibold tracking-tight text-ink">{isEdit ? 'Editar producto' : 'Nuevo producto'}</h1>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit((d) => {
          if (d.sellsByPack && (!d.packSize || d.packSize < 2 || !d.packPrice || d.packPrice <= 0)) {
            toast.error('Para vender por paquete indica cuántas unidades trae (mínimo 2) y su precio.');
            return;
          }
          mutation.mutate(d);
        })}
        onKeyDown={(e) => {
          // Un lector de código de barras "escribe" el código y envía Enter.
          // Sin esto, Enter en cualquier campo enviaría el formulario antes
          // de terminar de editar los demás campos.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault();
          }
        }}
      >
        <Panel title="Datos del producto" bodyClassName="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-ctl bg-ink/[0.04] shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]">
              {imageUrl ? <img src={imageUrl} alt="Producto" className="size-full object-cover" /> : <Image className="size-6 text-ink-muted/50" />}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-table font-medium text-ink">Imagen del producto</span>
              <div className="flex gap-1.5">
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) imageUploadMutation.mutate(file);
                    e.target.value = '';
                  }} />
                <Btn size="sm" loading={imageUploadMutation.isPending} onClick={() => imageInputRef.current?.click()}>
                  <Upload />{imageUrl ? 'Cambiar' : 'Subir imagen'}
                </Btn>
                {imageUrl && <Btn size="sm" variant="ghost" aria-label="Quitar imagen" onClick={() => setValue('imageUrl', '')}><X /></Btn>}
              </div>
            </div>
          </div>
          <Field label="Nombre" required error={errors.name?.message}>
            <input {...register('name')} className={cn(fieldCls, errors.name && invalidCls)} placeholder="Ej: Coca-Cola 500ml" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código de barras">
              <input {...register('barcode')} className={cn(fieldCls, 'font-mono')} placeholder="7750381001450" />
            </Field>
            <Field label="Código interno">
              {isEdit ? <input {...register('internalCode')} className={cn(fieldCls, 'font-mono')} placeholder="PRO001" />
                : <div className="flex h-9 items-center rounded-ctl bg-surface-2 px-2.5 text-table text-ink-muted">Se asignará automáticamente (PROxxx)</div>}
            </Field>
          </div>
          <Field label="Categoría" required error={errors.categoryId?.message}>
            <select {...register('categoryId')} className={cn(fieldCls, errors.categoryId && invalidCls)}>
              <option value="">Seleccione…</option>
              {categories?.map((c) => (
                c.children && c.children.length > 0 ? (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name} (general)</option>
                    {c.children.map((ch) => <option key={ch.id} value={ch.id}>— {ch.name}</option>)}
                  </optgroup>
                ) : (
                  <option key={c.id} value={c.id}>{c.name}</option>
                )
              ))}
            </select>
          </Field>
          <Field label="Descripción">
            <textarea {...register('description')} rows={3} className={cn(fieldCls, 'h-auto resize-none py-2')} />
          </Field>
        </Panel>

        <Panel title="Precio y stock" bodyClassName="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Precio costo" required error={errors.costPrice?.message}>
              <input {...register('costPrice')} type="number" step="0.0001" min="0" className={num(errors.costPrice)} />
            </Field>
            <Field label="Precio venta" required error={errors.salePrice?.message}>
              <input {...register('salePrice')} type="number" step="0.01" min="0" className={num(errors.salePrice)} />
            </Field>
            <Field label="Stock mínimo">
              <input {...register('minStock')} type="number" step={isBulk ? '0.01' : '1'} min="0" className={num()} />
            </Field>
            {!isEdit && (
              <Field label="Stock inicial">
                <input {...register('currentStock')} type="number" step={isBulk ? '0.01' : '1'} min="0" className={num()} />
              </Field>
            )}
          </div>
          <Field label="Garantía de envase (S/)"
            hint="Si el cliente no trae su botella vacía, se le cobra esto aparte de la venta (no es ingreso, se le devuelve cuando la traiga). Déjalo en 0 si no maneja envase retornable.">
            <input {...register('bottleDeposit')} type="number" step="0.10" min="0" className={cn(num(), 'sm:max-w-[200px]')} />
          </Field>
        </Panel>

        <Panel title="Cómo se vende y se controla" bodyClassName="divide-y divide-line">
          <div>
            <label className={optionCls}>
              <input type="checkbox" {...register('isBulk')} className={checkCls} />
              <span>
                <span className="block text-table font-medium text-ink">Producto a granel / peso variable</span>
                <span className="block text-meta text-ink-muted">Arroz, azúcar, huevo, aceite a granel, etc. El cajero ingresa el peso/cantidad libremente.</span>
              </span>
            </label>
            {isBulk && (
              <div className="px-4 pb-3 pl-11">
                <Field label="Unidad de venta" hint="El precio de venta es por esta unidad. Ej: S/ 3.50 / kg" className="sm:max-w-xs">
                  <select {...register('bulkUnit')} className={fieldCls}>
                    <option value="kg">kg (kilogramo)</option>
                    <option value="g">g (gramo)</option>
                    <option value="L">L (litro)</option>
                    <option value="ml">ml (mililitro)</option>
                    <option value="unidad">unidad (docena, manojo...)</option>
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div>
            <label className={cn(optionCls, isBulk && 'cursor-not-allowed opacity-70')}>
              <input type="checkbox" {...register('sellsByPack')} disabled={isBulk} className={checkCls} />
              <span>
                <span className="block text-table font-medium text-ink">También se vende por paquete / caja</span>
                <span className="block text-meta text-ink-muted">
                  Cigarros, chicles, galletas por caja... El precio de arriba es el de la unidad; aquí defines el paquete.
                  En el punto de venta el cajero elige unidad o paquete con un toque, y el stock baja las unidades que trae el paquete.
                </span>
              </span>
            </label>
            {sellsByPack && !isBulk && (
              <div className="grid grid-cols-2 gap-3 px-4 pb-3 pl-11 sm:grid-cols-4">
                <Field label="Unidades por paquete" required><input {...register('packSize')} type="number" step="1" min="2" placeholder="Ej: 20" className={num()} /></Field>
                <Field label="Precio del paquete" required><input {...register('packPrice')} type="number" step="0.01" min="0" placeholder="Ej: 20.00" className={num()} /></Field>
                <Field label="Se llama"><input {...register('packLabel')} placeholder="Paquete, Caja, Cartón..." className={fieldCls} /></Field>
                <Field label="Código del paquete"><input {...register('packBarcode')} placeholder="Opcional" className={cn(fieldCls, 'font-mono')} /></Field>
                <p className="col-span-2 text-meta text-ink-muted sm:col-span-4">
                  Al escanear el código del paquete en el POS se agrega el paquete. Si el código del producto es el que viene impreso en el paquete, escríbelo aquí también.
                </p>
                {packSavings !== null && (
                  <p className="col-span-2 text-meta text-ink sm:col-span-4">
                    {packSavings > 0
                      ? `Comprar el paquete sale S/ ${packSavings.toFixed(2)} más barato que ${packSizeNum} unidades sueltas (S/ ${(unitPriceNum * packSizeNum).toFixed(2)}).`
                      : packSavings < 0
                        ? `Ojo: el paquete sale S/ ${Math.abs(packSavings).toFixed(2)} más caro que ${packSizeNum} unidades sueltas.`
                        : 'El paquete cuesta lo mismo que las unidades sueltas.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <label className={optionCls}>
            <input type="checkbox" {...register('trackExpiry')} disabled={expiryForced} className={checkCls} />
            <span>
              <span className="block text-table font-medium text-ink">Controla fecha de vencimiento</span>
              <span className="block text-meta text-ink-muted">
                {expiryForced
                  ? 'Obligatorio en esta categoría: no se puede recibir una compra de este producto sin fecha de vencimiento.'
                  : 'Lácteos, embutidos y similares. Al recibir compras de este producto se pedirá la fecha de vencimiento (obligatoria), y aparecerá en Inventario, Vencimientos, antes de que se venza.'}
              </span>
            </span>
          </label>

          {isEdit && (
            <label className={optionCls}>
              <input type="checkbox" {...register('marginAlertMuted')} className={checkCls} />
              <span>
                <span className="block text-table font-medium text-ink">No avisar margen bajo de este producto</span>
                <span className="block text-meta text-ink-muted">
                  En frutas, verduras y productos por kg el sistema avisa si el último costo de compra deja poco margen.
                  Actívalo solo si vendes barato a propósito o el costo de compra está en otra unidad que la de venta.
                </span>
              </span>
            </label>
          )}
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 bg-canvas/90 px-1 py-3 backdrop-blur">
          <Btn onClick={() => navigate(-1)}>Cancelar</Btn>
          <Btn type="submit" variant="primary" loading={mutation.isPending}><Save />{isEdit ? 'Guardar cambios' : 'Crear producto'}</Btn>
        </div>
      </form>
    </div>
  );
}
