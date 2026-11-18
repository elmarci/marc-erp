import { useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { activateDevice, deviceLabel, login, LoginError, type LoginResult } from '../api'
import { BottomSheet } from '../components/BottomSheet'
import { KeyPad, PinBoxes } from '../components/PinBoxes'
import { PrimaryButton } from '../components/PrimaryButton'
import { recordarPin, TIENDA_TEL, tiendaWhatsapp } from '../lib/tienda'

// Ingreso en tres pasos:
// 1. celular (se recuerda en este equipo);
// 2. PIN (6 dígitos; los PIN antiguos de 4 entran una vez y luego se cambian);
// 3. solo si el celular es nuevo: código de activación que da la tienda.
// Sin el código, saber el número y el PIN de alguien no basta para entrar.

function formatTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9)
  return digits.match(/.{1,3}/g)?.join(' ') ?? ''
}
const enmascarar = (tel: string) => {
  const d = tel.replace(/\D/g, '')
  return d.length >= 9 ? `${d.slice(0, 3)} ••• ${d.slice(6, 9)}` : tel
}

type Paso = 'telefono' | 'pin' | 'codigo'

function AyudaSheet({ tipo, onClose }: { tipo: 'pin' | 'repartir'; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="num text-xl font-semibold">{tipo === 'pin' ? 'Olvidé mi PIN' : 'Quiero repartir con Tiendas Marc'}</h2>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">
        {tipo === 'pin'
          ? 'Por seguridad, tu PIN solo lo cambia la tienda. No se envía por SMS ni por correo.'
          : 'Acércate a la tienda con tu DNI, brevete y SOAT vigente. Ahí creamos tu cuenta y autorizamos tu celular.'}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <a href={tiendaWhatsapp(tipo === 'pin' ? 'Hola, soy repartidor y olvidé mi PIN de Marc Reparto.' : 'Hola, quiero ser repartidor de Tiendas Marc.')}
          target="_blank" rel="noreferrer"
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-blue text-base font-semibold text-white">
          <MessageCircle size={18} /> Escribir por WhatsApp
        </a>
        <a href={`tel:${TIENDA_TEL}`} className="flex h-12 items-center justify-center gap-2 text-[15px] font-medium text-ink-soft">
          <Phone size={16} /> Llamar al {formatTelefono(TIENDA_TEL)}
        </a>
      </div>
    </BottomSheet>
  )
}

export function LoginPage() {
  const recordado = {
    telefono: useAuthStore((s) => s.telefono),
    nombre: useAuthStore((s) => s.nombre),
    iniciales: useAuthStore((s) => s.iniciales),
  }
  const doLogin = useAuthStore((s) => s.login)
  const forget = useAuthStore((s) => s.forget)

  const [paso, setPaso] = useState<Paso>(recordado.telefono ? 'pin' : 'telefono')
  const [telefono, setTelefono] = useState(formatTelefono(recordado.telefono))
  const [pin, setPin] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [ayuda, setAyuda] = useState<'pin' | 'repartir' | null>(null)

  const entrar = (r: LoginResult, pinUsado: string) => {
    recordarPin(pinUsado)
    doLogin({ telefono: telefono.replace(/\s/g, ''), nombre: r.nombre, iniciales: r.iniciales, token: r.token, riderId: r.riderId, pinUpgrade: r.pinUpgradeRequired })
  }

  const enviarPin = async (valor: string) => {
    setChecking(true)
    setError(null)
    try {
      entrar(await login(telefono, valor), valor)
    } catch (err) {
      const e = err as LoginError
      if (e.code === 'DEVICE_NOT_AUTHORIZED') {
        setPaso('codigo')
      } else {
        setError(e.message)
        setPin('')
      }
    } finally {
      setChecking(false)
    }
  }

  const enviarCodigo = async (valor: string) => {
    setChecking(true)
    setError(null)
    try {
      entrar(await activateDevice(telefono, pin, valor), pin)
    } catch (err) {
      setError((err as LoginError).message)
      setCodigo('')
      if ((err as LoginError).code !== 'CODE_INVALID') { setPaso('pin'); setPin('') }
    } finally {
      setChecking(false)
    }
  }

  const teclaPin = (k: string) => {
    if (checking) return
    setError(null)
    if (k === 'del') { setPin((p) => p.slice(0, -1)); return }
    if (pin.length >= 6) return
    const next = pin + k
    setPin(next)
    if (next.length === 6) enviarPin(next)
  }

  const teclaCodigo = (k: string) => {
    if (checking) return
    setError(null)
    if (k === 'del') { setCodigo((c) => c.slice(0, -1)); return }
    if (codigo.length >= 6) return
    const next = codigo + k
    setCodigo(next)
    if (next.length === 6) enviarCodigo(next)
  }

  const esRecordado = recordado.telefono && recordado.telefono === telefono.replace(/\s/g, '')

  return (
    <div className="flex h-full flex-col">
      <header className="lane flex-shrink-0 bg-night px-5 pb-8 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <img src="/marc-mark.png" alt="Tiendas Marc" width={48} height={48} className="h-12 w-12 rounded-full bg-white" />
        <h1 className="num mt-4 text-[28px] font-semibold leading-tight">{paso === 'codigo' ? 'Celular nuevo' : 'Marc Reparto'}</h1>
        <p className="mt-0.5 text-sm text-white/70">
          {paso === 'telefono' && 'Ingresa con tu número de celular'}
          {paso === 'pin' && 'Ingresa con tu PIN'}
          {paso === 'codigo' && 'Este celular aún no está autorizado para tu cuenta'}
        </p>
      </header>

      <div className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5">
        {paso === 'telefono' && (
          <>
            <label htmlFor="tel" className="text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Tu celular</label>
            <div className="-mt-2 flex items-center gap-3 border-b-[1.5px] border-ink pb-2">
              <span className="num text-2xl text-ink-faint">+51</span>
              <input
                id="tel" type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus
                placeholder="987 654 321" value={telefono}
                onChange={(e) => { setTelefono(formatTelefono(e.target.value)); setError(null) }}
                className="num min-w-0 flex-1 bg-transparent text-2xl font-medium outline-none placeholder:text-ink-ghost"
              />
            </div>
            {error && <p className="text-sm text-bad">{error}</p>}
          </>
        )}

        {paso === 'pin' && (
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-[13px] font-semibold">
                {esRecordado ? recordado.iniciales : '··'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{esRecordado ? recordado.nombre : 'Tu cuenta'}</div>
                <div className="text-sm text-ink-soft">{enmascarar(telefono)}</div>
              </div>
              <button onClick={() => { forget(); setTelefono(''); setPin(''); setError(null); setPaso('telefono') }} className="text-sm font-medium text-blue">
                {esRecordado ? `No soy ${recordado.nombre.split(' ')[0]}` : 'Cambiar'}
              </button>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-faint">Tu PIN</div>
              <div className="mt-2"><PinBoxes value={pin} length={6} error={!!error} /></div>
              {error
                ? <p className="mt-2 text-sm text-bad" role="alert">{error}</p>
                : <p className="mt-2 text-[13px] text-ink-soft">{checking ? 'Verificando…' : '¿Tu PIN aún es de 4 dígitos? Escríbelo y toca Ingresar.'}</p>}
            </div>
            <KeyPad onKey={teclaPin} disabled={checking} />
          </>
        )}

        {paso === 'codigo' && (
          <>
            <p className="text-[15px] leading-snug">
              Pide tu <span className="font-semibold">código de activación</span> en la tienda. Vence en 10 minutos.
            </p>
            <div>
              <PinBoxes value={codigo} length={6} error={!!error} reveal />
              {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
            </div>
            <KeyPad onKey={teclaCodigo} disabled={checking} />
            <div className="rounded-2xl bg-card px-4 py-1 shadow-card">
              <div className="flex justify-between py-2.5 text-sm"><span className="text-ink-soft">Cuenta</span><span className="tabular-nums">{enmascarar(telefono)}</span></div>
              <div className="flex justify-between border-t border-line py-2.5 text-sm"><span className="text-ink-soft">Este celular</span><span>{deviceLabel()}</span></div>
            </div>
            <p className="pb-2 text-[13px] leading-snug text-ink-soft">Al activarlo, tu sesión en el otro celular se cierra. Si no fuiste tú, avisa a la tienda.</p>
          </>
        )}
      </div>

      <div className="px-5 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        {paso === 'telefono' && (
          <PrimaryButton className="w-full" disabled={telefono.replace(/\s/g, '').length !== 9}
            onClick={() => { setPin(''); setPaso('pin') }}>
            Continuar
          </PrimaryButton>
        )}
        {paso === 'pin' && (
          <PrimaryButton className="w-full" disabled={checking || (pin.length !== 4 && pin.length !== 6)} onClick={() => enviarPin(pin)}>
            {checking ? 'Verificando…' : 'Ingresar'}
          </PrimaryButton>
        )}
        {paso === 'codigo' && (
          <PrimaryButton className="w-full" disabled={checking || codigo.length !== 6} onClick={() => enviarCodigo(codigo)}>
            {checking ? 'Activando…' : 'Activar este celular'}
          </PrimaryButton>
        )}
        <div className="mt-3 flex justify-between">
          {paso === 'codigo'
            ? <button onClick={() => { setPaso('pin'); setPin(''); setCodigo(''); setError(null) }} className="text-sm font-medium text-blue">Volver</button>
            : <button onClick={() => setAyuda('pin')} className="text-sm font-medium text-blue">Olvidé mi PIN</button>}
          <button onClick={() => setAyuda('repartir')} className="text-sm font-medium text-blue">Quiero repartir</button>
        </div>
      </div>

      {ayuda && <AyudaSheet tipo={ayuda} onClose={() => setAyuda(null)} />}
    </div>
  )
}
