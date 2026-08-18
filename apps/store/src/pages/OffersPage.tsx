import { useQuery } from '@tanstack/react-query'
import { Tag, ShoppingCart, Clock, Package } from 'lucide-react'
import { storeApi, type Offer } from '../api'
import { useCartStore } from '../cartStore'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

function getDiscountedPrice(originalPrice: number, offer: Offer): number {
  if (offer.type === 'PERCENTAGE_DISCOUNT') {
    return Math.round(originalPrice * (1 - offer.value / 100) * 100) / 100
  }
  if (offer.type === 'FIXED_DISCOUNT') {
    return Math.max(0, Math.round((originalPrice - offer.value) * 100) / 100)
  }
  return originalPrice
}

function getBuyXGetYPrice(originalPrice: number, offer: Offer): { pricePerUnit: number; totalUnits: number; paidUnits: number } {
  // e.g. BUY 2 GET 3: pay for 2, receive 3
  const paidUnits = offer.buyQuantity ?? 2
  const totalUnits = offer.getQuantity ?? 3
  const pricePerUnit = Math.round((originalPrice * paidUnits / totalUnits) * 100) / 100
  return { pricePerUnit, totalUnits, paidUnits }
}

function OfferCard({ offer, accent = 'green' }: { offer: Offer; accent?: 'green' | 'blue' }) {
  const { addItem, openCart } = useCartStore()
  // El badge grande del tipo de oferta ("20% OFF", "Lleva 3 paga 2") alterna
  // verde/azul entre tarjetas para que la grilla de ofertas no lea monocroma —
  // el borde en hover se mantiene azul en todas, igual que ProductCard.
  const accentText = accent === 'green' ? 'text-brand-green-700' : 'text-brand-blue-700'
  const accentGradient = accent === 'green' ? 'from-brand-green-50 to-white' : 'from-brand-blue-50 to-white'

  const handleAdd = (product: Offer['products'][0]['product']) => {
    const originalPrice = Number(product.salePrice)

    // Ofertas de tipo pack/bundle (BUY_X_GET_Y o BUNDLE_PRICE)
    if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
      const paidUnits = offer.buyQuantity ?? 2
      const totalUnits = offer.getQuantity ?? 3
      // Precio exacto: paidUnits × precio unitario — sin dividir entre totalUnits
      const bundlePrice = offer.type === 'BUNDLE_PRICE'
        ? Number(offer.value)
        : Math.round(originalPrice * paidUnits * 100) / 100 // 2×5.20=10.40 exacto

      const label = offer.storeBadge ?? `Pack ${totalUnits}×${paidUnits}`

      addItem({
        id: `bundle-${offer.id}-${product.id}`,
        name: `${product.name} — ${label}`,
        salePrice: bundlePrice,
        currentStock: 99,
        imageUrl: product.imageUrl,
        barcode: null,
        description: `Llevas ${totalUnits} · precio normal S/ ${(originalPrice * totalUnits).toFixed(2)}`,
        category: { id: '', name: '' },
      }, 1)
      toast.success(`${label} de ${product.name} agregado al carrito`, {
        description: `S/ ${bundlePrice.toFixed(2)} total`,
        action: { label: 'Ver carrito', onClick: openCart },
      })
      return
    }

    // Descuento simple (% o monto fijo)
    const finalPrice = getDiscountedPrice(originalPrice, offer)
    const savings = Math.round((originalPrice - finalPrice) * 100) / 100
    addItem({
      id: product.id,
      name: product.name,
      salePrice: finalPrice,
      currentStock: 99,
      imageUrl: product.imageUrl,
      barcode: null,
      description: savings > 0 ? `Descuento: ahorras S/ ${savings.toFixed(2)}` : null,
      category: { id: '', name: '' },
    })
    toast.success(`${product.name} agregado con descuento`, {
      description: savings > 0 ? `Precio normal S/ ${originalPrice.toFixed(2)} · Ahorras S/ ${savings.toFixed(2)}` : undefined,
      action: { label: 'Ver carrito', onClick: openCart },
    })
  }

  const getOfferBadgeText = () => {
    if (offer.type === 'PERCENTAGE_DISCOUNT') return `${offer.value}% OFF`
    if (offer.type === 'FIXED_DISCOUNT') return `S/ ${offer.value} OFF`
    if (offer.type === 'BUY_X_GET_Y') {
      const b = offer.buyQuantity ?? 2, g = offer.getQuantity ?? 3
      return `${g}×${b} — Lleva ${g} paga ${b}`
    }
    return 'Precio especial'
  }

  return (
    <div className="bg-white border border-paper-line hover:border-brand-blue-200 hover:shadow-md rounded-2xl shadow-sm overflow-hidden transition-all">
      {/* Header oferta */}
      <div className={`relative bg-gradient-to-r ${accentGradient} p-5 border-b border-paper-line`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-black text-lg text-paper-ink">{offer.name}</h3>
            {offer.description && <p className="text-sm text-paper-ink-soft mt-0.5">{offer.description}</p>}
          </div>
          {offer.storeBadge && (
            <span className="shrink-0 bg-brand-magenta-500 text-white text-xs font-black px-3 py-1 rounded-full">
              {offer.storeBadge}
            </span>
          )}
        </div>

        {/* Descripción visual de la oferta */}
        <div className="bg-white rounded-xl p-3 border border-paper-line">
          <p className={`font-black text-xl ${accentText}`}>{getOfferBadgeText()}</p>
          {offer.type === 'BUY_X_GET_Y' && (
            <p className="text-paper-ink-soft text-xs mt-1">
              Agrega {offer.getQuantity ?? 3} unidades al carrito — pagas solo {offer.buyQuantity ?? 2}
            </p>
          )}
          {(offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT') && (
            <p className="text-paper-ink-soft text-xs mt-1">Descuento aplicado automáticamente al agregar</p>
          )}
        </div>

        {offer.endDate && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-3">
            <Clock className="h-3.5 w-3.5" />
            Válido hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>

      {/* Productos de la oferta */}
      {offer.products.length > 0 && (
        <div className="p-4">
          <p className="text-xs text-paper-ink-ghost uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />Productos en esta oferta
          </p>
          <div className="space-y-2">
            {offer.products.map(({ product }) => {
              const original = Number(product.salePrice)
              const isBXGY = offer.type === 'BUY_X_GET_Y'
              const isDiscount = offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT'
              const finalPrice = isDiscount ? getDiscountedPrice(original, offer) : original
              const bxgy = isBXGY ? getBuyXGetYPrice(original, offer) : null

              return (
                <div key={product.id}
                  className="flex items-center gap-3 bg-paper-surface hover:bg-paper-line/40 rounded-xl p-3 transition-colors cursor-pointer"
                  onClick={() => handleAdd(product)}>
                  {/* Imagen */}
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name}
                      className="h-14 w-14 rounded-lg object-cover shrink-0 bg-white border border-paper-line" />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-paper-surface shrink-0 flex items-center justify-center">
                      <Tag className="h-5 w-5 text-paper-ink-ghost" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-paper-ink line-clamp-1">{product.name}</p>

                    {/* Precio según tipo de oferta — precio final siempre en negro
                        sólido (convención de ProductCard), el verde queda solo
                        para el badge del % de descuento. */}
                    {isDiscount && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-paper-ink-ghost line-through text-xs">S/ {original.toFixed(2)}</span>
                        <span className="text-paper-ink font-extrabold text-base">S/ {finalPrice.toFixed(2)}</span>
                        <span className="bg-brand-magenta-100 text-brand-magenta-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {offer.type === 'PERCENTAGE_DISCOUNT' ? `-${offer.value}%` : `-S/${offer.value}`}
                        </span>
                      </div>
                    )}

                    {isBXGY && bxgy && (
                      <div className="mt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-paper-ink-ghost text-xs">S/ {original.toFixed(2)} c/u</span>
                          <span className="text-paper-ink font-extrabold text-sm">
                            S/ {(bxgy.pricePerUnit * bxgy.totalUnits).toFixed(2)} el pack
                          </span>
                        </div>
                        <p className="text-paper-ink-ghost text-[11px]">
                          {bxgy.totalUnits} unidades · equivale a S/ {bxgy.pricePerUnit.toFixed(2)} c/u
                        </p>
                      </div>
                    )}

                    {!isDiscount && !isBXGY && (
                      <span className="text-paper-ink font-extrabold text-sm">S/ {original.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Botón agregar */}
                  <button className="h-10 w-10 bg-brand-green-600 hover:bg-brand-green-700 text-white rounded-full flex items-center justify-center transition-colors shrink-0">
                    <ShoppingCart className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {offer.products.length === 0 && (
        <div className="p-5 text-center">
          <p className="text-sm text-paper-ink-soft">Oferta válida en productos seleccionados</p>
          <Link to="/catalogo" className="inline-block mt-3 text-brand-blue-600 hover:text-brand-blue-700 text-sm font-medium transition-colors">
            Ver catálogo →
          </Link>
        </div>
      )}
    </div>
  )
}

export function OffersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
    refetchInterval: 60000,
  })

  const offers = data?.data.data ?? []

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 bg-brand-blue-100 border border-brand-blue-200 rounded-2xl flex items-center justify-center">
          <Tag className="h-6 w-6 text-brand-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-paper-ink">Ofertas especiales</h1>
          <p className="text-paper-ink-soft text-sm">Aprovecha nuestras promociones por tiempo limitado</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="bg-paper-surface rounded-2xl h-64 animate-pulse" />)}
        </div>
      )}

      {!isLoading && offers.length === 0 && (
        <div className="text-center py-20">
          <Tag className="h-16 w-16 mx-auto mb-4 text-paper-ink-ghost" />
          <p className="text-paper-ink-faint text-lg">No hay ofertas activas en este momento</p>
          <Link to="/" className="inline-block mt-6 bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold px-6 py-3 rounded-full shadow-md shadow-brand-green-600/20 text-sm transition-colors">
            Ver productos
          </Link>
        </div>
      )}

      {!isLoading && offers.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-5">
          {offers.map((offer, i) => <OfferCard key={offer.id} offer={offer} accent={i % 2 === 0 ? 'green' : 'blue'} />)}
        </div>
      )}
    </main>
  )
}
