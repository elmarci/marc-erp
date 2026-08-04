import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Image, Trash2, Upload, Video, Film } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage, API_ORIGIN } from '@/services/api';
import { useRef, useState } from 'react';

interface Setting { key: string; value: string; label: string; group: string; type: string }

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroVideoInputRef = useRef<HTMLInputElement>(null);
  const heroPosterInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<{ data: Setting[] }>('/settings');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => api.patch('/settings', { updates }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Configuración guardada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return api.post('/settings/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Logo actualizado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Logo eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Video de portada de la tienda online — se sube a un endpoint genérico que
  // solo devuelve la URL; guardarla como configuración es un segundo paso
  // (mismo patrón que subir una imagen de producto y luego asignarla).
  const heroVideoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('video', file);
      const res = await api.post<{ data: { videoUrl: string } }>('/settings/upload-video', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return api.patch('/settings', { updates: { store_hero_video_url: res.data.data.videoUrl } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Video de portada actualizado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const heroPosterMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post<{ data: { imageUrl: string } }>('/products/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return api.patch('/settings', { updates: { store_hero_poster_url: res.data.data.imageUrl } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Imagen de portada actualizada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeHeroVideoMutation = useMutation({
    mutationFn: () => api.patch('/settings', { updates: { store_hero_video_url: '' } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Video de portada quitado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const businessSettings = settings?.filter((s) => s.group === 'business' && s.key !== 'business_logo_url' && s.key !== 'business_logo_print_url') ?? [];
  const couponSettings = settings?.filter((s) => s.group === 'coupons') ?? [];
  const loyaltySettings = settings?.filter((s) => s.group === 'loyalty') ?? [];
  const receiptSettings = settings?.filter((s) => s.group === 'receipts') ?? [];
  const logoUrl = settings?.find((s) => s.key === 'business_logo_url')?.value;
  const logoSrc = logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${API_ORIGIN}${logoUrl}`) : null;
  const heroVideoUrl = settings?.find((s) => s.key === 'store_hero_video_url')?.value;
  const heroVideoSrc = heroVideoUrl ? (heroVideoUrl.startsWith('http') ? heroVideoUrl : `${API_ORIGIN}${heroVideoUrl}`) : null;
  const heroPosterUrl = settings?.find((s) => s.key === 'store_hero_poster_url')?.value;
  const heroPosterSrc = heroPosterUrl ? (heroPosterUrl.startsWith('http') ? heroPosterUrl : `${API_ORIGIN}${heroPosterUrl}`) : null;

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Configuración</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Datos del Negocio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Logo (aparece en el ticket de venta)</label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden">
                {logoSrc ? (
                  <img src={logoSrc} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Image className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) logoMutation.mutate(file);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" loading={logoMutation.isPending}
                  onClick={() => logoInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" />{logoSrc ? 'Cambiar' : 'Subir logo'}
                </Button>
                {logoSrc && (
                  <Button type="button" variant="ghost" size="sm" loading={deleteLogoMutation.isPending}
                    onClick={() => deleteLogoMutation.mutate()}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">Cargando...</div>
          ) : businessSettings.map((s) => (
            <div key={s.key}>
              <label className="mb-1.5 block text-sm font-medium">{s.label}</label>
              <Input
                defaultValue={s.value}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => updateMutation.mutate(values)} loading={updateMutation.isPending}
              disabled={Object.keys(values).length === 0}>
              <Save className="mr-2 h-4 w-4" />Guardar Cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portada de la Tienda Online</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Video corto (MP4/WEBM, máx. 25MB) que se reproduce de fondo en el inicio de la tienda. Si no
            hay video, se usa la imagen de portada como respaldo mientras carga o si el navegador no la soporta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Video de portada</label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-36 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden shrink-0">
                {heroVideoSrc ? (
                  <video src={heroVideoSrc} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                ) : (
                  <Film className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={heroVideoInputRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) heroVideoMutation.mutate(file);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" loading={heroVideoMutation.isPending}
                  onClick={() => heroVideoInputRef.current?.click()}>
                  <Video className="mr-1.5 h-4 w-4" />{heroVideoSrc ? 'Cambiar' : 'Subir video'}
                </Button>
                {heroVideoSrc && (
                  <Button type="button" variant="ghost" size="sm" loading={removeHeroVideoMutation.isPending}
                    onClick={() => removeHeroVideoMutation.mutate()}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Imagen de respaldo</label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-36 items-center justify-center rounded-lg border border-dashed bg-muted overflow-hidden shrink-0">
                {heroPosterSrc ? (
                  <img src={heroPosterSrc} alt="Portada" className="h-full w-full object-cover" />
                ) : (
                  <Image className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={heroPosterInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) heroPosterMutation.mutate(file);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" loading={heroPosterMutation.isPending}
                  onClick={() => heroPosterInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" />{heroPosterSrc ? 'Cambiar' : 'Subir imagen'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cupones de Descuento</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Cuando una venta con cliente asignado supera el monto mínimo, se genera e imprime
            automáticamente un cupón de descuento % para la próxima compra de ese cliente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">Cargando...</div>
          ) : couponSettings.map((s) => (
            <div key={s.key}>
              <label className="mb-1.5 block text-sm font-medium">{s.label}</label>
              <Input
                type="number"
                defaultValue={s.value}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => updateMutation.mutate(values)} loading={updateMutation.isPending}
              disabled={Object.keys(values).length === 0}>
              <Save className="mr-2 h-4 w-4" />Guardar Cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Puntos de Fidelización</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Los clientes ganan puntos en cada compra con cliente asignado, canjeables por descuento
            en una compra futura (excluyente con los cupones — solo uno de los dos por venta).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">Cargando...</div>
          ) : loyaltySettings.map((s) => (
            <div key={s.key}>
              <label className="mb-1.5 block text-sm font-medium">{s.label}</label>
              <Input
                type="number" step="0.01"
                defaultValue={s.value}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => updateMutation.mutate(values)} loading={updateMutation.isPending}
              disabled={Object.keys(values).length === 0}>
              <Save className="mr-2 h-4 w-4" />Guardar Cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ticket de Venta</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Qué información se imprime en el ticket que recibe el cliente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">Cargando...</div>
          ) : receiptSettings.map((s) =>
            s.type === 'boolean' ? (
              <label key={s.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  defaultChecked={s.value === 'true'}
                  onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.checked ? 'true' : 'false' }))}
                />
                <span className="text-sm font-medium">{s.label}</span>
              </label>
            ) : (
              <div key={s.key}>
                <label className="mb-1.5 block text-sm font-medium">{s.label}</label>
                <Input
                  defaultValue={s.value}
                  onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                />
              </div>
            ),
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => updateMutation.mutate(values)} loading={updateMutation.isPending}
              disabled={Object.keys(values).length === 0}>
              <Save className="mr-2 h-4 w-4" />Guardar Cambios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Credenciales de Acceso</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para cambiar su contraseña, use la opción en el menú de usuario en la esquina superior derecha.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
