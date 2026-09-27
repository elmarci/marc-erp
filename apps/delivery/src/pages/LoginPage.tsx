import { useState } from 'react'
import { Delete, Phone } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { verifyLogin } from '../mockApi'
import { cn } from '../lib/cn'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export function LoginPage() {
  const [telefono, setTelefono] = useState('987 654 321')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
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
        login(telefono.replace(/\s/g, ''), result.nombre, result.iniciales)
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
        <div className="font-display text-[34px] font-extrabold leading-none text-brand-green-500">Marc</div>
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
                      ? 'border-brand-green-500 bg-brand-green-500'
                      : 'border-paper-ink-ghost bg-white',
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
                className="flex h-[60px] items-center justify-center rounded-2xl bg-paper-surface text-2xl font-bold transition-transform active:scale-95"
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
        <a href="tel:016139900" className="flex items-center justify-center gap-2 text-sm font-semibold text-paper-ink-soft">
          <Phone size={16} />
          ¿Olvidaste tu PIN? Llama a la tienda
        </a>
      </div>
    </div>
  )
}
