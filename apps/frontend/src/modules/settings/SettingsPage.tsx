import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { useState } from 'react';

interface Setting { key: string; value: string; label: string; group: string }

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

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

  const businessSettings = settings?.filter((s) => s.group === 'business') ?? [];

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Configuración</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Datos del Negocio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
