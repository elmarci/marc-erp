import { useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronRight, ShoppingCart, ShoppingBag, Plus, Minus, Scale, Home } from 'lucide-react'
import { storeApi } from '../api'
import { useCartStore } from '../cartStore'
import { ProductCard } from '../components/ProductCard'
import { flyToCart } from '../lib/flyToCart'
import { toast } from 'sonner'

/* ── Precio principal — antes tenía un efecto "plancha de imprenta" con 3
   copias desalineadas en amarillo/magenta/verde (mix-blend-multiply). Con la
   paleta nueva, más blanca y con precios en negro sólido en toda la tienda
   (ver ProductCard), ese efecto quedaba fuera de tono — se simplifica a un
   precio grande en negro con una entrada suave, igual de "de imprenta" en
   el peso tipográfico pero alineado al resto del sitio. ─────────────── */
function PricePlate({ price }: { price: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="text-3xl sm:text-4xl font-black text-paper-ink tabular-nums"
    >
      S/ {price}
    </motion.span>
  )
}

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
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-paper-ink-ghost" />
        <p className="text-paper-ink-soft mb-6">Producto no encontrado</p>
        <Link to="/catalogo" className="bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold px-6 py-3 rounded-full text-sm transition-colors">
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
    toast.success(`${product.name} agregado`, { action: { label: 'Ver carrito', onClick: openCart } })
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
    toast.success(`${product.name} agregado`, { action: { label: 'Ver carrito', onClick: openCart } })
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-1.5 text-sm text-paper-ink-soft mb-6">
        <Link to="/" className="hover:text-brand-green-600 transition-colors flex items-center gap-1"><Home className="h-3.5 w-3.5" />Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost" />
        {product.category.parent && (
          <>
            <Link to={`/catalogo?categoryId=${product.category.parent.id}`} className="hover:text-brand-green-600 transition-colors">
              {product.category.parent.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost" />
          </>
        )}
        <Link to={`/catalogo?categoryId=${product.category.id}`} className="hover:text-brand-green-600 transition-colors">
          {product.category.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-paper-ink-ghost" />
        <span className="text-paper-ink font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-10">
        {/* Imagen */}
        <div className="relative aspect-square bg-white border border-paper-line rounded-2xl shadow-sm overflow-hidden">
          {product.imageUrl
            ? <img ref={imgRef} src={product.imageUrl} alt={product.name} className="w-full h-full object-contain p-6" />
            : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-16 w-16 text-paper-ink-ghost" /></div>
          }
          {outOfStock && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="bg-paper-ink/80 text-white text-sm font-bold px-3 py-1.5 rounded-full">Agotado</span>
            </div>
          )}
        </div>

        {/* Detalle */}
        <div>
          <p className="text-sm text-brand-blue-600 font-medium mb-1">{product.category.name}</p>
          <h1 className="text-2xl sm:text-3xl font-black text-paper-ink mb-3">{product.name}</h1>

          {lowStock && (
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full mb-3">
              Últimas {product.currentStock} unidades
            </span>
          )}

          <div className="flex items-baseline gap-2 mb-6">
            <PricePlate price={product.salePrice.toFixed(2)} />
            {product.isBulk && <span className="text-paper-ink-faint text-sm">/ {unit}</span>}
          </div>

          {product.description && (
            <p className="text-paper-ink-soft text-sm leading-relaxed mb-6">{product.description}</p>
          )}

          <div className="border-t border-paper-line pt-6">
            {outOfStock ? (
              <div className="bg-paper-surface text-paper-ink-soft text-center font-medium py-3.5 rounded-xl text-sm">
                Producto agotado
              </div>
            ) : product.isBulk ? (
              <div className="space-y-3">
                {isWeighable && (
                  <div className="flex rounded-xl bg-paper-surface p-1 text-sm font-semibold max-w-xs">
                    <button onClick={() => setBulkMode('monto')}
                      className={`flex-1 rounded-lg py-1.5 transition-colors ${bulkMode === 'monto' ? 'bg-white shadow-sm text-paper-ink' : 'text-paper-ink-ghost'}`}>
                      Por monto (S/)
                    </button>
                    <button onClick={() => setBulkMode('peso')}
                      className={`flex-1 rounded-lg py-1.5 transition-colors ${bulkMode === 'peso' ? 'bg-white shadow-sm text-paper-ink' : 'text-paper-ink-ghost'}`}>
                      Por peso
                    </button>
                  </div>
                )}

                {effectiveBulkMode === 'monto' ? (
                  <>
                    <label className="text-sm text-paper-ink-soft block">¿Cuánto quieres gastar?</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-paper-ink-ghost">S/</span>
                        <input type="number" min={0.5} step={0.5} value={bulkAmount}
                          onChange={e => setBulkAmount(e.target.value)} placeholder="Ej: 10"
                          className="w-full bg-paper-surface border border-paper-line focus:border-brand-green-400 rounded-xl pl-11 pr-4 py-3 text-lg font-bold text-paper-ink text-center outline-none transition-colors" />
                      </div>
                      <button onClick={handleAddBulk} disabled={!(finalBulkQty > 0)}
                        className="bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white font-bold px-6 rounded-xl shadow-sm shadow-brand-green-600/20 flex items-center gap-2 transition-colors">
                        <ShoppingCart className="h-4 w-4" />Agregar
                      </button>
                    </div>
                    {computedBulkQty > 0 && (
                      <p className="text-xs text-paper-ink-ghost">
                        Equivale aprox. a <span className="font-bold text-paper-ink-soft">{computedBulkQty} {unit}</span> — el peso final se ajusta al pesar en tienda.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <label className="text-sm text-paper-ink-soft block">
                      Cantidad ({unit}) <span className="text-paper-ink-ghost">· disponible: {product.currentStock} {unit}</span>
                    </label>
                    <div className="flex gap-3">
                      <input type="number" min={0.01} max={product.currentStock} step={0.01} value={bulkQty}
                        onChange={e => setBulkQty(e.target.value)} placeholder={`Ej: 0.5 ${unit}`}
                        className="flex-1 bg-paper-surface border border-paper-line focus:border-brand-green-400 rounded-xl px-4 py-3 text-lg font-bold text-paper-ink text-center outline-none transition-colors" />
                      <button onClick={handleAddBulk} disabled={!(finalBulkQty > 0)}
                        className="bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white font-bold px-6 rounded-xl shadow-sm shadow-brand-green-600/20 flex items-center gap-2 transition-colors">
                        <ShoppingCart className="h-4 w-4" />Agregar
                      </button>
                    </div>
                  </>
                )}

                {finalBulkQty > 0 && (
                  <p className="text-sm text-paper-ink-soft">Total: <span className="font-extrabold text-paper-ink">S/ {bulkTotal.toFixed(2)}</span></p>
                )}
              </div>
            ) : qty > 0 ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 border border-paper-line rounded-xl px-2 py-1.5">
                  <button onClick={() => updateQuantity(product.id, qty - 1)}
                    className="h-8 w-8 bg-paper-surface hover:bg-paper-line rounded-lg flex items-center justify-center transition-colors">
                    <Minus className="h-4 w-4 text-paper-ink-soft" />
                  </button>
                  <span className="w-8 text-center font-bold text-paper-ink">{qty}</span>
                  <button onClick={() => { addItem(product); flyToCart(imgRef.current) }} disabled={qty >= product.currentStock}
                    className="h-8 w-8 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-30 text-white rounded-lg flex items-center justify-center transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-sm text-paper-ink-ghost">en tu carrito</span>
              </div>
            ) : (
              <button onClick={handleAdd}
                className="w-full sm:w-auto bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold px-8 py-3.5 rounded-xl shadow-md shadow-brand-green-600/25 flex items-center justify-center gap-2 transition-colors">
                {product.isBulk ? <Scale className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                Agregar al carrito
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Productos similares */}
      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold text-paper-ink mb-6">Productos similares</h2>
          <div className="flex overflow-x-auto h-scroll no-scrollbar snap-x snap-mandatory gap-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
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
