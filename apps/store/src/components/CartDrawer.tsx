import { X, Plus, Minus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCartStore, cartTotal } from '../cartStore'
import { useAuthStore } from '../authStore'
import { useNavigate } from 'react-router-dom'

const WHATSAPP_NUMBER = '51930555831'

export function CartDrawer() {
  const items = useCartStore(s => s.items)
  const isOpen = useCartStore(s => s.isOpen)
  const closeCart = useCartStore(s => s.closeCart)
  const removeItem = useCartStore(s => s.removeItem)
  const updateQuantity = useCartStore(s => s.updateQuantity)
  const clearCart = useCartStore(s => s.clearCart)
  const customer = useAuthStore(s => s.customer)
  const total = cartTotal(items)
  const navigate = useNavigate()

  // Opción de respaldo para quien no quiere crear cuenta — arma el pedido
  // completo en un mensaje estructurado y lo manda directo a WhatsApp.
  const handleWhatsApp = () => {
    const lines = items.map(i => `• ${i.product.name} ×${i.quantity} — S/ ${(Number(i.product.salePrice) * i.quantity).toFixed(2)}`)
    const greeting = customer ? `Hola TIENDA MARC! Soy ${customer.name} 👋` : 'Hola TIENDA MARC! 👋'
    const msg = [
      greeting, '',
      'Quiero hacer este pedido:', '',
      ...lines, '',
      `*TOTAL: S/ ${total.toFixed(2)}*`, '',
      customer ? `Mi teléfono: ${customer.phone}` : '(Te paso mi dirección y forma de pago por acá)',
    ].join('\n')
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleCheckout = () => {
    closeCart()
    navigate('/checkout')
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-paper-ink/50 backdrop-blur-sm" onClick={closeCart} />

      {/* Drawer — estilo ticket de papel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-paper-bg border-l border-paper-line flex flex-col">
        {/* Franja perforada */}
        <div className="h-2 shrink-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(32,30,29,.18) 1.5px, transparent 1.5px)', backgroundSize: '10px 10px', backgroundPosition: 'center' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dashed border-paper-line">
          <h2 className="text-sm font-bold tracking-[.08em] uppercase flex items-center gap-2 text-paper-ink">
            <ShoppingBag className="h-4 w-4 text-brand-green-600" />
            Ticket · Tu pedido
            {items.length > 0 && <span className="text-xs font-normal normal-case text-paper-ink-ghost">({items.length})</span>}
          </h2>
          <button onClick={closeCart} className="p-2 hover:bg-paper-surface rounded-full transition-colors">
            <X className="h-5 w-5 text-paper-ink-soft" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-paper-ink-ghost">
              <ShoppingBag className="h-16 w-16" />
              <p className="text-lg text-paper-ink-faint">Tu carrito está vacío</p>
              <button onClick={closeCart} className="text-brand-green-600 hover:text-brand-green-700 text-sm transition-colors">
                Explorar productos →
              </button>
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.product.id} className={`flex gap-3 py-3 ${idx > 0 ? 'border-t border-dashed border-paper-line' : ''}`}>
                {item.product.imageUrl ? (
                  <img src={item.product.imageUrl} alt={item.product.name}
                    className="h-16 w-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-paper-surface shrink-0 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-paper-ink-ghost" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-paper-ink line-clamp-2 leading-tight">{item.product.name}</p>
                  <p className="text-paper-ink-ghost text-xs mt-0.5">
                    {item.product.description
                      ? <span className="text-brand-green-600">{item.product.description}</span>
                      : `S/ ${Number(item.product.salePrice).toFixed(2)} c/u`}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="h-6 w-6 rounded-full bg-paper-surface hover:bg-paper-line flex items-center justify-center transition-colors">
                        <Minus className="h-2.5 w-2.5 text-paper-ink-soft" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-paper-ink">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="h-6 w-6 rounded-full bg-paper-surface hover:bg-paper-line flex items-center justify-center transition-colors">
                        <Plus className="h-2.5 w-2.5 text-paper-ink-soft" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-paper-ink font-bold text-sm tabular-nums">
                        S/ {(Number(item.product.salePrice) * item.quantity).toFixed(2)}
                      </span>
                      <button onClick={() => removeItem(item.product.id)}
                        className="text-brand-magenta-400 hover:text-brand-magenta-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-5 border-t border-dashed border-paper-line space-y-3">
            <div className="flex justify-between text-lg font-bold text-paper-ink">
              <span>Total</span>
              <span className="text-brand-green-700 tabular-nums">S/ {total.toFixed(2)}</span>
            </div>
            <button onClick={handleCheckout}
              className="w-full bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-3.5 rounded-xl shadow-md shadow-brand-green-600/25 transition-colors text-sm">
              Hacer pedido online
            </button>
            <button onClick={handleWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Pedir por WhatsApp
            </button>
            <button onClick={() => { clearCart(); closeCart() }}
              className="w-full text-paper-ink-ghost hover:text-paper-ink-soft text-xs transition-colors py-1">
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </>
  )
}
