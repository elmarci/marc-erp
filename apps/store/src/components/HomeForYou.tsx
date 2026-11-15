import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { storeApi, type Category, type Product } from '../api'
import { useAuthStore } from '../authStore'
import { Ico } from './Ico'
import { ProductCard } from './ProductCard'
import { repeatOrder } from '../lib/repeatOrder'

/* ── Tarjeta personal ─────────────────────────────────────────────────
   Un solo mensaje según quién entra:
   - Invitado: invitación a crear la cuenta (beneficio concreto).
   - Con cuenta: sus puntos y, si ya compró, "Vuelve a pedir" en un toque. */
export function HomeForYou({ className = '' }: { className?: string }) {
  const { customer, isLoggedIn } = useAuthStore()

  const { data: profileData } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
    enabled: !!isLoggedIn,
  })
  const { data: ordersData } = useQuery({
    queryKey: ['my-orders', customer?.phone],
    queryFn: () => storeApi.myOrders(),
    enabled: !!isLoggedIn,
    staleTime: 60_000,
  })

  if (!isLoggedIn || !customer) {
    return (
      <section className={className} aria-label="Crea tu cuenta">
        <Link to="/ingresar" className="bg-brand-blue-600 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-white">
          <span className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Ico name="menu-puntos" className="h-7 w-7" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-[15px] leading-snug">Crea tu cuenta gratis</span>
            <span className="block text-[13px] text-white/85 leading-snug">Ganas puntos en cada compra y sigues tus pedidos.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>
      </section>
    )
  }

  const points = profileData?.data.data.loyaltyPoints ?? 0
  const lastOrder = (ordersData?.data.data ?? []).find(o => o.status === 'DELIVERED' && o.items.length > 0)
  const firstName = customer.name.split(' ')[0]

  return (
    <section className={className} aria-label="Para ti">
      <div className="bg-white rounded-2xl shadow-card divide-y divide-paper-line">
        <Link to="/mis-pedidos#canje" className="px-4 py-3 flex items-center gap-3">
          <Ico name="menu-puntos" className="h-9 w-9" />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-paper-ink leading-snug">Hola, {firstName}</span>
            <span className="block text-[13px] text-paper-ink-soft leading-snug">
              Tienes <strong className="text-paper-ink tabular-nums">{points}</strong> {points === 1 ? 'punto' : 'puntos'} para canjear al pagar
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-paper-ink-soft shrink-0" aria-hidden="true" />
        </Link>
        {lastOrder && (
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold text-paper-ink leading-snug">Vuelve a pedir</span>
              <span className="text-[13px] text-paper-ink-soft leading-snug line-clamp-1">
                {lastOrder.items.slice(0, 3).map(i => i.name).join(', ')}{lastOrder.items.length > 3 ? ` y ${lastOrder.items.length - 3} más` : ''}
              </span>
            </span>
            <button onClick={() => repeatOrder(lastOrder)}
              className="h-9 px-3.5 rounded-full bg-brand-blue-50 text-brand-blue-700 text-sm font-bold flex items-center gap-1.5 shrink-0">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Repetir
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── "Para ahora" ─────────────────────────────────────────────────────
   Productos según la hora del celular: desayuno de madrugada y mañana,
   cocina al mediodía, bebidas y snacks de noche (los picos de venta son
   10 pm y 4–7 am). Las categorías se buscan por nombre, así sigue
   funcionando aunque cambien de orden o se agreguen nuevas. Los licores
   no entran: no los empujamos desde el inicio. */
const MOMENTS = [
  { from: 4, to: 11, title: 'Para el desayuno', match: [/panad|\bpan\b/, /lact|leche|yogur/] },
  { from: 11, to: 17, title: 'Para cocinar hoy', match: [/abarrot|despensa/, /fruta|verdura/] },
  { from: 17, to: 28, title: 'Para la noche', match: [/bebida|gaseosa|agua/, /snack|golosin|galleta|piqueo/] },
] as const

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function momentFor(hour: number) {
  const h = hour < 4 ? hour + 24 : hour
  return MOMENTS.find(m => h >= m.from && h < m.to) ?? MOMENTS[2]
}

export function HomeForNow({ categories, wrap }: { categories: Category[]; wrap: string }) {
  const moment = momentFor(new Date().getHours())
  const picked = useMemo(() => moment.match
    .map(re => categories.find(c => re.test(normalize(c.name))))
    .filter((c): c is Category => !!c), [categories, moment])

  const results = useQueries({
    queries: picked.map(cat => ({
      queryKey: ['store-products', cat.id, 'para-ahora'],
      queryFn: () => storeApi.getProducts({ categoryId: cat.id, limit: 6 }),
      staleTime: 5 * 60_000,
    })),
  })

  // Intercala las dos categorías (pan, leche, pan, leche…) y salta agotados.
  const lists = results.map(r => (r.data?.data.data ?? []).filter(p => p.currentStock > 0))
  const products: Product[] = []
  for (let i = 0; i < 6; i++) for (const l of lists) if (l[i]) products.push(l[i])
  if (products.length < 2) return null

  return (
    <section className="pt-5" aria-labelledby="para-ahora">
      <div className={`${wrap} flex items-center justify-between mb-1`}>
        <h2 id="para-ahora" className="text-lg font-extrabold text-paper-ink">{moment.title}</h2>
        {picked[0] && (
          <Link to={`/catalogo?categoryId=${picked[0].id}`} className="text-sm font-bold text-brand-blue-600 h-11 flex items-center">Ver más</Link>
        )}
      </div>
      {/* Fila deslizable: dos tarjetas y un pedazo de la tercera a la vista,
          así se entiende que hay más hacia el costado. */}
      <div className={`${wrap} flex gap-2.5 sm:gap-3 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {products.slice(0, 10).map(p => (
          <div key={p.id} className="snap-start shrink-0 w-[43%] sm:w-[30%] md:w-[23%] xl:w-[18%]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}
