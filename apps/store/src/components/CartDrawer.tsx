import { X, Plus, Minus, ShoppingBag, Trash2, PackageCheck } from 'lucide-react'
import { useBackClose, overlayNav } from '../lib/useBackClose'
import { useQuery } from '@tanstack/react-query'
import { useCartStore, cartTotal, type CartItem } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useNavigate } from 'react-router-dom'
import { storeApi } from '../api'

import { WhatsAppIcon } from './CartBar'
import { BRAND_NAME, DELIVERY, money, whatsappLink } from '../lib/storeInfo'
import { thumb } from '../lib/thumb'

export function CartDrawer() {
  const items = useCartStore(s => s.items)
  const isOpen = useCartStore(s => s.isOpen)
  const closeCart = useCartStore(s => s.closeCart)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQuantity = useCartStore(s => s.updateQuantity)
  const removeBundle = useCartStore(s => s.removeBundle)
  const clearCart = useCartStore(s => s.clearCart)
  const customer = useAuthStore(s => s.customer)
  const addItem = useCartStore(s => s.addItem)
  const total = cartTotal(items)
  const navigate = useNavigate()

  // "¿Se te olvidó algo?" — v1 simple: productos destacados que todavía no
  // están en el carrito. No es una recomendación inteligente por combinación
  // de compra (eso necesita datos de qué se vende junto con qué, que hoy no
  // se registra) — ver la propuesta de analítica para esa versión más fina.
  const { data: featuredData } = useQuery({
    queryKey: ['store-featured-upsell'],
    queryFn: () => storeApi.getFeaturedProducts(8),
    enabled: items.length > 0,
    staleTime: 300000,
  })
  const cartProductIds = new Set(items.map(i => i.product.id))
  const upsellProducts = (featuredData?.data.data ?? []).filter(p => !cartProductIds.has(p.id)).slice(0, 3)

  // Agrupa las líneas de un mismo paquete (bundle/combo) en una sola tarjeta
  // — antes cada sabor/variante salía como una fila estirada aparte, lo que
  // hacía el carrito larguísimo con paquetes de varios productos.
  const seenBundles = new Set<string>()
  const rows = items.reduce<Array<{ key: string; el: 'item' | 'bundle'; item?: CartItem; group?: CartItem[] }>>((acc, item) => {
    if (item.bundle) {
      if (seenBundles.has(item.bundle.id)) return acc
      seenBundles.add(item.bundle.id)
      acc.push({ key: item.bundle.id, el: 'bundle', group: items.filter(i => i.bundle?.id === item.bundle!.id) })
    } else {
      acc.push({ key: item.product.id, el: 'item', item })
    }
    return acc
  }, [])

  // Opción de respaldo para quien no quiere crear cuenta — arma el pedido
  // completo en un mensaje estructurado y lo manda directo a WhatsApp.
  const handleWhatsApp = () => {
    const lines = items.map(i => `• ${i.product.name} ×${i.quantity} — S/ ${(Number(i.product.salePrice) * i.quantity).toFixed(2)}`)
    const greeting = customer ? `Hola ${BRAND_NAME}, soy ${customer.name}.` : `Hola ${BRAND_NAME}.`
    const msg = [
      greeting, '',
      'Quiero hacer este pedido:', '',
      ...lines, '',
      `*TOTAL: S/ ${total.toFixed(2)}*`, '',
      'Mi dirección: ',
      'Pago con (Yape o efectivo): ',
    ].join('\n')
    window.open(whatsappLink(msg), '_blank')
  }

  const handleCheckout = () => {
    closeCart()
    navigate('/checkout', overlayNav())
  }

  const handleClearCart = () => {
    if (window.confirm('¿Vaciar todo el carrito? Se quitarán todos los productos.')) clearCart()
  }

  useBackClose(isOpen, closeCart)

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-paper-ink/50" onClick={closeCart} />

      <div role="dialog" aria-modal="true" aria-label="Tu carrito"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-paper-bg flex flex-col">
        <div className="flex items-center justify-between pl-4 pr-2 h-16 bg-white border-b border-paper-line shrink-0">
          <h2 className="text-lg font-extrabold text-paper-ink">
            Tu carrito
            {items.length > 0 && <span className="ml-2 text-sm font-semibold text-paper-ink-soft">{items.length} {items.length === 1 ? 'producto' : 'productos'}</span>}
          </h2>
          <div className="flex items-center">
            {items.length > 0 && (
              <button onClick={handleClearCart} className="h-11 px-3 text-sm font-bold text-paper-ink-soft">Vaciar</button>
            )}
            <button onClick={closeCart} aria-label="Cerrar carrito" className="h-11 w-11 flex items-center justify-center rounded-full">
              <X className="h-6 w-6 text-paper-ink" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <ShoppingBag className="h-14 w-14 text-paper-ink-soft mb-4" aria-hidden="true" />
              <p className="text-lg font-bold text-paper-ink">Aún no tienes productos</p>
              <p className="text-sm text-paper-ink-soft mt-1 mb-5">Busca lo que necesitas o mira las ofertas de la semana.</p>
              <button onClick={() => { closeCart(); navigate('/catalogo', overlayNav()) }}
                className="w-full h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold">
                Ver productos
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card divide-y divide-paper-line">
              {rows.map(row => row.el === 'bundle' && row.group ? (
                <BundleRow key={row.key} group={row.group} onRemove={() => removeBundle(row.key)} />
              ) : row.item ? (
                <div key={row.key} className="flex gap-3 p-3">
                  {row.item.product.imageUrl ? (
                    <img src={thumb(row.item.product.imageUrl, 160)} alt="" loading="lazy" decoding="async" width={64} height={64}
                      className="h-16 w-16 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-paper-surface shrink-0 flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6 text-paper-ink-ghost" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[15px] text-paper-ink line-clamp-2 leading-tight">{row.item.product.name}</p>
                      <span className="text-paper-ink font-extrabold text-base tabular-nums shrink-0">
                        S/ {(Number(row.item.product.salePrice) * row.item.quantity).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-paper-ink-soft text-sm mt-0.5">S/ {Number(row.item.product.salePrice).toFixed(2)} {row.item.product.isBulk ? `por ${row.item.product.bulkUnit ?? 'kg'}` : 'c/u'}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      {row.item.product.isBulk ? (
                        <span className="text-sm font-bold text-paper-ink">{row.item.quantity} {row.item.product.bulkUnit ?? 'kg'}</span>
                      ) : (
                        <div className="flex items-center bg-paper-surface rounded-xl h-11">
                          <button onClick={() => updateQuantity(row.item!.product.id, row.item!.quantity - 1)} aria-label={`Quitar uno de ${row.item.product.name}`}
                            className="h-11 w-11 flex items-center justify-center">
                            <Minus className="h-4 w-4 text-paper-ink" />
                          </button>
                          <span className="w-7 text-center text-base font-extrabold text-paper-ink tabular-nums">{row.item.quantity}</span>
                          <button onClick={() => updateQuantity(row.item!.product.id, row.item!.quantity + 1)} aria-label={`Agregar uno más de ${row.item.product.name}`}
                            className="h-11 w-11 flex items-center justify-center">
                            <Plus className="h-4 w-4 text-paper-ink" />
                          </button>
                        </div>
                      )}
                      <button onClick={() => removeItem(row.item!.product.id)} aria-label={`Quitar ${row.item.product.name} del carrito`}
                        className="h-11 w-11 flex items-center justify-center text-paper-ink-soft">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null)}
            </div>
          )}

          {upsellProducts.length > 0 && (
            <div className="mt-5">
              <p className="font-extrabold text-base text-paper-ink mb-2.5">¿Se te olvidó algo?</p>
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
                {upsellProducts.map(p => (
                  <button key={p.id} onClick={() => addItem(p)} aria-label={`Agregar ${p.name}`}
                    className="shrink-0 w-28 bg-white rounded-2xl shadow-card p-2 text-left">
                    <div className="h-16 rounded-xl bg-paper-surface overflow-hidden mb-1.5 flex items-center justify-center">
                      {p.imageUrl
                        ? <img src={thumb(p.imageUrl, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        : <ShoppingBag className="h-5 w-5 text-paper-ink-ghost" aria-hidden="true" />}
                    </div>
                    <p className="text-[13px] font-semibold text-paper-ink line-clamp-2 leading-tight min-h-[2.4em]">{p.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-extrabold text-paper-ink tabular-nums">S/ {Number(p.salePrice).toFixed(2)}</span>
                      <span className="h-7 w-7 rounded-lg bg-brand-green-600 text-white flex items-center justify-center"><Plus className="h-4 w-4" /></span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="bg-white border-t border-paper-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2.5 shrink-0">
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold text-paper-ink">Total de productos</span>
              <span className="text-2xl font-extrabold text-paper-ink tabular-nums">{money(total)}</span>
            </div>
            <p className="text-sm text-paper-ink-soft">Envío desde {money(DELIVERY.costFrom)} en {DELIVERY.zoneName}. Recoger en tienda no cuesta.</p>
            <button onClick={handleCheckout}
              className="w-full h-[52px] rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold text-base">
              Hacer pedido
            </button>
            <button onClick={handleWhatsApp}
              className="w-full h-12 rounded-xl bg-[#25D366] text-[#0B3B1E] font-bold text-base flex items-center justify-center gap-2">
              <WhatsAppIcon className="h-5 w-5" />Pedir por WhatsApp
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// Una fila por paquete/combo, no por producto, y sin +/- suelto: el precio
// por unidad ahí dentro es solo un promedio del paquete. Para cambiar la
// mezcla hay que quitar el paquete y volver a elegirlo desde la oferta.
function BundleRow({ group, onRemove }: { group: CartItem[]; onRemove: () => void }) {
  const bundle = group[0].bundle!
  const totalQty = group.reduce((s, i) => s + i.quantity, 0)
  const breakdown = group.map(i => `${i.quantity}× ${i.product.name}`).join(' · ')
  return (
    <div className="flex gap-3 p-3">
      <div className="h-16 w-16 rounded-xl bg-brand-sun-100 shrink-0 flex items-center justify-center">
        <PackageCheck className="h-6 w-6 text-brand-sun-900" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-[15px] text-paper-ink leading-tight">{bundle.label}</p>
          <span className="text-paper-ink font-extrabold text-base tabular-nums shrink-0">S/ {bundle.totalPrice.toFixed(2)}</span>
        </div>
        <p className="text-paper-ink-soft text-sm mt-0.5 line-clamp-2">{breakdown}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs font-extrabold text-brand-sun-900 bg-brand-sun-400 px-2 py-0.5 rounded-lg">
            Oferta · {totalQty} unidades
          </span>
          <button onClick={onRemove} aria-label={`Quitar ${bundle.label} del carrito`}
            className="h-11 w-11 flex items-center justify-center text-paper-ink-soft">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
