import { useState, useRef } from 'react'
import { Eye, EyeOff, Phone, Lock, User, Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { api, storeApi } from '../api'
import { useAuthStore } from '../authStore'
import { toast } from 'sonner'

// El botón de Google sólo se pinta si hay Client ID — sin GoogleOAuthProvider
// montado en main.tsx, <GoogleLogin> no tiene contexto y rompería el render.
const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined

type Mode = 'login' | 'register'
type AuthResult = { data: { customer: { id: string; name: string; phone: string; email: string | null }; token: string } }

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback
}

// Pantalla completa — reemplaza toda la tienda mientras no haya sesión. El
// registro es obligatorio desde que se abre la app: es lo que nos permite
// tener un perfil real por cliente (historial, puntos, direcciones) en vez
// de pedidos anónimos por WhatsApp.
export function AuthGate() {
  const [mode, setMode] = useState<Mode>('login')
  const [showPass, setShowPass] = useState(false)
  const { setAuth, continueAsGuest } = useAuthStore()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  // Google no entrega teléfono — si la cuenta es nueva, el backend responde
  // "NEEDS_PHONE" y pedimos el dato acá antes de reintentar con el mismo token.
  const pendingGoogleToken = useRef<string | null>(null)
  const [needsPhone, setNeedsPhone] = useState(false)
  const [googlePhone, setGooglePhone] = useState('')

  const loginMutation = useMutation({
    mutationFn: () => api.post<AuthResult>('/store/auth/login', { identifier: form.phone || form.email, password: form.password }),
    onSuccess: (res) => { setAuth(res.data.data.customer, res.data.data.token); toast.success(`¡Bienvenido de vuelta, ${res.data.data.customer.name}!`) },
    onError: (err) => toast.error(errorMessage(err, 'Teléfono o contraseña incorrectos.')),
  })

  const registerMutation = useMutation({
    mutationFn: () => api.post<AuthResult>('/store/auth/register', { name: form.name, phone: form.phone, email: form.email || undefined, password: form.password }),
    onSuccess: (res) => { setAuth(res.data.data.customer, res.data.data.token); toast.success(`¡Cuenta creada! Bienvenido, ${res.data.data.customer.name} 🎉`) },
    onError: (err) => toast.error(errorMessage(err, 'Error al crear la cuenta.')),
  })

  const googleMutation = useMutation({
    mutationFn: (phone?: string) => storeApi.loginWithGoogle(pendingGoogleToken.current!, phone),
    onSuccess: (res) => { setNeedsPhone(false); setAuth(res.data.data.customer, res.data.data.token); toast.success(`¡Bienvenido, ${res.data.data.customer.name}!`) },
    onError: (err) => {
      const msg = errorMessage(err, 'No se pudo ingresar con Google.')
      if (msg === 'NEEDS_PHONE') { setNeedsPhone(true); return }
      toast.error(msg)
    },
  })

  const handleGoogleSuccess = (cred: CredentialResponse) => {
    if (!cred.credential) return
    pendingGoogleToken.current = cred.credential
    setNeedsPhone(false)
    googleMutation.mutate(undefined)
  }

  const isLoading = loginMutation.isPending || registerMutation.isPending || googleMutation.isPending

  return (
    <div className="min-h-screen bg-paper-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Minimarket Marc" className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-black text-paper-ink text-center">
            {needsPhone ? 'Un paso más' : mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
          </h1>
          <p className="text-paper-ink-soft text-sm text-center mt-1">
            {needsPhone
              ? 'Necesitamos tu WhatsApp para coordinar tus pedidos'
              : 'Regístrate para comprar, ver tu historial y tus puntos'}
          </p>
        </div>

        <div className="bg-white border border-paper-line rounded-3xl shadow-xl overflow-hidden">
          <div className="p-5 space-y-3">
            {needsPhone ? (
              <>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                  <input value={googlePhone} onChange={e => setGooglePhone(e.target.value)} placeholder="Teléfono (987 654 321)" type="tel"
                    className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
                </div>
                <button
                  disabled={isLoading}
                  onClick={() => { if (googlePhone.trim().length < 9) { toast.error('Ingresa un número válido'); return } googleMutation.mutate(googlePhone.trim()) }}
                  className="w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors">
                  {isLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Continuar<ArrowRight className="h-4 w-4" /></>}
                </button>
                <button onClick={() => { setNeedsPhone(false); pendingGoogleToken.current = null }}
                  className="w-full text-xs text-paper-ink-ghost hover:text-paper-ink-soft py-1 transition-colors">
                  Cancelar
                </button>
              </>
            ) : (
              <>
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

                {mode === 'register' && (
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                    <input value={form.email} onChange={set('email')} placeholder="Email (opcional)" type="email"
                      className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
                  </div>
                )}

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
                  onClick={() => {
                    if (mode === 'register' && !form.name.trim()) { toast.error('Ingresa tu nombre'); return }
                    if (!form.phone.trim() || form.phone.length < 9) { toast.error('Ingresa un teléfono válido'); return }
                    if (!form.password || form.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return }
                    mode === 'login' ? loginMutation.mutate() : registerMutation.mutate()
                  }}
                  className="w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors">
                  {isLoading
                    ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}<ArrowRight className="h-4 w-4" /></>
                  }
                </button>

                {GOOGLE_CLIENT_ID && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-paper-ink-ghost">
                      <div className="flex-1 h-px bg-paper-line" />o<div className="flex-1 h-px bg-paper-line" />
                    </div>
                    <div className="flex justify-center">
                      <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => toast.error('No se pudo ingresar con Google.')}
                        text={mode === 'login' ? 'signin_with' : 'signup_with'} width="336" />
                    </div>
                  </>
                )}

                <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
                  className="w-full py-2.5 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
                  {mode === 'login' ? '¿Sin cuenta? Regístrate gratis' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>

                <button onClick={continueAsGuest}
                  className="w-full text-xs text-paper-ink-ghost hover:text-paper-ink-soft py-1 transition-colors">
                  Prefiero pedir por WhatsApp sin registrarme →
                </button>
              </>
            )}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-paper-ink-ghost mt-4">
          <ShieldCheck className="h-3.5 w-3.5" />Tus datos están seguros con nosotros
        </p>
      </div>
    </div>
  )
}
