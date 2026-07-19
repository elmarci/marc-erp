import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Save, Image, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';

const schema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(200),
  barcode: z.string().optional(),
  internalCode: z.string().optional(),
  categoryId: z.string().uuid('Categoría requerida'),
  unitOfMeasure: z.string().default('UNIT'),
  costPrice: z.coerce.number().min(0, 'Costo requerido'),
  salePrice: z.coerce.number().min(0, 'Precio requerido'),
  minStock: z.coerce.number().int().min(0).default(0),
  currentStock: z.coerce.number().int().min(0).default(0),
  description: z.string().optional(),
  isBulk: z.boolean().default(false),
  bulkUnit: z.string().optional(),
  imageUrl: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string }> }>('/products/categories');
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

  // Cargar valores del producto incluyendo isBulk/bulkUnit
  useEffect(() => {
    if (product) {
      const p = product as unknown as Record<string, unknown>;
      reset({
        ...(product as unknown as FormData),
        isBulk: Boolean(p['isBulk']),
        bulkUnit: (p['bulkUnit'] as string) ?? '',
      });
    }
  }, [product, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      isEdit ? api.patch(`/products/${id}`, data) : api.post('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      toast.success(isEdit ? 'Producto actualizado.' : 'Producto creado.');
      navigate('/products');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{isEdit ? 'Editar Producto' : 'Nuevo Producto'}</h1>
      </div>

      <form
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        onKeyDown={(e) => {
          // Un lector de código de barras "escribe" el código y envía Enter.
          // Sin esto, Enter en cualquier campo (ej. código de barras) enviaría
          // el formulario antes de terminar de editar los demás campos.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault();
          }
        }}
      >
        <Card>
          <CardHeader><CardTitle>Información del Producto</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Imagen del producto</label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden shrink-0">
                  {watch('imageUrl') ? (
                    <img src={watch('imageUrl')} alt="Producto" className="h-full w-full object-cover" />
                  ) : (
                    <Image className="h-6 w-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) imageUploadMutation.mutate(file);
                      e.target.value = '';
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" loading={imageUploadMutation.isPending}
                    onClick={() => imageInputRef.current?.click()}>
                    <Upload className="mr-1.5 h-4 w-4" />{watch('imageUrl') ? 'Cambiar' : 'Subir imagen'}
                  </Button>
                  {watch('imageUrl') && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue('imageUrl', '')}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Nombre *</label>
              <Input {...register('name')} error={errors.name?.message} placeholder="Ej: Coca-Cola 500ml" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Código de Barras</label>
                <Input {...register('barcode')} placeholder="7750381001450" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Código Interno</label>
                <Input {...register('internalCode')} placeholder="PROD0001" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Categoría *</label>
              <select {...register('categoryId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Seleccione...</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.categoryId && <p className="mt-1 text-xs text-destructive">{errors.categoryId.message}</p>}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Precio Costo *</label>
                <Input {...register('costPrice')} type="number" step="0.01" min="0" error={errors.costPrice?.message} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Precio Venta *</label>
                <Input {...register('salePrice')} type="number" step="0.01" min="0" error={errors.salePrice?.message} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Stock Mínimo</label>
                <Input {...register('minStock')} type="number" min="0" />
              </div>
            </div>
            {!isEdit && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Stock Inicial</label>
                <Input {...register('currentStock')} type="number" min="0" />
              </div>
            )}

            {/* Producto a granel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isBulk" {...register('isBulk')}
                  className="h-4 w-4 rounded border-input" />
                <div>
                  <label htmlFor="isBulk" className="text-sm font-medium cursor-pointer">Producto a granel / peso variable</label>
                  <p className="text-xs text-muted-foreground">Arroz, azúcar, huevo, aceite a granel, etc. El cajero ingresa el peso/cantidad libremente.</p>
                </div>
              </div>
              {watch('isBulk') && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Unidad de venta</label>
                  <select {...register('bulkUnit')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="kg">kg (kilogramo)</option>
                    <option value="g">g (gramo)</option>
                    <option value="L">L (litro)</option>
                    <option value="ml">ml (mililitro)</option>
                    <option value="unidad">unidad (docena, manojo...)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">El precio de venta es por esta unidad. Ej: S/ 3.50 / kg</p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Descripción</label>
              <textarea {...register('description')} rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/products')}>Cancelar</Button>
              <Button type="submit" loading={mutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {isEdit ? 'Guardar Cambios' : 'Crear Producto'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
