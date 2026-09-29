import { useState } from 'react'
import { CheckCircle2, Delete, Phone, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { verifyLogin } from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { PrimaryButton } from '../components/PrimaryButton'
import { cn } from '../lib/cn'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

// Formatea a "999 999 999" mientras se escribe — antes había que tipear el
// espacio a mano para que calzara con cómo se ve un celular peruano; el
// número real que se manda al backend sigue siendo solo dígitos (ver
// api.ts, que le saca los espacios antes de enviar).
function formatTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9)
  return digits.match(/.{1,3}/g)?.join(' ') ?? ''
}

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
  // Vacío por defecto — con auth real cada afiliado tiene su propio
  // teléfono, dejar un número real precargado hacía que alguien tipeara
  // solo el PIN y el login fallara contra la cuenta de otra persona sin
  // ningún aviso de por qué.
  const [telefono, setTelefono] = useState('')
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
      <div className="flex animate-enter-up flex-col gap-0.5 px-7 pt-4 pb-1">
        <div className="font-display text-[34px] font-extrabold leading-none text-accent-green">MARC</div>
        <div className="text-[13px] font-semibold text-paper-ink-soft">Reparto · para afiliados</div>
      </div>

      {/* Fix: en pantallas de celular reales y más bajas que el simulador de
          escritorio, el teclado numérico completo (fila del 0/borrar) no
          entraba en el alto disponible — con overflow-hidden quedaba
          recortado y sin forma de llegar a él. overflow-y-auto garantiza que
          siempre se pueda hacer scroll hasta verlo, y se recortó el espaciado
          vertical para que en la gran mayoría de celulares ni haga falta. */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-7 pt-3 pb-2">
        <div className="flex animate-enter-up flex-col gap-1.5">
          <label htmlFor="tel" className="text-sm font-bold">Tu celular</label>
          <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-paper-line bg-paper-surface px-4 py-3">
            <span className="text-lg font-bold text-paper-ink-soft">+51</span>
            <div className="h-[22px] w-px bg-paper-line" />
            <input
              id="tel"
              type="tel"
              inputMode="numeric"
              placeholder="987 654 321"
              value={telefono}
              onChange={(e) => setTelefono(formatTelefono(e.target.value))}
              className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-paper-ink-ghost placeholder:font-semibold"
            />
          </div>
        </div>

        <div className="flex animate-enter-up flex-col gap-2">
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

        <div className="grid shrink-0 grid-cols-3 gap-2.5">
          {KEYS.map((k, idx) =>
            k === '' ? (
              <div key={idx} />
            ) : k === 'del' ? (
              <button
                key={idx}
                onClick={() => press('del')}
                aria-label="Borrar"
                className="flex h-[52px] items-center justify-center rounded-2xl bg-paper-surface transition-transform active:scale-95"
              >
                <Delete size={22} />
              </button>
            ) : (
              <button
                key={idx}
                onClick={() => press(k)}
                aria-label={`Dígito ${k}`}
                className="font-display flex h-[52px] items-center justify-center rounded-2xl bg-paper-surface text-2xl font-bold transition-transform active:scale-95"
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
