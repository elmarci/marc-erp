import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { Btn, Field, fieldCls, invalidCls } from '@/components/erp';
import { cn } from '@/lib/utils';
import { AuthShell } from './AuthShell';
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
  const { setUser, user, logout, refreshToken } = useAuthStore();
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

  // Salir sin cambiarla ahora: cierra la sesión y vuelve al login (p. ej. para
  // entrar con otra cuenta). El cambio se volverá a pedir en el próximo ingreso.
  const handleExit = async () => {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // Si falla, igual cerramos la sesión local.
    } finally {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const fields = [
    ['currentPassword', 'Contraseña actual', 'current-password'],
    ['newPassword', 'Nueva contraseña', 'new-password'],
    ['confirmPassword', 'Confirmar nueva contraseña', 'new-password'],
  ] as const;

  return (
    <AuthShell title="Cambio de contraseña" subtitle="Por seguridad, debe cambiar su contraseña antes de continuar.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {fields.map(([key, label, auto]) => (
          <Field key={key} label={label} error={errors[key]?.message}>
            <input {...register(key)} type="password" autoComplete={auto} aria-invalid={!!errors[key]}
              className={cn(fieldCls, errors[key] && invalidCls)} />
          </Field>
        ))}
        <Btn type="submit" variant="primary" loading={loading} className="mt-2 w-full">
          Cambiar contraseña
        </Btn>
      </form>
      <Btn variant="ghost" onClick={handleExit} className="mt-3 w-full text-ink-muted">
        <LogOut />Ahora no, volver al inicio de sesión
      </Btn>
    </AuthShell>
  );
}
