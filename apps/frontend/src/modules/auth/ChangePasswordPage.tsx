import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Debe tener mayúscula, minúscula y número'),
  confirmPassword: z.string().min(1, 'Confirme la contraseña'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { setUser, user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await api.post('/auth/change-password', data);
      if (user) setUser({ ...user, mustChangePassword: false });
      toast.success('Contraseña actualizada correctamente.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning shadow-lg">
            <ShieldCheck className="h-8 w-8 text-warning-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-white">Cambio de Contraseña</h1>
          <p className="mt-1 text-sm text-slate-400">
            Por seguridad, debe cambiar su contraseña antes de continuar.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Contraseña Actual</label>
              <Input {...register('currentPassword')} type="password" error={errors.currentPassword?.message}
                className="border-slate-600 bg-slate-700/50 text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Nueva Contraseña</label>
              <Input {...register('newPassword')} type="password" error={errors.newPassword?.message}
                className="border-slate-600 bg-slate-700/50 text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Confirmar Nueva Contraseña</label>
              <Input {...register('confirmPassword')} type="password" error={errors.confirmPassword?.message}
                className="border-slate-600 bg-slate-700/50 text-white" />
            </div>
            <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
              Cambiar Contraseña
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
