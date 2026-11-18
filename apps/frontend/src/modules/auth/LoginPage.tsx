import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, fieldCls, invalidCls } from '@/components/erp';
import { cn } from '@/lib/utils';
import { AuthShell } from './AuthShell';
import { api, getErrorMessage } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  login: z.string().min(1, 'Usuario o correo requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type FormData = z.infer<typeof schema>;

interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      username: string;
      firstName: string;
      lastName: string;
      role: string;
      mustChangePassword: boolean;
    };
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await api.post<LoginResponse>('/auth/login', data);
      const { accessToken, refreshToken, user } = response.data.data;
      setAuth(user, accessToken, refreshToken);
      toast.success(`Bienvenido, ${user.firstName}!`);

      if (user.mustChangePassword) {
        navigate('/change-password');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const icon = 'pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted';

  return (
    <AuthShell title="Iniciar sesión" subtitle="Sistema de gestión para tu negocio">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Field label="Usuario o correo" error={errors.login?.message}>
          <span className="relative block">
            <User className={icon} />
            <input
              {...register('login')}
              placeholder="Tu usuario o correo"
              autoComplete="username"
              autoFocus
              aria-invalid={!!errors.login}
              className={cn(fieldCls, 'pl-8', errors.login && invalidCls)}
            />
          </span>
        </Field>

        <Field label="Contraseña" error={errors.password?.message}>
          <span className="relative block">
            <Lock className={icon} />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              className={cn(fieldCls, 'px-8', errors.password && invalidCls)}
            />
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowPassword((v) => !v); }}
              className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-ctl text-ink-muted hover:text-ink"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </Field>

        <Btn type="submit" variant="primary" loading={loading} className="mt-2 w-full">
          Ingresar al sistema
        </Btn>
      </form>
    </AuthShell>
  );
}
