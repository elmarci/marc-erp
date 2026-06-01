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

function OfferCard({ offer }: { offer: Offer }) {
  const { addItem, openCart } = useCartStore()

  const handleAdd = (product: Offer['products'][0]['product']) => {
    const originalPrice = Number(product.salePrice)

    if (offer.type === 'BUY_X_GET_Y') {
      // Add as a bundle: totalUnits items at reduced price each
      const { pricePerUnit, totalUnits, paidUnits } = getBuyXGetYPrice(originalPrice, offer)
      addItem({
        id: product.id,
        name: `${product.name} (Pack ${totalUnits}x${paidUnits})`,
        salePrice: pricePerUnit,
        currentStock: 99,
        imageUrl: product.imageUrl,
        barcode: null,
        description: null,
        category: { id: '', name: '' },
      }, totalUnits)
      toast.success(`Pack ${totalUnits}x${paidUnits} de ${product.name} agregado`, {
        description: `${totalUnits} unidades por el precio de ${paidUnits} · S/ ${(pricePerUnit * totalUnits).toFixed(2)}`,
        action: { label: 'Ver carrito', onClick: openCart },
      })
      return
    }

    const finalPrice = getDiscountedPrice(originalPrice, offer)
    addItem({
      id: product.id,
      name: offer.storeBadge ? `${product.name} (${offer.storeBadge})` : product.name,
      salePrice: finalPrice,
      currentStock: 99,
      imageUrl: product.imageUrl,
      barcode: null,
      description: null,
      category: { id: '', name: '' },
    })

    const savings = originalPrice - finalPrice
    toast.success(`${product.name} agregado con descuento`, {
      description: savings > 0 ? `Ahorras S/ ${savings.toFixed(2)}` : undefined,
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
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 hover:border-green-500/30 rounded-2xl overflow-hidden transition-all">
      {/* Header oferta */}
      <div className="relative bg-gradient-to-r from-green-500/20 to-green-900/10 p-5 border-b border-white/5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-black text-lg text-white">{offer.name}</h3>
            {offer.description && <p className="text-sm text-white/50 mt-0.5">{offer.description}</p>}
          </div>
          {offer.storeBadge && (
            <span className="shrink-0 bg-green-500 text-black text-xs font-black px-3 py-1 rounded-full">
              {offer.storeBadge}
            </span>
          )}
        </div>

        {/* Descripción visual de la oferta */}
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <p className="text-green-400 font-black text-xl">{getOfferBadgeText()}</p>
          {offer.type === 'BUY_X_GET_Y' && (
            <p className="text-white/50 text-xs mt-1">
              Agrega {offer.getQuantity ?? 3} unidades al carrito — pagas solo {offer.buyQuantity ?? 2}
            </p>
          )}
          {(offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT') && (
            <p className="text-white/50 text-xs mt-1">Descuento aplicado automáticamente al agregar</p>
          )}
        </div>

        {offer.endDate && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-3">
            <Clock className="h-3.5 w-3.5" />
            Válido hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>

      {/* Productos de la oferta */}
      {offer.products.length > 0 && (
        <div className="p-4">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
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
                  className="flex items-center gap-3 bg-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => handleAdd(product)}>
                  {/* Imagen */}
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name}
                      className="h-14 w-14 rounded-xl object-cover shrink-0 bg-zinc-800" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-white/10 shrink-0 flex items-center justify-center">
                      <Tag className="h-5 w-5 text-white/20" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white line-clamp-1">{product.name}</p>

                    {/* Precio según tipo de oferta */}
                    {isDiscount && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/30 line-through text-xs">S/ {original.toFixed(2)}</span>
                        <span className="text-green-400 font-black text-base">S/ {finalPrice.toFixed(2)}</span>
                        <span className="bg-green-500/10 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {offer.type === 'PERCENTAGE_DISCOUNT' ? `-${offer.value}%` : `-S/${offer.value}`}
                        </span>
                      </div>
                    )}

                    {isBXGY && bxgy && (
                      <div className="mt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-white/30 text-xs">S/ {original.toFixed(2)} c/u</span>
                          <span className="text-green-400 font-black text-sm">
                            S/ {(bxgy.pricePerUnit * bxgy.totalUnits).toFixed(2)} el pack
                          </span>
                        </div>
                        <p className="text-white/40 text-[11px]">
                          {bxgy.totalUnits} unidades · equivale a S/ {bxgy.pricePerUnit.toFixed(2)} c/u
                        </p>
                      </div>
                    )}

                    {!isDiscount && !isBXGY && (
                      <span className="text-green-400 font-bold text-sm">S/ {original.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Botón agregar */}
                  <button className="h-10 w-10 bg-green-500 hover:bg-green-400 text-black rounded-full flex items-center justify-center transition-colors shrink-0">
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
          <p className="text-sm text-white/40">Oferta válida en productos seleccionados</p>
          <Link to="/catalogo" className="inline-block mt-3 text-green-400 hover:text-green-300 text-sm font-medium transition-colors">
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
        <div className="h-12 w-12 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center">
          <Tag className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Ofertas especiales</h1>
          <p className="text-white/40 text-sm">Aprovecha nuestras promociones por tiempo limitado</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="bg-zinc-900 rounded-2xl h-64 animate-pulse" />)}
        </div>
      )}

      {!isLoading && offers.length === 0 && (
        <div className="text-center py-20">
          <Tag className="h-16 w-16 mx-auto mb-4 text-white/10" />
          <p className="text-white/40 text-lg">No hay ofertas activas en este momento</p>
          <Link to="/" className="inline-block mt-6 bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-3 rounded-full text-sm transition-colors">
            Ver productos
          </Link>
        </div>
      )}

      {!isLoading && offers.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-5">
          {offers.map(offer => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      )}
    </main>
  )
}
