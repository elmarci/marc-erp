// Contacto de la tienda (mismo dato que apps/store/src/lib/storeInfo.ts).
export const TIENDA_TEL = '930555831'
export const TIENDA_WHATSAPP = '51930555831'
export const tiendaWhatsapp = (texto: string) => `https://wa.me/${TIENDA_WHATSAPP}?text=${encodeURIComponent(texto)}`

// PIN tecleado al ingresar: solo en memoria (nunca se guarda), para no
// pedirlo de nuevo si la app obliga a cambiarlo por uno de 6 dígitos.
let pinEnMemoria = ''
export const recordarPin = (pin: string) => { pinEnMemoria = pin }
export const pinRecordado = () => pinEnMemoria
