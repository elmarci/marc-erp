import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { changePin, LoginError } from '../api'
import { useAuthStore } from '../authStore'
import { AppHeader } from '../components/AppHeader'
import { KeyPad, PinBoxes } from '../components/PinBoxes'
import { pinRecordado, recordarPin } from '../lib/tienda'

type Paso = 'actual' | 'nuevo' | 'repetir'

// Crear o cambiar el PIN (6 dígitos). Obligatorio la primera vez para quien
// todavía tenía un PIN de 4.
export function CambiarPinPage({ obligatorio }: { obligatorio?: boolean }) {
  const navigate = useNavigate()
  const setPinUpgrade = useAuthStore((s) => s.setPinUpgrade)
  const logout = useAuthStore((s) => s.logout)
  const [actual, setActual] = useState(obligatorio ? pinRecordado() : '')
  const [paso, setPaso] = useState<Paso>(obligatorio && pinRecordado() ? 'nuevo' : 'actual')
  const [nuevo, setNuevo] = useState('')
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const largo = paso === 'actual' ? (obligatorio ? 4 : 6) : 6

  const guardar = async (repetido: string) => {
    if (repetido !== nuevo) {
      setError('Los PIN no coinciden. Escríbelo de nuevo.')
      setValor(''); setNuevo(''); setPaso('nuevo')
      return
    }
    setSaving(true)
    try {
      await changePin(actual, nuevo)
      recordarPin('')
      setPinUpgrade(false)
      toast.success('Listo, tu PIN nuevo ya está activo.')
      navigate('/estado', { replace: true })
    } catch (err) {
      setError((err as LoginError).message)
      setValor(''); setNuevo('')
      setPaso((err as LoginError).message.includes('actual') ? 'actual' : 'nuevo')
      if ((err as LoginError).message.includes('actual')) setActual('')
    } finally {
      setSaving(false)
    }
  }

  const tecla = (k: string) => {
    if (saving) return
    setError(null)
    if (k === 'del') { setValor((v) => v.slice(0, -1)); return }
    if (valor.length >= largo) return
    const next = valor + k
    setValor(next)
    if (next.length < largo) return
    if (paso === 'actual') { setActual(next); setValor(''); setPaso('nuevo') }
    else if (paso === 'nuevo') { setNuevo(next); setValor(''); setPaso('repetir') }
    else guardar(next)
  }

  const titulo = obligatorio ? 'Crea tu PIN nuevo' : 'Cambiar mi PIN'
  const texto = {
    actual: obligatorio ? 'Escribe tu PIN actual de 4 dígitos.' : 'Escribe tu PIN actual.',
    nuevo: 'Elige un PIN de 6 dígitos que solo tú sepas. Evita tu fecha de nacimiento o 123456.',
    repetir: 'Escríbelo otra vez para confirmar.',
  }[paso]

  return (
    <div className="flex h-full flex-col">
      {obligatorio ? (
        <header className="lane flex-shrink-0 bg-night px-5 pb-8 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
          <img src="/marc-mark.png" alt="" width={48} height={48} className="h-12 w-12 rounded-full bg-white" />
          <h1 className="num mt-4 text-[28px] font-semibold leading-tight">{titulo}</h1>
          <p className="mt-0.5 text-sm text-white/70">Ahora el PIN es de 6 dígitos para que nadie lo adivine.</p>
        </header>
      ) : (
        <AppHeader back="/perfil" title={titulo} subtitle="Tu PIN es personal. La tienda nunca te lo pedirá." />
      )}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5">
        <p className="text-[15px] leading-snug">{texto}</p>
        <div>
          <PinBoxes value={valor} length={largo} error={!!error} />
          {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
          {saving && <p className="mt-2 text-sm text-ink-soft">Guardando…</p>}
        </div>
        <KeyPad onKey={tecla} disabled={saving} />
      </div>
      <div className="px-5 pt-3 text-center" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        {obligatorio
          ? <button onClick={logout} className="h-11 text-sm font-medium text-ink-soft">Salir</button>
          : <button onClick={() => navigate(-1)} className="h-11 text-sm font-medium text-ink-soft">Cancelar</button>}
      </div>
    </div>
  )
}
