import { getVapidPublicKey, subscribePush } from '../api'

// Mismo mecanismo que apps/store/src/lib/push.ts — la applicationServerKey
// de pushManager.subscribe() necesita un Uint8Array, pero el backend manda
// la VAPID public key en base64url (formato estándar de web-push).
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Se llama al activarse "en servicio" — es cuando de verdad le sirve al
// biker recibir el aviso de "listo para recoger". Debe llamarse desde un
// gesto del usuario (el toggle de EstadoPage), los navegadores ignoran el
// prompt si se llama solo. Nunca lanza excepción — si algo falla, el biker
// simplemente no recibe push (sigue viendo el pedido igual dentro de la app).
export async function subscribeRiderToPush(): Promise<void> {
  try {
    if (!isPushSupported()) return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const publicKey = await getVapidPublicKey()
      if (!publicKey) return
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    await subscribePush(subscription.toJSON() as PushSubscriptionJSON)
  } catch { /* silencioso — la notificación es un plus, no un requisito */ }
}
