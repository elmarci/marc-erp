import { useState, useRef } from 'react'
import { Eye, EyeOff, Phone, Lock, User, Mail, ArrowLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { api, storeApi } from '../api'
import { useAuthStore } from '../authStore'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

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
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  // Google sólo confirma el email — nunca asumimos nombre ni teléfono desde
  // el perfil de Google. Si la cuenta es nueva, el backend responde
  // "NEEDS_PROFILE" y pedimos acá esos datos (en blanco, sin autocompletar)
  // antes de reintentar con el mismo token.
  const pendingGoogleToken = useRef<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [googleName, setGoogleName] = useState('')
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
    mutationFn: (data: { phone?: string; name?: string }) => storeApi.loginWithGoogle(pendingGoogleToken.current!, data.phone, data.name),
    onSuccess: (res) => { setNeedsProfile(false); setAuth(res.data.data.customer, res.data.data.token); toast.success(`¡Bienvenido, ${res.data.data.customer.name}!`) },
    onError: (err) => {
      const msg = errorMessage(err, 'No se pudo ingresar con Google.')
      if (msg === 'NEEDS_PROFILE') { setNeedsProfile(true); return }
      toast.error(msg)
    },
  })

  const handleGoogleSuccess = (cred: CredentialResponse) => {
    if (!cred.credential) return
    pendingGoogleToken.current = cred.credential
    setNeedsProfile(false)
    googleMutation.mutate({})
  }

  const isLoading = loginMutation.isPending || registerMutation.isPending || googleMutation.isPending

  return (
    <div className="min-h-screen bg-paper-bg flex flex-col items-center px-4 pb-8">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-1 h-12 text-sm font-bold text-brand-blue-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a la tienda
        </Link>
        <div className="flex flex-col items-center mb-5 mt-2">
          <img src="/logo-icon.png" alt="Tiendas Marc" width={64} height={64} className="h-16 w-16 rounded-full mb-3" />
          <h1 className="text-2xl font-extrabold text-paper-ink text-center">
            {needsProfile ? 'Un paso más' : mode === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}
          </h1>
          <p className="text-paper-ink-soft text-base text-center mt-1">
            {needsProfile
              ? 'Cuéntanos cómo te llamas y tu WhatsApp para coordinar tus pedidos'
              : mode === 'login' ? 'Para ver tus pedidos, tus puntos y tus direcciones' : 'Guarda tus direcciones y suma puntos en cada compra'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="p-4 space-y-3">
            {needsProfile ? (
              <>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                  <input autoFocus value={googleName} onChange={e => setGoogleName(e.target.value)} placeholder="Tu nombre completo"
                    className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-4 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                  <input value={googlePhone} onChange={e => setGooglePhone(e.target.value)} placeholder="Celular (987 654 321)" type="tel" inputMode="numeric" autoComplete="tel-national"
                    className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-4 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                </div>
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (googleName.trim().length < 2) { toast.error('Ingresa tu nombre'); return }
                    if (googlePhone.trim().length < 9) { toast.error('Ingresa un número válido'); return }
                    googleMutation.mutate({ phone: googlePhone.trim(), name: googleName.trim() })
                  }}
                  className="w-full h-12 bg-brand-blue-600 active:bg-brand-blue-700 disabled:opacity-60 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2">
                  {isLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Continuar</>}
                </button>
                <button onClick={() => { setNeedsProfile(false); pendingGoogleToken.current = null }}
                  className="w-full h-11 text-sm font-bold text-paper-ink-soft">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {mode === 'register' && (
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                    <input value={form.name} onChange={set('name')} placeholder="Tu nombre completo"
                      className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-4 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                  </div>
                )}

                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                  <input value={form.phone} onChange={set('phone')} placeholder="Celular (987 654 321)" type="tel" inputMode="numeric" autoComplete="tel-national"
                    className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-4 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                </div>

                {mode === 'register' && (
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                    <input value={form.email} onChange={set('email')} placeholder="Correo (opcional)" type="email"
                      className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-4 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                  </div>
                )}

                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-paper-ink-soft" />
                  <input value={form.password} onChange={set('password')} placeholder="Contraseña" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    type={showPass ? 'text' : 'password'}
                    className="w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl pl-11 pr-12 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none" />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-0.5 top-0.5 h-11 w-11 flex items-center justify-center text-paper-ink-soft">
                    {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                  className="w-full h-12 bg-brand-blue-600 active:bg-brand-blue-700 disabled:opacity-60 text-white font-bold text-base rounded-xl flex items-center justify-center gap-2">
                  {isLoading
                    ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</>
                  }
                </button>

                {GOOGLE_CLIENT_ID && (
                  <>
                    <div className="flex items-center gap-3 text-sm text-paper-ink-soft">
                      <div className="flex-1 h-px bg-paper-line" />o<div className="flex-1 h-px bg-paper-line" />
                    </div>
                    <div className="flex justify-center">
                      <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => toast.error('No se pudo ingresar con Google.')}
                        text={mode === 'login' ? 'signin_with' : 'signup_with'} width="300" />
                    </div>
                  </>
                )}

                <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
                  className="w-full h-12 border-2 border-brand-blue-600 rounded-xl text-base font-bold text-brand-blue-600">
                  {mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
                </button>

                <Link to="/" className="flex items-center justify-center w-full h-11 text-sm font-bold text-brand-blue-600">
                  Seguir comprando sin cuenta
                </Link>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-paper-ink-soft mt-5">Al continuar aceptas nuestros</p>
        <p className="flex justify-center gap-x-5 text-sm text-paper-ink-soft">
          <Link to="/terminos" className="underline py-3">Términos y condiciones</Link>
          <Link to="/privacidad" className="underline py-3">Política de privacidad</Link>
        </p>
      </div>
    </div>
  )
}
