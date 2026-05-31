import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, User, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <ShoppingCart className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-white">ERP Minimarket</h1>
          <p className="mt-1 text-sm text-slate-400">Sistema de gestión para tu negocio</p>
        </div>

        {/* Formulario */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 shadow-2xl backdrop-blur-sm">
          <h2 className="mb-6 text-lg font-semibold text-white">Iniciar Sesión</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Usuario o Correo
              </label>
              <Input
                {...register('login')}
                placeholder="admin o admin@minimarket.com"
                autoComplete="username"
                autoFocus
                error={errors.login?.message}
                startIcon={<User className="h-4 w-4" />}
                className="border-slate-600 bg-slate-700/50 text-white placeholder:text-slate-500 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Contraseña
              </label>
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message}
                startIcon={<Lock className="h-4 w-4" />}
                endIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                className="border-slate-600 bg-slate-700/50 text-white placeholder:text-slate-500 focus-visible:ring-primary"
              />
            </div>

            <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
              Ingresar al Sistema
            </Button>
          </form>

          <div className="mt-6 rounded-lg bg-slate-700/30 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300">Accesos de prueba:</p>
            <p className="mt-1">Admin: <span className="text-slate-200">admin</span> / <span className="text-slate-200">Admin123!</span></p>
            <p>Cajero: <span className="text-slate-200">cajero1</span> / <span className="text-slate-200">Cajero123!</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
