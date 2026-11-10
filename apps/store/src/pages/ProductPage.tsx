import { useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ShoppingBag, Plus, Minus, Truck } from 'lucide-react'
import { storeApi } from '../api'
import { useCartStore } from '../cartStore'
import { ProductCard } from '../components/ProductCard'
import { flyToCart } from '../lib/flyToCart'
import { toast } from 'sonner'
import { WhatsAppIcon } from '../components/CartBar'
import { BRAND_NAME, DELIVERY, deliveryStatus, money, whatsappLink } from '../lib/storeInfo'

// Redondeo a gramo (o su equivalente) al calcular el peso desde un monto —
// evita arrastrar error de punto flotante (ej. 0.267000000004). Mismo valor
// que usa el POS y el BulkModal de ProductCard.
const BULK_WEIGHT_STEP = 0.001

export function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { addItem, updateQuantity, renameItem, items, openCart } = useCartStore()
  const [bulkMode, setBulkMode] = useState<'peso' | 'monto'>('monto')
  const [bulkQty, setBulkQty] = useState('')
  const [bulkAmount, setBulkAmount] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['store-product', id],
    queryFn: () => storeApi.getProduct(id!),
    enabled: !!id,
  })
  const product = data?.data.data

  const { data: similarData } = useQuery({
    queryKey: ['store-similar', product?.category.id, id],
    queryFn: () => storeApi.getProducts({ categoryId: product!.category.id, excludeId: id!, limit: 6 }),
    enabled: !!product,
  })
  const similar = similarData?.data.data ?? []

  const cartItem = items.find(i => i.product.id === id)
  const qty = cartItem?.quantity ?? 0

  if (isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-10 animate-pulse">
        <div className="grid md:grid-cols-2 gap-10">
          <div className="aspect-square bg-paper-surface rounded-2xl" />
          <div className="space-y-4">
            <div className="h-4 w-32 bg-paper-surface rounded" />
            <div className="h-8 w-3/4 bg-paper-surface rounded" />
            <div className="h-10 w-40 bg-paper-surface rounded" />
          </div>
        </div>
      </main>
    )
  }

  if (!product) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <ShoppingBag className="h-14 w-14 mx-auto mb-4 text-paper-ink-soft" aria-hidden="true" />
        <p className="text-lg font-bold text-paper-ink">Ya no tenemos este producto</p>
        <p className="text-sm text-paper-ink-soft mt-1 mb-5">Puede que se haya retirado del catálogo. Busca otro parecido.</p>
        <Link to="/catalogo" className="h-12 rounded-xl bg-brand-blue-600 text-white font-bold flex items-center justify-center">
          Ver catálogo
        </Link>
      </main>
    )
  }

  const outOfStock = product.currentStock <= 0
  const lowStock = !outOfStock && product.currentStock <= 5
  const unit = product.bulkUnit ?? 'kg'
  // Sólo tiene sentido "pedir por monto" en unidades que se pesan/miden de
  // verdad (kg, g, L) — quien compra a distancia no tiene forma de saber
  // cuánto pesa "un pecho de pollo", pero sí sabe cuánto quiere gastar.
  const isWeighable = unit === 'kg' || unit === 'g' || unit === 'L'
  // Para "unidad" (a granel por pieza suelta, no pesable) "por monto" no
  // aplica — el precio ya es exacto, así que se fuerza siempre "por peso"
  // sin mostrar el selector.
  const effectiveBulkMode = isWeighable ? bulkMode : 'peso'
  const bulkAmountNum = parseFloat(bulkAmount)
  const computedBulkQty = bulkAmountNum > 0 && product.salePrice > 0
    ? Number((Math.round((bulkAmountNum / product.salePrice) / BULK_WEIGHT_STEP) * BULK_WEIGHT_STEP).toFixed(3))
    : 0
  const finalBulkQty = effectiveBulkMode === 'monto' ? computedBulkQty : parseFloat(bulkQty || '0')
  const bulkTotal = (finalBulkQty > 0 ? finalBulkQty : 0) * product.salePrice

  const handleAddBulk = () => {
    const q = finalBulkQty
    if (!q || q <= 0) { toast.error(effectiveBulkMode === 'monto' ? 'Ingresa un monto válido' : 'Ingresa una cantidad válida'); return }
    const result = addItem({ ...product, name: `${product.name} (${q} ${unit})` }, q)
    if (result.addedQuantity <= 0) {
      toast.error(`No hay más stock disponible (máximo ${product.currentStock} ${unit}).`)
      return
    }
    if (result.finalQuantity !== q) renameItem(product.id, `${product.name} (${result.finalQuantity} ${unit})`)
    flyToCart(imgRef.current)
    setBulkQty('')
    setBulkAmount('')
  }

  const handleAdd = () => {
    const result = addItem(product)
    if (result.addedQuantity <= 0) {
      toast.error(`Ya tienes todo el stock disponible en el carrito (${product.currentStock}).`)
      return
    }
    flyToCart(imgRef.current)
  }

  const field = 'w-full h-[52px] bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl text-lg font-bold text-paper-ink text-center outline-none'
  const addBtn = 'h-[52px] rounded-xl bg-brand-green-600 active:bg-brand-green-700 disabled:opacity-40 text-white font-bold text-base flex items-center justify-center gap-2'

  return (
    <main className="max-w-5xl mx-auto px-4 pt-2 pb-6">
      <Link to={`/catalogo?categoryId=${product.category.id}`}
        className="inline-flex items-center gap-1 h-11 text-sm font-bold text-brand-blue-600">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />{product.category.name}
      </Link>

      <div className="grid md:grid-cols-2 gap-4 md:gap-10">
        <div className="relative aspect-square bg-white rounded-2xl shadow-card overflow-hidden">
          {product.imageUrl
            ? <img ref={imgRef} src={product.imageUrl} alt={product.name} width={600} height={600} className="w-full h-full object-contain p-4" />
            : <div className="w-full h-full flex items-center justify-center bg-paper-surface"><ShoppingBag className="h-16 w-16 text-paper-ink-ghost" aria-hidden="true" /></div>
          }
          {lowStock && !product.isBulk && (
            <span className="absolute top-3 left-3 bg-brand-sun-400 text-brand-sun-900 text-sm font-extrabold px-2.5 py-1 rounded-lg">
              {product.currentStock === 1 ? 'Última unidad' : `Últimas ${product.currentStock}`}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-[22px] sm:text-3xl font-extrabold text-paper-ink leading-tight">{product.name}</h1>
          <p className="mt-2 text-[32px] font-extrabold text-paper-ink tabular-nums leading-none">
            S/ {Number(product.salePrice).toFixed(2)}
            {product.isBulk && <span className="text-base font-semibold text-paper-ink-soft"> /{unit}</span>}
          </p>

          {product.description && (
            <p className="text-paper-ink-soft text-base leading-relaxed mt-4">{product.description}</p>
          )}

          <div className="mt-5">
            {outOfStock ? (
              <div className="bg-white rounded-2xl shadow-card p-4 text-center">
                <p className="font-bold text-paper-ink">Agotado por ahora</p>
                <p className="text-sm text-paper-ink-soft mt-1 mb-3">Escríbenos y te avisamos cuando llegue.</p>
                <a href={whatsappLink(`Hola ${BRAND_NAME}, ¿cuándo llega "${product.name}"?`)} target="_blank" rel="noopener noreferrer"
                  className="h-12 rounded-xl bg-[#25D366] text-[#0B3B1E] font-bold flex items-center justify-center gap-2">
                  <WhatsAppIcon className="h-5 w-5" />Preguntar por WhatsApp
                </a>
              </div>
            ) : product.isBulk ? (
              <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
                {isWeighable && (
                  <div className="flex rounded-xl bg-paper-surface p-1 text-[15px] font-bold" role="group" aria-label="Cómo quieres pedir">
                    <button onClick={() => setBulkMode('monto')} aria-pressed={bulkMode === 'monto'}
                      className={`flex-1 h-11 rounded-lg ${bulkMode === 'monto' ? 'bg-white shadow-card text-paper-ink' : 'text-paper-ink-soft'}`}>
                      Por monto (S/)
                    </button>
                    <button onClick={() => setBulkMode('peso')} aria-pressed={bulkMode === 'peso'}
                      className={`flex-1 h-11 rounded-lg ${bulkMode === 'peso' ? 'bg-white shadow-card text-paper-ink' : 'text-paper-ink-soft'}`}>
                      Por peso
                    </button>
                  </div>
                )}

                {effectiveBulkMode === 'monto' ? (
                  <>
                    <label htmlFor="bulk-amount" className="text-[15px] font-semibold text-paper-ink block">¿Cuánto quieres gastar?</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-paper-ink-soft">S/</span>
                      <input id="bulk-amount" type="number" inputMode="decimal" min={0.5} step={0.5} value={bulkAmount}
                        onChange={e => setBulkAmount(e.target.value)} placeholder="10" className={field} />
                    </div>
                    <div className="flex gap-2">
                      {['5', '10', '15', '20'].map(v => (
                        <button key={v} onClick={() => setBulkAmount(v)}
                          className={`flex-1 h-11 rounded-xl text-[15px] font-bold ${bulkAmount === v ? 'bg-brand-blue-600 text-white' : 'bg-paper-surface text-paper-ink'}`}>
                          S/ {v}
                        </button>
                      ))}
                    </div>
                    {computedBulkQty > 0 && (
                      <p className="text-sm text-paper-ink-soft">
                        Son unos <span className="font-bold text-paper-ink">{computedBulkQty} {unit}</span>. El peso final se ajusta al pesar en tienda.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <label htmlFor="bulk-qty" className="text-[15px] font-semibold text-paper-ink block">
                      Cantidad en {unit} <span className="font-normal text-paper-ink-soft">(hay {product.currentStock})</span>
                    </label>
                    <input id="bulk-qty" type="number" inputMode="decimal" min={0.01} max={product.currentStock} step={0.01} value={bulkQty}
                      onChange={e => setBulkQty(e.target.value)} placeholder="0.5" className={field} />
                  </>
                )}

                <button onClick={handleAddBulk} disabled={!(finalBulkQty > 0)} className={`${addBtn} w-full`}>
                  {finalBulkQty > 0 ? `Agregar · S/ ${bulkTotal.toFixed(2)}` : 'Agregar'}
                </button>
              </div>
            ) : qty > 0 ? (
              <div className="flex gap-2.5">
                <div className="flex items-center justify-between bg-brand-green-600 rounded-xl h-[52px] text-white w-36 shrink-0">
                  <button onClick={() => updateQuantity(product.id, qty - 1)} aria-label="Quitar uno"
                    className="h-[52px] w-12 flex items-center justify-center rounded-xl active:bg-brand-green-700">
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="text-lg font-extrabold tabular-nums" aria-live="polite">{qty}</span>
                  <button onClick={() => { addItem(product); flyToCart(imgRef.current) }} disabled={qty >= product.currentStock} aria-label="Agregar uno más"
                    className="h-[52px] w-12 flex items-center justify-center rounded-xl active:bg-brand-green-700 disabled:opacity-40">
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <button onClick={openCart}
                  className="flex-1 h-[52px] rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold text-base">
                  Ver carrito
                </button>
              </div>
            ) : (
              <button onClick={handleAdd} className={`${addBtn} w-full md:w-72`}>Agregar al carrito</button>
            )}
          </div>

          <div className="mt-4 bg-white rounded-2xl shadow-card px-3.5 py-3 flex items-center gap-3">
            <Truck className="h-5 w-5 text-brand-blue-600 shrink-0" aria-hidden="true" />
            <p className="text-sm text-paper-ink-soft leading-snug">
              <span className="font-bold text-paper-ink">{deliveryStatus().title}.</span>{' '}
              Envío desde {money(DELIVERY.costFrom)} en {DELIVERY.zoneName}.
            </p>
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-extrabold text-paper-ink mb-3">También te puede servir</h2>
          <div className="flex overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory gap-3 -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {similar.map(p => (
              <div key={p.id} className="shrink-0 w-40 snap-start sm:w-auto">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
