import { X, Plus, Minus, ShoppingBag, Trash2, ArrowRight, MessageCircle } from 'lucide-react'
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

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-marc/40 backdrop-blur-sm" onClick={closeCart} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[--border]">
          <h2 className="text-lg font-bold text-marc flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-orange" />
            Tu carrito
            {items.length > 0 && <span className="text-sm text-marc/40 font-normal">({items.length} productos)</span>}
          </h2>
          <button onClick={closeCart} className="h-8 w-8 bg-bg rounded-full flex items-center justify-center hover:bg-cream transition-colors">
            <X className="h-4 w-4 text-marc/60" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-marc/30">
              <div className="h-20 w-20 bg-orange-pale rounded-full flex items-center justify-center">
                <ShoppingBag className="h-10 w-10 text-orange/30" />
              </div>
              <p className="text-lg font-semibold">Tu carrito está vacío</p>
              <button onClick={closeCart} className="text-orange hover:text-orange-dark text-sm font-medium transition-colors">
                Explorar productos →
              </button>
            </div>
          ) : items.map(item => (
            <div key={item.product.id} className="flex gap-3 bg-bg rounded-2xl p-3 border border-[--border]">
              {item.product.imageUrl ? (
                <img src={item.product.imageUrl} alt={item.product.name}
                  className="h-16 w-16 rounded-xl object-cover shrink-0 bg-cream" />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-cream shrink-0 flex items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-marc/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-marc line-clamp-2 leading-tight">{item.product.name}</p>
                <p className="text-orange font-bold text-sm mt-0.5">S/ {item.product.salePrice.toFixed(2)}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="h-7 w-7 bg-white border border-[--border] rounded-full flex items-center justify-center hover:border-orange transition-colors">
                      <Minus className="h-3 w-3 text-marc/60" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-marc">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="h-7 w-7 bg-orange rounded-full flex items-center justify-center hover:bg-orange-dark transition-colors">
                      <Plus className="h-3 w-3 text-white" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-marc text-sm">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</span>
                    <button onClick={() => removeItem(item.product.id)}
                      className="h-6 w-6 text-marc/20 hover:text-red-400 transition-colors flex items-center justify-center">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-5 border-t border-[--border] space-y-3 bg-white">
            {/* Subtotals summary */}
            <div className="space-y-1 text-sm">
              {items.map(item => (
                <div key={item.product.id} className="flex justify-between text-marc/40 text-xs">
                  <span className="truncate mr-2">{item.product.name} ×{item.quantity}</span>
                  <span className="shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-xl font-black text-marc border-t border-[--border] pt-3">
              <span>TOTAL</span>
              <span className="text-orange">S/ {total.toFixed(2)}</span>
            </div>

            <button onClick={() => { closeCart(); navigate('/checkout') }}
              className="w-full bg-orange hover:bg-orange-dark text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-orange text-base">
              Hacer pedido <ArrowRight className="h-5 w-5" />
            </button>

            <button onClick={handleWhatsApp}
              className="w-full bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm">
              <MessageCircle className="h-5 w-5" />
              Pedir por WhatsApp
            </button>

            <button onClick={() => { clearCart(); closeCart() }}
              className="w-full text-marc/20 hover:text-marc/50 text-xs py-1 transition-colors">
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </>
  )
}
