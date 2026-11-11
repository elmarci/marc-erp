import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { Clock, Plus, ShoppingBag, Tag, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { storeApi, type Offer } from '../api'
import { useCartStore } from '../cartStore'
import { AddOfferModal, autoAddPack, canAutoAddPack, getPackInfo } from '../components/AddOfferModal'
import { flyToCart } from '../lib/flyToCart'
import { money } from '../lib/storeInfo'
import { dealText } from '../lib/offers'

// Ofertas en una sola lista, sin hojas ni pasos intermedios: cada tarjeta
// dice qué es la promo, cuánto cuesta y se agrega con un toque.
//  - Descuento (% o monto): se listan sus productos con precio antes/ahora
//    y un "+" verde por producto.
//  - Paquete (3×2, "3 por S/ 15", combo): un solo botón verde; si hay que
//    elegir variantes abre el selector de siempre (AddOfferModal).

type OfferProduct = Offer['products'][0]['product']
const isDiscountOffer = (o: Offer) => o.type === 'PERCENTAGE_DISCOUNT' || o.type === 'FIXED_DISCOUNT'

function discounted(price: number, offer: Offer) {
  if (offer.type === 'PERCENTAGE_DISCOUNT') return Math.round(price * (1 - offer.value / 100) * 100) / 100
  if (offer.type === 'FIXED_DISCOUNT') return Math.max(0, Math.round((price - offer.value) * 100) / 100)
  return price
}

function Thumb({ src, size }: { src: string | null; size: string }) {
  return (
    <div className={`${size} shrink-0 rounded-lg overflow-hidden flex items-center justify-center ${src ? 'bg-white' : 'bg-paper-surface'}`}>
      {src
        ? <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
        : <ShoppingBag className="h-6 w-6 text-paper-ink-ghost" aria-hidden="true" />}
    </div>
  )
}

function OfferCard({ offer, onChoose }: { offer: Offer; onChoose: () => void }) {
  const { addItem, addBundle } = useCartStore()
  const [showAll, setShowAll] = useState(false)
  const discount = isDiscountOffer(offer)
  const pack = getPackInfo(offer)
  const image = offer.storeImage ?? offer.products[0]?.product.imageUrl ?? null
  const visible = showAll ? offer.products : offer.products.slice(0, 3)

  const addDiscounted = (product: OfferProduct) => {
    const original = Number(product.salePrice)
    const final = discounted(original, offer)
    const savings = Math.round((original - final) * 100) / 100
    addItem({
      id: product.id, name: product.name, salePrice: final, currentStock: 99,
      imageUrl: product.imageUrl, barcode: null,
      description: savings > 0 ? `Descuento: ahorras S/ ${savings.toFixed(2)}` : null,
      category: { id: '', name: '' },
    })
    flyToCart()
  }

  const addPack = () => {
    if (canAutoAddPack(offer)) {
      autoAddPack(offer, addBundle)
      flyToCart()
      toast.success('Paquete agregado')
      return
    }
    onChoose()
  }

  return (
    <article className="bg-white rounded-2xl shadow-card p-3 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Thumb src={image} size="h-[72px] w-[72px]" />
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <h2 className="text-[15px] font-bold text-paper-ink leading-snug line-clamp-2">{offer.name}</h2>
          <span className="self-start bg-brand-sun-400 text-brand-sun-900 text-sm font-extrabold px-2 py-0.5 rounded-md">{dealText(offer)}</span>
          {offer.endDate && (
            <p className="text-xs text-paper-ink-soft flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
            </p>
          )}
        </div>
      </div>

      {offer.description && <p className="text-sm text-paper-ink-soft leading-snug">{offer.description}</p>}

      {discount && offer.products.length > 0 && (
        <ul className="border-t border-paper-line divide-y divide-paper-line -mb-1">
          {visible.map(({ product }) => {
            const original = Number(product.salePrice)
            return (
              <li key={product.id} className="flex items-center gap-3 py-2">
                <Thumb src={product.imageUrl} size="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-paper-ink leading-snug line-clamp-2">{product.name}</p>
                  <p className="tabular-nums leading-tight">
                    <span className="text-base font-extrabold text-paper-ink">{money(discounted(original, offer))}</span>{' '}
                    <span className="text-xs text-paper-ink-soft line-through">{money(original)}</span>
                  </p>
                </div>
                <button onClick={() => addDiscounted(product)} aria-label={`Agregar ${product.name} con descuento`}
                  className="h-11 w-11 shrink-0 rounded-xl bg-brand-green-600 active:bg-brand-green-700 text-white flex items-center justify-center">
                  <Plus className="h-5 w-5" />
                </button>
              </li>
            )
          })}
          {offer.products.length > 3 && !showAll && (
            <li>
              <button onClick={() => setShowAll(true)} className="w-full h-11 text-sm font-bold text-brand-blue-600">
                Ver los {offer.products.length} productos
              </button>
            </li>
          )}
        </ul>
      )}

      {!discount && offer.products.length > 0 && (
        <>
          {offer.products.length > 1 && (
            <p className="text-sm text-paper-ink-soft leading-snug">
              <span className="font-semibold text-paper-ink">Incluye:</span>{' '}
              {offer.products.map(p => p.product.name).join(', ')}.
            </p>
          )}
          <button onClick={addPack}
            className="w-full h-[46px] rounded-xl bg-brand-green-600 active:bg-brand-green-700 text-white font-bold text-[15px] flex items-center justify-center gap-1.5">
            {canAutoAddPack(offer) ? 'Agregar paquete' : 'Elegir y agregar'}
            {pack && <span className="font-extrabold tabular-nums">· {money(pack.totalPrice)}</span>}
          </button>
        </>
      )}

      {offer.products.length === 0 && (
        <Link to="/catalogo" className="h-11 flex items-center justify-center text-sm font-bold text-brand-blue-600">Ver productos</Link>
      )}
    </article>
  )
}

export function OffersPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['store-offers'],
    queryFn: () => storeApi.getOffers(),
    refetchInterval: 60000,
  })
  const offers = data?.data.data ?? []
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [chooseOffer, setChooseOffer] = useState<Offer | null>(null)

  // Filtros por categoría, sacados de los productos reales de cada oferta.
  const chips = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const offer of offers) {
      const seen = new Set<string>()
      for (const { product } of offer.products) {
        if (!product.category || seen.has(product.category.id)) continue
        seen.add(product.category.id)
        const entry = map.get(product.category.id) ?? { ...product.category, count: 0 }
        entry.count += 1
        map.set(product.category.id, entry)
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [offers])

  const filtered = categoryId
    ? offers.filter(o => o.products.some(({ product }) => product.category?.id === categoryId))
    : offers
  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-sm font-bold border ${active ? 'bg-brand-blue-600 border-brand-blue-600 text-white' : 'bg-white border-paper-line text-paper-ink'}`

  return (
    <main className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-6">
      <div className="flex items-baseline gap-2">
        <h1 className="text-[22px] font-extrabold text-paper-ink">Ofertas</h1>
        {offers.length > 0 && <span className="text-sm text-paper-ink-soft">{filtered.length} {filtered.length === 1 ? 'promoción' : 'promociones'}</span>}
      </div>

      {chips.length > 1 && (
        <div className="flex overflow-x-auto no-scrollbar gap-2 mt-3 -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por categoría">
          <button onClick={() => setCategoryId(null)} aria-pressed={!categoryId} className={chip(!categoryId)}>Todas</button>
          {chips.map(c => (
            <button key={c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)} aria-pressed={categoryId === c.id} className={chip(categoryId === c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4 mt-4 items-start">
        {isLoading && [1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl shadow-card h-40 animate-pulse" aria-hidden="true" />)}
        {filtered.map(offer => <OfferCard key={offer.id} offer={offer} onChoose={() => setChooseOffer(offer)} />)}
      </div>

      {isError && (
        <div className="bg-white rounded-2xl shadow-card p-6 text-center mt-4">
          <WifiOff className="h-8 w-8 mx-auto mb-3 text-paper-ink-soft" aria-hidden="true" />
          <p className="font-bold text-paper-ink">No pudimos cargar las ofertas</p>
          <p className="text-sm text-paper-ink-soft mt-1 mb-4">Revisa tu conexión y vuelve a intentar.</p>
          <button onClick={() => refetch()} className="w-full h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold">Reintentar</button>
        </div>
      )}

      {!isLoading && !isError && offers.length === 0 && (
        <div className="bg-white rounded-2xl shadow-card p-6 text-center mt-4">
          <Tag className="h-8 w-8 mx-auto mb-3 text-paper-ink-soft" aria-hidden="true" />
          <p className="font-bold text-paper-ink">Hoy no hay ofertas activas</p>
          <p className="text-sm text-paper-ink-soft mt-1 mb-4">Vuelve pronto. Mientras tanto, mira todo el catálogo.</p>
          <Link to="/catalogo" className="h-12 rounded-xl bg-brand-blue-600 text-white font-bold flex items-center justify-center">Ver productos</Link>
        </div>
      )}

      {!isLoading && offers.length > 0 && filtered.length === 0 && (
        <p className="text-center text-paper-ink-soft py-10">No hay ofertas en esta categoría por ahora.</p>
      )}

      <AnimatePresence>
        {chooseOffer && <AddOfferModal offer={chooseOffer} onClose={() => setChooseOffer(null)} />}
      </AnimatePresence>
    </main>
  )
}
