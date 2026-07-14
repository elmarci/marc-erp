import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Image, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage, API_ORIGIN } from '@/services/api';
import { useRef, useState } from 'react';

interface Setting { key: string; value: string; label: string; group: string }

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const businessSettings = settings?.filter((s) => s.group === 'business' && s.key !== 'business_logo_url') ?? [];
  const logoUrl = settings?.find((s) => s.key === 'business_logo_url')?.value;
  const logoSrc = logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${API_ORIGIN}${logoUrl}`) : null;

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
