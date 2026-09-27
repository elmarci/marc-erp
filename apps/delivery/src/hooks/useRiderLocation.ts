import { useEffect, useState } from 'react'
import type { LatLng } from '../lib/geo'
import { RIDER_BASE } from '../mockApi'
import { useAuthStore } from '../authStore'

// GPS real cuando ya se concedió el permiso (ver LocationPermissionPage);
// si todavía no, o el navegador no puede darlo, cae a la posición base de
// la zona en vez de romper el mapa.
export function useRiderLocation(): LatLng {
  const granted = useAuthStore((s) => s.locationPermission === 'granted')
  const [pos, setPos] = useState<LatLng>(RIDER_BASE)

  useEffect(() => {
    if (!granted || !('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos(RIDER_BASE),
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [granted])

  return pos
}
