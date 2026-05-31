import { useState } from 'react'
import { X, Eye, EyeOff, Phone, Lock, User, Mail, ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useAuthStore } from '../authStore'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
  initialMode?: 'login' | 'register'
}

export function AuthModal({ onClose, initialMode = 'login' }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [showPass, setShowPass] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)

  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '', confirmPassword: ''
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const loginMutation = useMutation({
    mutationFn: () => api.post<{ data: { customer: { id: string; name: string; phone: string; email: string | null }; token: string } }>(
      '/store/auth/login', { identifier: form.phone || form.email, password: form.password }
    ),
    onSuccess: (res) => {
      setAuth(res.data.data.customer, res.data.data.token)
      toast.success(`¡Bienvenido, ${res.data.data.customer.name}!`)
      onClose()
    },
    onError: () => toast.error('Teléfono/correo o contraseña incorrectos.'),
  })

  const registerMutation = useMutation({
    mutationFn: () => api.post<{ data: { customer: { id: string; name: string; phone: string; email: string | null }; token: string } }>(
      '/store/auth/register', {
        name: form.name, phone: form.phone,
        email: form.email || undefined, password: form.password,
      }
    ),
    onSuccess: (res) => {
      setAuth(res.data.data.customer, res.data.data.token)
      toast.success(`¡Cuenta creada! Bienvenido, ${res.data.data.customer.name} 🎉`)
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      toast.error(msg ?? 'Error al crear la cuenta.')
    },
  })

  const isLoading = loginMutation.isPending || registerMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden slide-up">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-orange to-orange-dark p-6 text-white">
          <button onClick={onClose} className="absolute right-4 top-4 h-8 w-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30">
            <X className="h-4 w-4" />
          </button>
          <div className="text-2xl font-black mb-1">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </div>
          <p className="text-orange-pale/80 text-sm">
            {mode === 'login' ? 'Accede a tus pedidos y preferencias' : 'Regístrate para mejores beneficios'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3 top-3.5 h-4 w-4 text-marc/40" />
              <input value={form.name} onChange={set('name')} placeholder="Tu nombre completo"
                className="w-full pl-10 pr-4 py-3 border border-[--border] rounded-xl text-sm focus:outline-none focus:border-orange transition-colors bg-bg" />
            </div>
          )}

          <div className="relative">
            <Phone className="absolute left-3 top-3.5 h-4 w-4 text-marc/40" />
            <input value={form.phone} onChange={set('phone')} placeholder="Teléfono (987 654 321)" type="tel"
              className="w-full pl-10 pr-4 py-3 border border-[--border] rounded-xl text-sm focus:outline-none focus:border-orange transition-colors bg-bg" />
          </div>

          {mode === 'register' && (
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-marc/40" />
              <input value={form.email} onChange={set('email')} placeholder="Correo (opcional)" type="email"
                className="w-full pl-10 pr-4 py-3 border border-[--border] rounded-xl text-sm focus:outline-none focus:border-orange transition-colors bg-bg" />
            </div>
          )}

          <div className="relative">
            <Lock className="absolute left-3 top-3.5 h-4 w-4 text-marc/40" />
            <input value={form.password} onChange={set('password')} placeholder="Contraseña"
              type={showPass ? 'text' : 'password'}
              className="w-full pl-10 pr-10 py-3 border border-[--border] rounded-xl text-sm focus:outline-none focus:border-orange transition-colors bg-bg" />
            <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-3.5 text-marc/30 hover:text-marc/60">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            disabled={isLoading}
            onClick={() => mode === 'login' ? loginMutation.mutate() : registerMutation.mutate()}
            className="w-full bg-orange hover:bg-orange-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-orange">
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>{mode === 'login' ? 'Ingresar' : 'Crear mi cuenta'}<ArrowRight className="h-4 w-4" /></>
            )}
          </button>

          <div className="flex items-center gap-3 text-xs text-marc/30">
            <div className="flex-1 h-px bg-[--border]" />o<div className="flex-1 h-px bg-[--border]" />
          </div>

          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="w-full py-3 border border-[--border] rounded-xl text-sm font-medium text-marc/60 hover:bg-bg transition-colors">
            {mode === 'login' ? '¿No tienes cuenta? Regístrate gratis' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>

          <button onClick={onClose} className="w-full text-xs text-marc/30 hover:text-marc/50 py-1 transition-colors">
            Continuar como invitado →
          </button>
        </div>
      </div>
    </div>
  )
}
