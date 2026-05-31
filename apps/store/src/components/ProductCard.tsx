import { ShoppingCart, ShoppingBag, Plus, Minus } from 'lucide-react'
import { useCartStore } from '../cartStore'
import type { Product } from '../api'
import { toast } from 'sonner'

export function ProductCard({ product }: { product: Product }) {
  const { addItem, updateQuantity, items, openCart } = useCartStore()
  const cartItem = items.find(i => i.product.id === product.id)
  const qty = cartItem?.quantity ?? 0
  const outOfStock = product.currentStock <= 0
  const lowStock = !outOfStock && product.currentStock <= 5

  const handleAdd = () => {
    if (outOfStock) return
    addItem(product)
    toast.success(`${product.name} agregado`, { duration:1500, action:{label:'Ver carrito',onClick:openCart} })
  }

  return (
    <div
      onClick={outOfStock ? undefined : handleAdd}
      className={`bg-white border border-gray-200 rounded-2xl overflow-hidden transition-all duration-150
        ${outOfStock ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg hover:border-green-300 hover:-translate-y-0.5'}`}>

      <div className="relative bg-gray-50" style={{paddingBottom:'70%'}}>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            : <ShoppingBag className="h-10 w-10 text-gray-300" />}
        </div>
        {lowStock && <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Últimas {product.currentStock}</span>}
        {outOfStock && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Agotado</span></div>}
        {qty > 0 && <div className="absolute top-2 right-2 h-6 w-6 bg-green-600 text-white text-xs font-black rounded-full flex items-center justify-center shadow">{qty}</div>}
      </div>

      <div className="p-3">
        <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider mb-0.5">{product.category.name}</p>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mb-2.5" style={{minHeight:'2.5rem'}}>{product.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-base font-black text-gray-900">S/ {Number(product.salePrice).toFixed(2)}</span>
          {qty > 0 ? (
            <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>updateQuantity(product.id,qty-1)} className="h-7 w-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"><Minus className="h-3 w-3 text-gray-700"/></button>
              <span className="w-5 text-center text-sm font-bold text-gray-900">{qty}</span>
              <button onClick={()=>addItem(product)} className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors"><Plus className="h-3 w-3"/></button>
            </div>
          ) : (
            <div className="h-8 w-8 bg-green-600 text-white rounded-full flex items-center justify-center pointer-events-none"><ShoppingCart className="h-4 w-4"/></div>
          )}
        </div>
      </div>
    </div>
  )
}
