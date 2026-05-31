import { X, Plus, Minus, ShoppingBag, Trash2, ArrowRight } from 'lucide-react'
import { useCartStore, cartTotal } from '../cartStore'
import { useNavigate } from 'react-router-dom'

const WHATSAPP_NUMBER = '51930555831'

export function CartDrawer() {
  const items = useCartStore(s => s.items)
  const isOpen = useCartStore(s => s.isOpen)
  const closeCart = useCartStore(s => s.closeCart)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQuantity = useCartStore(s => s.updateQuantity)
  const clearCart = useCartStore(s => s.clearCart)
  const total = cartTotal(items)
  const navigate = useNavigate()

  const handleWhatsApp = () => {
    const lines = items.map(i => `• ${i.product.name} x${i.quantity} = S/ ${(i.product.salePrice * i.quantity).toFixed(2)}`)
    const msg = `Hola TIENDA MARC! 👋\n\nQuiero hacer un pedido:\n\n${lines.join('\n')}\n\n*TOTAL: S/ ${total.toFixed(2)}*`
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleCheckout = () => { closeCart(); navigate('/checkout') }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-gray-50 backdrop-blur-sm" onClick={closeCart} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-gray-50 border-l border-gray-200 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-green-400" />
            Tu carrito
            {items.length > 0 && <span className="text-sm text-gray-400 font-normal">({items.length} items)</span>}
          </h2>
          <button onClick={closeCart} className="p-2 hover:bg-gray-50 rounded-lg"><X className="h-5 w-5" /></button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
              <ShoppingBag className="h-16 w-16" />
              <p className="text-lg">Tu carrito está vacío</p>
              <button onClick={closeCart} className="text-green-400 hover:text-green-300 text-sm">Explorar productos →</button>
            </div>
          ) : items.map(item => (
            <div key={item.product.id} className="flex gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
              {item.product.imageUrl ? (
                <img src={item.product.imageUrl} alt={item.product.name} className="h-16 w-16 rounded-lg object-cover shrink-0 bg-gray-100" />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-gray-900/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2 leading-tight">{item.product.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">S/ {item.product.salePrice.toFixed(2)} c/u</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="h-7 w-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="h-7 w-7 rounded-full bg-green-500/20 hover:bg-green-500/30 flex items-center justify-center text-green-400">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-green-400 text-sm">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</span>
                    <button onClick={() => removeItem(item.product.id)} className="text-red-400/60 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-5 border-t border-gray-200 space-y-4 bg-gray-50">
            {/* Subtotals */}
            <div className="space-y-2 text-sm">
              {items.map(item => (
                <div key={item.product.id} className="flex justify-between text-gray-400">
                  <span className="truncate mr-2">{item.product.name} ×{item.quantity}</span>
                  <span className="shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xl font-black border-t border-gray-200 pt-3">
              <span>TOTAL</span>
              <span className="text-green-400">S/ {total.toFixed(2)}</span>
            </div>
            <button onClick={handleCheckout}
              className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base">
              Hacer pedido <ArrowRight className="h-5 w-5" />
            </button>
            <button onClick={handleWhatsApp}
              className="w-full bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Pedir por WhatsApp
            </button>
            <button onClick={() => { clearCart(); closeCart() }} className="w-full text-gray-900/20 hover:text-gray-900/50 text-xs py-1">
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </>
  )
}
