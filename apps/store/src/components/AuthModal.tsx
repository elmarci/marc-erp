import { useState } from 'react'
import { X, Eye, EyeOff, Phone, Lock, User, ArrowRight } from 'lucide-react'
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
  const { setAuth } = useAuthStore()

  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const loginMutation = useMutation({
    mutationFn: () => api.post<{ data: { customer: { id: string; name: string; phone: string; email: string | null }; token: string } }>(
      '/store/auth/login', { identifier: form.phone || form.email, password: form.password }
    ),
    onSuccess: (res) => {
      setAuth(res.data.data.customer, res.data.data.token)
      toast.success(`¡Bienvenido de vuelta, ${res.data.data.customer.name}!`)
      onClose()
    },
    onError: () => toast.error('Teléfono o contraseña incorrectos.'),
  })

  const registerMutation = useMutation({
    mutationFn: () => api.post<{ data: { customer: { id: string; name: string; phone: string; email: string | null }; token: string } }>(
      '/store/auth/register', { name: form.name, phone: form.phone, email: form.email || undefined, password: form.password }
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white border border-paper-line rounded-3xl shadow-2xl overflow-hidden slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-paper-line">
          <div>
            <h2 className="font-bold text-paper-ink text-lg">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </h2>
            <p className="text-paper-ink-ghost text-xs mt-0.5">
              {mode === 'login' ? 'Accede a tus pedidos y preferencias' : 'Regístrate para mejores beneficios'}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 bg-paper-surface hover:bg-paper-line rounded-full flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-paper-ink-soft" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
              <input value={form.name} onChange={set('name')} placeholder="Tu nombre completo"
                className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
            </div>
          )}

          <div className="relative">
            <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
            <input value={form.phone} onChange={set('phone')} placeholder="Teléfono (987 654 321)" type="tel"
              className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
          </div>

          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
            <input value={form.password} onChange={set('password')} placeholder="Contraseña"
              type={showPass ? 'text' : 'password'}
              className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-10 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
            <button onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-3.5 text-paper-ink-ghost hover:text-paper-ink-soft">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            disabled={isLoading}
            onClick={() => mode === 'login' ? loginMutation.mutate() : registerMutation.mutate()}
            className="w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors">
            {isLoading
              ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}<ArrowRight className="h-4 w-4" /></>
            }
          </button>

          <div className="flex items-center gap-3 text-xs text-paper-ink-ghost">
            <div className="flex-1 h-px bg-paper-line" />o<div className="flex-1 h-px bg-paper-line" />
          </div>

          <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
            className="w-full py-2.5 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
            {mode === 'login' ? '¿Sin cuenta? Regístrate gratis' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>

          <button onClick={onClose} className="w-full text-xs text-paper-ink-ghost hover:text-paper-ink-soft py-1 transition-colors">
            Continuar como invitado →
          </button>
        </div>
      </div>
    </div>
  )
}
