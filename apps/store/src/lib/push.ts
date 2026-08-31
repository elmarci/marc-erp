import { storeApi } from '../api'

// La applicationServerKey de pushManager.subscribe() necesita un Uint8Array,
// pero el backend manda la VAPID public key en base64url (formato estándar
// de web-push) — hay que convertirla a mano, la Web Push API no lo hace sola.
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

// undefined = el navegador no soporta push en absoluto (ej. Safari de
// escritorio viejo, o iOS sin instalar la app a la pantalla de inicio).
export function getPushPermission(): NotificationPermission | undefined {
  if (!isPushSupported()) return undefined
  return Notification.permission
}

// Pide el permiso (debe llamarse desde un gesto del usuario, ej. un click —
// los navegadores ignoran o auto-deniegan el prompt si se llama solo) y
// registra la suscripción en el backend. Devuelve false si el usuario negó
// el permiso o el navegador no soporta push, sin lanzar excepción.
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const res = await storeApi.getVapidPublicKey()
    const publicKey = res.data.data.publicKey
    if (!publicKey) return false // backend sin llaves VAPID configuradas todavía
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  await storeApi.subscribeToPush(subscription.toJSON() as PushSubscriptionJSON)
  return true
}
