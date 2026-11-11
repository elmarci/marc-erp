import type { Offer } from '../api'
import { getPackInfo } from '../components/AddOfferModal'
import { money } from './storeInfo'

// Lo que va en la etiqueta amarilla: corto y con el número por delante.
export function dealText(offer: Offer) {
  if (offer.type === 'PERCENTAGE_DISCOUNT') return `−${offer.value}%`
  if (offer.type === 'FIXED_DISCOUNT') return `−${money(Number(offer.value))}`
  if (offer.type === 'BUY_X_GET_Y') return `Lleva ${offer.getQuantity ?? 3}, paga ${offer.buyQuantity ?? 2}`
  const pack = getPackInfo(offer)
  return pack ? `${pack.totalQty} por ${money(pack.totalPrice)}` : 'Precio especial'
}
