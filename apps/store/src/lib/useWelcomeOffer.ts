import { useQuery } from '@tanstack/react-query'
import { storeApi } from '../api'
import { useAuthStore } from '../authStore'

// Estado del descuento de bienvenida para quien mira la tienda:
// - 'guest': sin sesión; se le invita a registrarse para usarlo.
// - 'eligible': cuenta nueva sin pedidos; se aplica en su primera compra.
// - 'used': ya compró (o no se pudo consultar): no se muestra nada.
export function useWelcomeOffer(): 'guest' | 'eligible' | 'used' {
  const isLoggedIn = useAuthStore(s => !!s.isLoggedIn)
  const { data } = useQuery({
    queryKey: ['welcome-offer', isLoggedIn],
    queryFn: () => storeApi.getWelcomeOffer(),
    enabled: isLoggedIn,
    staleTime: 60_000,
  })
  if (!isLoggedIn) return 'guest'
  return data?.data.data.eligible ? 'eligible' : 'used'
}
