import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../lib/geo'
import { RIDER_BASE, updateLocation } from '../api'
import { useAuthStore } from '../authStore'

const PUSH_INTERVAL_MS = 15000

// GPS real cuando ya se concedió el permiso (ver LocationPermissionPage);
// si todavía no, o el navegador no puede darlo, cae a la posición base de
// la zona en vez de romper el mapa. Mientras el biker está "en servicio",
// además empuja su posición al backend cada ~15s (no en cada tick de
// watchPosition, que dispara mucho más seguido) para que el ERP pueda
// mostrar su última ubicación en el panel de seguimiento.
export function useRiderLocation(): LatLng {
  const granted = useAuthStore((s) => s.locationPermission === 'granted')
  const enServicio = useAuthStore((s) => s.enServicio)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const [pos, setPos] = useState<LatLng>(RIDER_BASE)
  const lastPushRef = useRef(0)

  useEffect(() => {
    if (!granted || !('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPos(next)
        if (isLoggedIn && enServicio && Date.now() - lastPushRef.current > PUSH_INTERVAL_MS) {
          lastPushRef.current = Date.now()
          updateLocation(next.lat, next.lng).catch(() => {})
        }
      },
      () => setPos(RIDER_BASE),
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [granted, enServicio, isLoggedIn])

  return pos
}
