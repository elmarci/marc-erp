import { useQuery } from '@tanstack/react-query'
import { Tag, ShoppingCart, Clock } from 'lucide-react'
import { storeApi, type Offer } from '../api'
import { useCartStore } from '../cartStore'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: '% Descuento',
  FIXED_DISCOUNT: 'S/ Descuento',
  BUY_X_GET_Y: 'Lleva más paga menos',
  BUNDLE_PRICE: 'Precio especial',
  HAPPY_HOUR: 'Hora feliz',
}

function OfferCard({ offer }: { offer: Offer }) {
  const { addItem, openCart } = useCartStore()

  const handleAdd = (product: Offer['products'][0]['product']) => {
    addItem({
      id: product.id,
      name: product.name,
      salePrice: product.salePrice,
      currentStock: 99,
      imageUrl: product.imageUrl,
      barcode: null,
      description: null,
      category: { id: '', name: '' },
    })
    toast.success(`${product.name} agregado`, {
      action: { label: 'Ver carrito', onClick: openCart },
    })
  }

  const discountText =
    offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.value}% OFF` :
    offer.type === 'FIXED_DISCOUNT' ? `S/ ${offer.value} OFF` :
    offer.type === 'BUY_X_GET_Y' ? 'Oferta especial' :
    `Precio paquete`

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 hover:border-green-500/30 rounded-2xl overflow-hidden transition-all group">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-green-500/20 to-green-900/10 p-5 border-b border-white/5">
        {offer.storeImage && (
          <img src={offer.storeImage} alt={offer.name}
            className="absolute inset-0 w-full h-full object-cover opacity-10" />
        )}
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-xl text-white">{offer.name}</h3>
            {offer.description && <p className="text-sm text-white/60 mt-1">{offer.description}</p>}
          </div>
          {offer.storeBadge && (
            <span className="shrink-0 bg-green-500 text-black text-xs font-black px-3 py-1.5 rounded-full">
              {offer.storeBadge}
            </span>
          )}
        </div>
        <div className="relative mt-3 flex items-center gap-3">
          <span className="text-2xl font-black text-green-400">{discountText}</span>
          <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded-full">{TYPE_LABELS[offer.type] ?? offer.type}</span>
        </div>
        {offer.endDate && (
          <div className="relative mt-2 flex items-center gap-1.5 text-xs text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Válido hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}</span>
          </div>
        )}
      </div>

      {/* Products */}
      {offer.products.length > 0 && (
        <div className="p-4">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3 font-semibold">Productos en oferta</p>
          <div className="space-y-2">
            {offer.products.map(({ product }) => (
              <div key={product.id} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 hover:bg-white/8 transition-colors">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name}
                    className="h-12 w-12 rounded-lg object-cover shrink-0 bg-zinc-800" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white/10 shrink-0 flex items-center justify-center">
                    <Tag className="h-5 w-5 text-white/20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                  <p className="text-green-400 font-bold text-sm">S/ {product.salePrice.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => handleAdd(product)}
                  className="h-9 w-9 bg-green-500 hover:bg-green-400 text-black rounded-full flex items-center justify-center transition-colors shrink-0">
                  <ShoppingCart className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {offer.products.length === 0 && (
        <div className="p-4 text-center">
          <p className="text-sm text-white/40">Oferta válida en toda la tienda</p>
          <Link to="/catalogo" className="inline-block mt-3 text-green-400 hover:text-green-300 text-sm font-medium transition-colors">
            Ver productos →
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center">
          <Tag className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Ofertas especiales</h1>
          <p className="text-white/50 text-sm">Aprovecha nuestras promociones por tiempo limitado</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-zinc-900 rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && offers.length === 0 && (
        <div className="text-center py-20">
          <Tag className="h-16 w-16 mx-auto mb-4 text-white/10" />
          <p className="text-white/40 text-lg">No hay ofertas activas en este momento</p>
          <p className="text-white/30 text-sm mt-2">Vuelve pronto para ver nuestras promociones</p>
          <Link to="/" className="inline-block mt-6 bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-3 rounded-full text-sm transition-colors">
            Ver productos
          </Link>
        </div>
      )}

      {!isLoading && offers.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-5">
          {offers.map(offer => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </main>
  )
}
