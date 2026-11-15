import { toast } from 'sonner'
import { storeApi, type StoreOrder } from '../api'
import { useCartStore } from '../cartStore'

// Repite un pedido con los productos y precios de hoy (no los de entonces):
// el servidor cobra el precio vigente, así el carrito muestra lo mismo.
// Se usa en Mis pedidos y en la tarjeta "Vuelve a pedir" del inicio.
export async function repeatOrder(order: Pick<StoreOrder, 'items'>) {
  const { addItem, openCart } = useCartStore.getState()
  const ids = [...new Set(order.items.map(i => i.productId).filter((id): id is string => !!id))]
  const found = await Promise.all(ids.map(id => storeApi.getProduct(id).then(r => r.data.data).catch(() => null)))
  let added = 0
  for (const product of found) {
    if (!product || Number(product.currentStock) <= 0) continue
    const qty = order.items.filter(i => i.productId === product.id).reduce((s, i) => s + Number(i.quantity), 0)
    addItem(product, product.isBulk ? qty : Math.max(1, Math.round(qty)))
    added++
  }
  if (!added) { toast.error('Esos productos ya no están disponibles'); return }
  openCart()
  toast.success(added < ids.length ? 'Agregamos lo que sigue disponible' : 'Productos del pedido agregados al carrito')
}
