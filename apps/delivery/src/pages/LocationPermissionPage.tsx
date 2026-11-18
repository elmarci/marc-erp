import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Phone } from 'lucide-react'
import { useAuthStore } from '../authStore'
import { PrimaryButton } from '../components/PrimaryButton'

// Fix P1 (crítica de diseño): ninguna de las 15 pantallas del canvas
// mostraba qué pasa si el repartidor niega el permiso de ubicación — y sin
// ese permiso, la función central que pidió el dueño (trazabilidad/
// ubicación en vivo) no puede funcionar. Esta pantalla pide el permiso real
// del navegador antes de dejar activarse, y ofrece una salida clara si lo
// niega, en vez de dejarlo varado.
export function LocationPermissionPage() {
  const navigate = useNavigate()
  const setLocationPermission = useAuthStore((s) => s.setLocationPermission)
  const [denied, setDenied] = useState(false)
  const [requesting, setRequesting] = useState(false)

  const requestPermission = () => {
    setRequesting(true)
    if (!('geolocation' in navigator)) {
      setRequesting(false)
      setDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setRequesting(false)
        setLocationPermission('granted')
        navigate('/estado', { replace: true })
      },
      () => {
        setRequesting(false)
        setDenied(true)
        setLocationPermission('denied')
      },
      { timeout: 8000 },
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-card shadow-card">
        <MapPin size={36} strokeWidth={1.8} className={denied ? 'text-bad' : 'text-blue'} />
      </div>

      {!denied ? (
        <>
          <div className="flex flex-col items-center gap-1.5">
            <div className="num text-[22px] font-semibold">Necesitamos tu ubicación</div>
            <div className="max-w-[280px] text-[15px] leading-snug text-ink-soft">
              La usamos solo mientras estás en servicio, para que la tienda sepa dónde estás y pueda avisarte de
              pedidos cerca. Se apaga en cuanto te desactivas.
            </div>
          </div>
          <PrimaryButton className="w-full" onClick={requestPermission} disabled={requesting}>
            {requesting ? 'Solicitando…' : 'Permitir ubicación'}
          </PrimaryButton>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1.5">
            <div className="num text-[22px] font-semibold">No podemos activarte sin ubicación</div>
            <div className="max-w-[280px] text-[15px] leading-snug text-ink-soft">
              Sin ubicación no podemos asignarte pedidos ni mostrarle a la tienda por dónde vas. Puedes darle permiso
              desde los ajustes de tu navegador y reintentar.
            </div>
          </div>
          <div className="flex w-full flex-col gap-3">
            <PrimaryButton className="w-full" onClick={requestPermission}>Reintentar</PrimaryButton>
            <a href="tel:930555831" className="flex items-center justify-center gap-2 text-sm font-medium text-ink-soft">
              <Phone size={16} />
              Llamar a la tienda
            </a>
          </div>
        </>
      )}
    </div>
  )
}
