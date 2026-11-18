// Tipos y ayudas de Ofertas: presentación por unidad o paquete, textos.
import { formatCurrency } from '@/lib/utils'

export interface Offer {
  id: string; name: string; description: string | null; type: string; value: number
  valueType: 'PERCENTAGE' | 'FIXED' | null
  buyQuantity: number | null; getQuantity: number | null
  startTime: string | null; endTime: string | null; daysOfWeek: number[]
  startDate: string; endDate: string | null; isActive: boolean; showInStore: boolean
  storeBadge: string | null; storeImage: string | null; storeVideo: string | null; storeFullDesign: boolean; priority: number
  products: Array<{
    quantity?: number; asPack?: boolean
    product: {
      id: string; name: string; imageUrl: string | null; salePrice?: number
      packSize?: number | null; packPrice?: number | string | null; packLabel?: string | null
    }
  }>
}

export interface Product {
  id: string; name: string; salePrice: number
  packSize?: number | null; packPrice?: number | string | null; packLabel?: string | null
}

// Un producto entra a la oferta por unidad o, si tiene paquete/caja configurado
// (cajetilla, caja...), por ese paquete: el precio, la cantidad y el stock de la
// promo se calculan con el paquete como unidad de venta.
export interface SelItem {
  productId: string; name: string; asPack: boolean; salePrice: number
  packSize: number | null; packPrice: number | null; packLabel: string | null
}

export const hasPackCfg = (p: { packSize?: number | null; packPrice?: number | string | null }) =>
  !!p.packSize && p.packSize >= 2 && p.packPrice != null && Number(p.packPrice) > 0

export const toSel = (p: Product, asPack: boolean): SelItem => ({
  productId: p.id, name: p.name, asPack, salePrice: Number(p.salePrice ?? 0),
  packSize: p.packSize ?? null, packPrice: p.packPrice != null ? Number(p.packPrice) : null, packLabel: p.packLabel ?? null,
})

export const presentationLabel = (i: SelItem) => (i.asPack ? `${i.packLabel || 'Paquete'} x${i.packSize}` : 'Unidad')
export const priceOf = (i: SelItem) => (i.asPack ? (i.packPrice ?? 0) : i.salePrice)

export const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'Descuento %', FIXED_DISCOUNT: 'Descuento S/',
  BUY_X_GET_Y: '2×1 / Lleva más', BUNDLE_PRICE: 'Precio paquete (mismo producto)',
  COMBO: 'Combo (productos distintos)', HAPPY_HOUR: 'Hora feliz',
}

export const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']


/** Valor de la oferta tal como se muestra en la lista. */
export function offerValueText(offer: Offer): string {
  switch (offer.type) {
    case 'PERCENTAGE_DISCOUNT': return `${offer.value}%`
    case 'BUNDLE_PRICE': return `${offer.getQuantity ?? '?'} x ${formatCurrency(offer.value)}`
    case 'BUY_X_GET_Y': return `Paga ${offer.buyQuantity ?? '?'}, lleva ${offer.getQuantity ?? '?'}`
    case 'HAPPY_HOUR': return offer.valueType === 'FIXED' ? formatCurrency(offer.value) : `${offer.value}%`
    case 'COMBO': return `${offer.products.length} productos = ${formatCurrency(offer.value)}`
    default: return formatCurrency(offer.value)
  }
}
