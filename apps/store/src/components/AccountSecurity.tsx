import { useEffect, useRef, useState } from 'react'
import { Mail, KeyRound, ArrowRight, Lock, Eye, EyeOff, LogOut } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'

export function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback
}

// Misma regla que el backend (store-auth.service.ts → isStrongPassword).
export const PASSWORD_HINT = 'Mínimo 8 caracteres, con letras y números.'
export function isStrongPassword(pw: string) {
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) && /\d/.test(pw)
}

export const inputCls = 'w-full bg-paper-surface border border-paper-line focus:border-brand-blue-400 rounded-xl pl-10 pr-4 py-3 text-sm text-paper-ink placeholder-paper-ink-ghost outline-none transition-colors'
export const primaryBtnCls = 'w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors'

export function Spinner() {
  return <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
}

export function PasswordInput({ value, onChange, placeholder = 'Contraseña', autoComplete = 'current-password' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        type={show ? 'text' : 'password'} autoComplete={autoComplete} className={`${inputCls} pr-10`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-3.5 top-3.5 text-paper-ink-ghost hover:text-paper-ink-soft">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
      <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code"
        className={`${inputCls} tracking-[0.3em] font-bold`} />
    </div>
  )
}

/* ── Confirmar / cambiar correo con código ───────────────────────────── */
// Paso 1: correo (si la cuenta ya tiene uno sin verificar, se usa ese y el
// código ya salió al registrarse). Paso 2: código de 6 dígitos.
export function EmailCodeForm({ currentEmail, codeAlreadySent, onVerified, changing }: {
  currentEmail: string | null | undefined
  codeAlreadySent?: boolean
  changing?: boolean
  onVerified: () => void
}) {
  const { customer, setCustomer } = useAuthStore()
  const [email, setEmail] = useState(changing ? '' : currentEmail ?? '')
  const [sentTo, setSentTo] = useState<string | null>(codeAlreadySent && currentEmail ? currentEmail : null)
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(codeAlreadySent ? 60 : 0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendMutation = useMutation({
    mutationFn: (target: string) => storeApi.sendEmailCode(target),
    onSuccess: (res) => { setSentTo(res.data.data.sentTo); setCode(''); setCooldown(60); toast.success('Te enviamos un código a tu correo') },
    onError: (err) => toast.error(errorMessage(err, 'No pudimos enviar el código. Intenta de nuevo.')),
  })

  const verifyMutation = useMutation({
    mutationFn: () => storeApi.verifyEmail(code),
    onSuccess: (res) => {
      const c = res.data.data.customer
      if (customer) setCustomer({ ...customer, email: c.email, emailVerified: c.emailVerified, erpLinked: c.erpLinked })
      toast.success('¡Correo confirmado!')
      onVerified()
    },
    onError: (err) => toast.error(errorMessage(err, 'Código incorrecto.')),
  })

  if (!sentTo) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-paper-ink-ghost" />
          <input autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
            type="email" autoComplete="email" className={inputCls} />
        </div>
        <button disabled={sendMutation.isPending} className={primaryBtnCls}
          onClick={() => {
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error('Ingresa un correo válido'); return }
            sendMutation.mutate(email.trim())
          }}>
          {sendMutation.isPending ? <Spinner /> : <>Enviarme el código<ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-paper-ink-soft">
        Escribe el código que enviamos a <span className="font-semibold text-paper-ink break-all">{sentTo}</span>. Si no lo ves, revisa la carpeta de spam.
      </p>
      <CodeInput value={code} onChange={setCode} />
      <button disabled={verifyMutation.isPending || code.length !== 6} className={primaryBtnCls} onClick={() => verifyMutation.mutate()}>
        {verifyMutation.isPending ? <Spinner /> : <>Confirmar correo<ArrowRight className="h-4 w-4" /></>}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button onClick={() => { setSentTo(null); setEmail(changing ? '' : sentTo) }}
          className="text-paper-ink-ghost hover:text-brand-blue-600 transition-colors">
          Usar otro correo
        </button>
        <button disabled={cooldown > 0 || sendMutation.isPending} onClick={() => sendMutation.mutate(sentTo)}
          className="text-brand-blue-600 disabled:text-paper-ink-ghost transition-colors">
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
        </button>
      </div>
    </div>
  )
}

/* ── Pantalla que pide confirmar el correo ───────────────────────────── */
// Aparece después de registrarse y, una sola vez, a las cuentas antiguas sin
// correo o con correo sin confirmar. Antes de mostrarla se consulta el
// perfil por si la cuenta ya está verificada (sesiones guardadas antes de
// este cambio no traen el dato).
export function VerifyEmailGate({ children }: { children: React.ReactNode }) {
  const { customer, isLoggedIn, setCustomer, logout } = useAuthStore()
  // Solo cuentas con sesión: un invitado no tiene correo que confirmar.
  const needsCheck = !!isLoggedIn && !!customer && customer.emailVerified !== true
  const codeSentOnRegister = useRef(customer?.emailVerified === false && !!customer?.email)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['store-profile', 'verify-check'],
    queryFn: () => storeApi.getProfile(),
    enabled: needsCheck && customer?.emailVerified === undefined,
    retry: 1,
  })

  useEffect(() => {
    const p = data?.data.data
    if (p && customer) setCustomer({ ...customer, email: p.email, emailVerified: p.emailVerified, erpLinked: p.erpLinked, hasPassword: p.hasPassword })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!needsCheck) return <>{children}</>
  if (customer?.emailVerified === undefined) {
    if (isError) return <>{children}</> // sin conexión: no bloquear la tienda
    if (isLoading || data) {
      return (
        <div className="min-h-screen bg-paper-bg flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-brand-blue-100 border-t-brand-blue-600 rounded-full animate-spin" />
        </div>
      )
    }
  }

  const hasEmail = !!customer?.email
  return (
    <div className="min-h-screen bg-paper-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Minimarket Marc" className="h-14 w-auto mb-3" />
          <h1 className="text-xl font-black text-paper-ink text-center">
            {hasEmail ? 'Confirma tu correo' : 'Agrega tu correo'}
          </h1>
          <p className="text-paper-ink-soft text-sm text-center mt-1">
            {hasEmail
              ? 'Así protegemos tu cuenta y podrás recuperarla si olvidas tu contraseña.'
              : 'Ahora pedimos un correo a todas las cuentas para protegerlas y poder recuperarlas. Es una sola vez.'}
          </p>
        </div>
        <div className="bg-white border border-paper-line rounded-3xl shadow-xl p-5">
          <EmailCodeForm currentEmail={customer?.email} codeAlreadySent={codeSentOnRegister.current} onVerified={() => {}} />
        </div>
        <button onClick={logout}
          className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-paper-ink-ghost hover:text-paper-ink-soft transition-colors">
          <LogOut className="h-3.5 w-3.5" />Salir y entrar con otra cuenta
        </button>
      </div>
    </div>
  )
}

/* ── Cambiar contraseña (desde el perfil) ────────────────────────────── */
export function ChangePasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const { setAuth } = useAuthStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const mutation = useMutation({
    mutationFn: () => storeApi.changePassword(current, next),
    onSuccess: (res) => {
      setAuth(res.data.data.customer, res.data.data.token)
      toast.success('Contraseña actualizada. Se cerró la sesión en tus otros equipos.')
      onDone()
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo cambiar la contraseña.')),
  })

  return (
    <div className="space-y-2 mt-2 max-w-sm">
      {hasPassword && <PasswordInput value={current} onChange={setCurrent} placeholder="Contraseña actual" />}
      <PasswordInput value={next} onChange={setNext} placeholder="Nueva contraseña" autoComplete="new-password" />
      <p className="text-xs text-paper-ink-faint">{PASSWORD_HINT}</p>
      <div className="flex gap-2">
        <button disabled={mutation.isPending}
          onClick={() => {
            if (!isStrongPassword(next)) { toast.error(PASSWORD_HINT); return }
            mutation.mutate()
          }}
          className="bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors">
          Guardar contraseña
        </button>
        <button onClick={onDone} className="text-xs text-paper-ink-ghost hover:text-paper-ink-soft px-2 transition-colors">Cancelar</button>
      </div>
    </div>
  )
}
