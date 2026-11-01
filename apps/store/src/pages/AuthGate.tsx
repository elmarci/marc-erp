import { useState, useRef } from 'react'
import { Phone, User, Mail, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'
import { toast } from 'sonner'
import {
  errorMessage, isStrongPassword, PASSWORD_HINT, PasswordInput, CodeInput, Spinner, inputCls, primaryBtnCls,
} from '../components/AccountSecurity'

// El botón de Google sólo se pinta si hay Client ID — sin GoogleOAuthProvider
// montado en main.tsx, <GoogleLogin> no tiene contexto y rompería el render.
const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const isValidMobile = (v: string) => /^9\d{8}$/.test(v.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, ''))
const isValidEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim())

// Pantalla completa — reemplaza toda la tienda mientras no haya sesión. El
// registro es obligatorio desde que se abre la app: es lo que nos permite
// tener un perfil real por cliente (historial, puntos, direcciones) en vez
// de pedidos anónimos por WhatsApp.
export function AuthGate() {
  const [mode, setMode] = useState<Mode>('login')
  const { setAuth, continueAsGuest } = useAuthStore()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', identifier: '', code: '' })
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
    mutationFn: () => storeApi.login(form.identifier.trim(), form.password),
    onSuccess: (res) => { setAuth(res.data.data.customer, res.data.data.token); toast.success(`¡Bienvenido de vuelta, ${res.data.data.customer.name}!`) },
    onError: (err) => toast.error(errorMessage(err, 'Teléfono o contraseña incorrectos.')),
  })

  const registerMutation = useMutation({
    mutationFn: () => storeApi.register({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), password: form.password }),
    // Queda en la pantalla "Confirma tu correo" (VerifyEmailGate) hasta
    // escribir el código que llegó al correo.
    onSuccess: (res) => { setAuth(res.data.data.customer, res.data.data.token); toast.success('¡Cuenta creada! Revisa tu correo para confirmarla.') },
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

  // Recuperar contraseña: 1) teléfono o correo → código al correo de la
  // cuenta; 2) código + nueva contraseña → entra directo.
  const forgotMutation = useMutation({
    mutationFn: () => storeApi.forgotPassword(form.identifier.trim()),
    onSuccess: () => { setForm(v => ({ ...v, code: '', password: '' })); setMode('reset') },
    onError: (err) => toast.error(errorMessage(err, 'No pudimos enviar el código. Intenta de nuevo.')),
  })

  const resetMutation = useMutation({
    mutationFn: () => storeApi.resetPassword(form.identifier.trim(), form.code, form.password),
    onSuccess: (res) => { setAuth(res.data.data.customer, res.data.data.token); toast.success('¡Listo! Cambiaste tu contraseña.') },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo cambiar la contraseña.')),
  })

  const handleGoogleSuccess = (cred: CredentialResponse) => {
    if (!cred.credential) return
    pendingGoogleToken.current = cred.credential
    setNeedsProfile(false)
    googleMutation.mutate({})
  }

  const isLoading = loginMutation.isPending || registerMutation.isPending || googleMutation.isPending
    || forgotMutation.isPending || resetMutation.isPending

  const title = needsProfile ? 'Un paso más'
    : mode === 'login' ? 'Bienvenido de vuelta'
    : mode === 'register' ? 'Crea tu cuenta'
    : 'Recupera tu cuenta'
  const subtitle = needsProfile ? 'Cuéntanos cómo te llamas y tu WhatsApp para coordinar tus pedidos'
    : mode === 'forgot' ? 'Escribe el teléfono o correo de tu cuenta y te enviaremos un código a tu correo'
    : mode === 'reset' ? 'Si los datos corresponden a una cuenta con correo, te enviamos un código. Revisa también spam.'
    : 'Regístrate para comprar, ver tu historial y tus puntos'

  return (
    <div className="min-h-screen bg-paper-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Minimarket Marc" className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-black text-paper-ink text-center">
            {title}
          </h1>
          <p className="text-paper-ink-soft text-sm text-center mt-1">{subtitle}</p>
        </div>

        <div className="bg-white border border-paper-line rounded-3xl shadow-xl overflow-hidden">
          <div className="p-5 space-y-3">
            {needsProfile ? (
              <>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                  <input autoFocus value={googleName} onChange={e => setGoogleName(e.target.value)} placeholder="Tu nombre completo"
                    className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                  <input value={googlePhone} onChange={e => setGooglePhone(e.target.value)} placeholder="Teléfono (987 654 321)" type="tel"
                    className="w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors" />
                </div>
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (googleName.trim().length < 2) { toast.error('Ingresa tu nombre'); return }
                    if (!isValidMobile(googlePhone)) { toast.error('Ingresa un celular válido de 9 dígitos que empiece con 9'); return }
                    googleMutation.mutate({ phone: googlePhone.trim(), name: googleName.trim() })
                  }}
                  className="w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors">
                  {isLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Continuar<ArrowRight className="h-4 w-4" /></>}
                </button>
                <button onClick={() => { setNeedsProfile(false); pendingGoogleToken.current = null }}
                  className="w-full text-xs text-paper-ink-ghost hover:text-paper-ink-soft py-1 transition-colors">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {mode === 'forgot' && (
                  <>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                      <input autoFocus value={form.identifier} onChange={set('identifier')} placeholder="Teléfono o correo"
                        autoComplete="username" className={inputCls} />
                    </div>
                    <button disabled={isLoading} className={primaryBtnCls}
                      onClick={() => {
                        if (form.identifier.trim().length < 3) { toast.error('Ingresa tu teléfono o correo'); return }
                        forgotMutation.mutate()
                      }}>
                      {isLoading ? <Spinner /> : <>Enviarme el código<ArrowRight className="h-4 w-4" /></>}
                    </button>
                    <p className="text-xs text-paper-ink-faint text-center">
                      ¿Tu cuenta no tiene correo? Escríbenos por WhatsApp y te ayudamos a recuperarla.
                    </p>
                  </>
                )}

                {mode === 'reset' && (
                  <>
                    <CodeInput value={form.code} onChange={code => setForm(v => ({ ...v, code }))} />
                    <PasswordInput value={form.password} onChange={password => setForm(v => ({ ...v, password }))}
                      placeholder="Nueva contraseña" autoComplete="new-password" />
                    <p className="text-xs text-paper-ink-faint">{PASSWORD_HINT}</p>
                    <button disabled={isLoading} className={primaryBtnCls}
                      onClick={() => {
                        if (form.code.length !== 6) { toast.error('El código tiene 6 dígitos'); return }
                        if (!isStrongPassword(form.password)) { toast.error(PASSWORD_HINT); return }
                        resetMutation.mutate()
                      }}>
                      {isLoading ? <Spinner /> : <>Cambiar contraseña<ArrowRight className="h-4 w-4" /></>}
                    </button>
                    <button disabled={isLoading} onClick={() => forgotMutation.mutate()}
                      className="w-full text-xs text-brand-blue-600 py-1">
                      Reenviar código
                    </button>
                  </>
                )}

                {(mode === 'forgot' || mode === 'reset') && (
                  <button onClick={() => setMode('login')}
                    className="w-full py-2.5 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink flex items-center justify-center gap-1.5 transition-colors">
                    <ArrowLeft className="h-4 w-4" />Volver a iniciar sesión
                  </button>
                )}

                {mode === 'login' && (
                  <>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                      <input value={form.identifier} onChange={set('identifier')} placeholder="Teléfono o correo"
                        autoComplete="username" className={inputCls} />
                    </div>
                    <PasswordInput value={form.password} onChange={password => setForm(v => ({ ...v, password }))} />
                    <div className="flex justify-end -mt-1">
                      <button onClick={() => setMode('forgot')} className="text-xs text-brand-blue-600 hover:underline">
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                  </>
                )}

                {mode === 'register' && (
                  <>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                      <input value={form.name} onChange={set('name')} placeholder="Tu nombre completo" autoComplete="name" className={inputCls} />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                      <input value={form.phone} onChange={set('phone')} placeholder="Celular (987 654 321)" type="tel" autoComplete="tel" className={inputCls} />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
                      <input value={form.email} onChange={set('email')} placeholder="Correo electrónico" type="email" autoComplete="email" className={inputCls} />
                    </div>
                    <PasswordInput value={form.password} onChange={password => setForm(v => ({ ...v, password }))}
                      placeholder="Crea una contraseña" autoComplete="new-password" />
                    <p className="text-xs text-paper-ink-faint -mt-1">{PASSWORD_HINT} Te enviaremos un código para confirmar tu correo.</p>
                  </>
                )}

                {(mode === 'login' || mode === 'register') && (
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (mode === 'login') {
                      if (!form.identifier.trim()) { toast.error('Ingresa tu teléfono o correo'); return }
                      if (!form.password) { toast.error('Ingresa tu contraseña'); return }
                      loginMutation.mutate(); return
                    }
                    if (form.name.trim().length < 2) { toast.error('Ingresa tu nombre'); return }
                    if (!isValidMobile(form.phone)) { toast.error('Ingresa un celular válido de 9 dígitos que empiece con 9'); return }
                    if (!isValidEmail(form.email)) { toast.error('Ingresa un correo válido'); return }
                    if (!isStrongPassword(form.password)) { toast.error(PASSWORD_HINT); return }
                    registerMutation.mutate()
                  }}
                  className={primaryBtnCls}>
                  {isLoading
                    ? <Spinner />
                    : <>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}<ArrowRight className="h-4 w-4" /></>
                  }
                </button>
                )}

                {GOOGLE_CLIENT_ID && (mode === 'login' || mode === 'register') && (
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

                {(mode === 'login' || mode === 'register') && <>
                <button onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
                  className="w-full py-2.5 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
                  {mode === 'login' ? '¿Sin cuenta? Regístrate gratis' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>

                <button onClick={continueAsGuest}
                  className="w-full text-xs text-paper-ink-ghost hover:text-paper-ink-soft py-1 transition-colors">
                  Prefiero pedir por WhatsApp sin registrarme →
                </button>
                </>}
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
