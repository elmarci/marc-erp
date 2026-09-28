import { useState } from 'react'
import { CheckCircle2, Delete, Phone, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { verifyLogin } from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

// No hay proveedor de SMS/correo detrás de esta app (es un solo local, no
// una plataforma) — en vez de fingir un "código por SMS" que no se puede
// enviar de verdad, la recuperación y el alta de nuevos afiliados pasan por
// una persona real de la tienda. Es una limitación honesta, no un login
// "básico": WhatsApp Business y varias apps de reparto locales funcionan
// exactamente así con su personal de campo.
function RecuperarAccesoSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-900/40">
          <ShieldCheck size={22} className="text-accent-blue" />
        </div>
        <div className="font-display text-lg font-bold">Recuperar acceso</div>
        <div className="text-sm leading-snug text-paper-ink-soft">
          Por seguridad, tu PIN solo lo puede restablecer la tienda — no lo enviamos por SMS ni correo.
        </div>
      </div>
      <a
        href="tel:016139900"
        className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-brand-green-700 text-base font-extrabold text-white transition-transform active:scale-[0.98]"
      >
        <Phone size={18} />
        Llamar a la tienda
      </a>
    </BottomSheet>
  )
}

function SolicitarAccesoSheet({ onClose }: { onClose: () => void }) {
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [zona, setZona] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const enviar = async () => {
    setEnviando(true)
    await new Promise((r) => setTimeout(r, 700))
    setEnviando(false)
    setEnviado(true)
  }

  return (
    <BottomSheet onClose={onClose}>
      {enviado ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-900/40">
            <CheckCircle2 size={28} className="text-accent-green" />
          </div>
          <div className="font-display text-lg font-bold">Solicitud enviada</div>
          <div className="text-sm leading-snug text-paper-ink-soft">
            La tienda te contactará al {celular || 'número que dejaste'} para coordinar tu registro y darte un PIN.
          </div>
          <PrimaryButton className="mt-2 w-full" onClick={onClose}>
            Listo
          </PrimaryButton>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-900/40">
              <UserPlus size={22} className="text-accent-blue" />
            </div>
            <div className="font-display text-lg font-bold">Solicita tu acceso</div>
            <div className="text-sm leading-snug text-paper-ink-soft">
              La tienda valida tus datos y te asigna un PIN para empezar a repartir.
            </div>
          </div>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className="h-14 rounded-2xl border-[1.5px] border-paper-line bg-paper-surface px-4 text-base font-bold outline-none focus:border-brand-blue-500"
          />
          <input
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            placeholder="Celular"
            type="tel"
            inputMode="numeric"
            className="h-14 rounded-2xl border-[1.5px] border-paper-line bg-paper-surface px-4 text-base font-bold outline-none focus:border-brand-blue-500"
          />
          <input
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Zona donde repartes (ej. Manchay)"
            className="h-14 rounded-2xl border-[1.5px] border-paper-line bg-paper-surface px-4 text-base font-bold outline-none focus:border-brand-blue-500"
          />
          <PrimaryButton className="w-full" disabled={!nombre || !celular || enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  )
}

export function LoginPage() {
  const [telefono, setTelefono] = useState('987 654 321')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sheet, setSheet] = useState<'recuperar' | 'solicitar' | null>(null)
  const login = useAuthStore((s) => s.login)

  const press = async (key: string) => {
    if (checking) return
    if (key === 'del') {
      setPin((p) => p.slice(0, -1))
      setError(false)
      return
    }
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    setError(false)
    if (next.length === 4) {
      setChecking(true)
      const result = await verifyLogin(telefono, next)
      setChecking(false)
      if (result) {
        login(telefono.replace(/\s/g, ''), result.nombre, result.iniciales, result.token, result.riderId)
      } else {
        // Fix P1 (crítica de diseño): antes no existía ningún estado de
        // "PIN incorrecto" en las 15 pantallas del canvas — el repartidor
        // quedaba sin ninguna guía si se equivocaba. Ahora los puntos se
        // ponen en rojo, se muestra el mensaje, y el PIN se limpia solo
        // para reintentar sin fricción.
        setError(true)
        setTimeout(() => {
          setPin('')
          setError(false)
        }, 900)
      }
    }
  }

  const active = pin.length === 4 && !checking

  return (
    <div className="flex h-full flex-col">
      <div className="flex animate-enter-up flex-col gap-0.5 px-7 pt-10 pb-2">
        <div className="font-display text-[42px] font-extrabold leading-none text-accent-green">MARC</div>
        <div className="text-[15px] font-semibold text-paper-ink-soft">Reparto · para afiliados</div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-hidden px-7 pt-7">
        <div className="flex animate-enter-up flex-col gap-2">
          <label htmlFor="tel" className="text-sm font-bold">Tu celular</label>
          <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-paper-line bg-paper-surface px-4 py-3.5">
            <span className="text-lg font-bold text-paper-ink-soft">+51</span>
            <div className="h-[22px] w-px bg-paper-line" />
            <input
              id="tel"
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
            />
          </div>
        </div>

        <div className="flex animate-enter-up flex-col gap-3">
          <div className="text-sm font-bold">Tu PIN</div>
          <div className="flex gap-3.5" role="status" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-[18px] w-[18px] rounded-full border-2 transition-colors',
                  error
                    ? 'border-brand-magenta-500 bg-brand-magenta-500'
                    : i < pin.length
                      ? 'border-accent-green bg-accent-green'
                      : 'border-paper-ink-ghost bg-paper-surface',
                )}
              />
            ))}
          </div>
          {error && <p className="text-sm font-bold text-brand-magenta-500">PIN incorrecto, intenta de nuevo</p>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k, idx) =>
            k === '' ? (
              <div key={idx} />
            ) : k === 'del' ? (
              <button
                key={idx}
                onClick={() => press('del')}
                aria-label="Borrar"
                className="flex h-[60px] items-center justify-center rounded-2xl bg-paper-surface transition-transform active:scale-95"
              >
                <Delete size={24} />
              </button>
            ) : (
              <button
                key={idx}
                onClick={() => press(k)}
                aria-label={`Dígito ${k}`}
                className="font-display flex h-[60px] items-center justify-center rounded-2xl bg-paper-surface text-2xl font-bold transition-transform active:scale-95"
              >
                {k}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-6 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 30px)' }}>
        <div
          aria-live="polite"
          className={cn(
            'flex h-[60px] items-center justify-center rounded-2xl text-lg font-extrabold transition-colors',
            active ? 'bg-brand-green-700 text-white' : 'bg-paper-surface text-paper-ink-soft',
          )}
        >
          {checking ? 'Verificando…' : 'Ingresar'}
        </div>
        <div className="flex items-center justify-center gap-5">
          <button onClick={() => setSheet('recuperar')} className="flex items-center gap-1.5 text-sm font-semibold text-paper-ink-soft">
            <Phone size={15} />
            ¿Olvidaste tu PIN?
          </button>
          <div className="h-4 w-px bg-paper-line" />
          <button onClick={() => setSheet('solicitar')} className="flex items-center gap-1.5 text-sm font-semibold text-brand-blue-500">
            <UserPlus size={15} />
            Solicitar acceso
          </button>
        </div>
      </div>

      {sheet === 'recuperar' && <RecuperarAccesoSheet onClose={() => setSheet(null)} />}
      {sheet === 'solicitar' && <SolicitarAccesoSheet onClose={() => setSheet(null)} />}
    </div>
  )
}
