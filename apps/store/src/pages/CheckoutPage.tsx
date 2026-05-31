import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ShoppingBag, MapPin, CreditCard, ChevronRight, ArrowLeft } from 'lucide-react'
import { useCartStore } from '../cartStore'
import { storeApi } from '../api'
import { toast } from 'sonner'

type Step = 'contact' | 'delivery' | 'payment'

const DISTRICTS = ['Pachacamac', 'Villa María del Triunfo', 'San Juan de Miraflores', 'Villa El Salvador', 'Lurín', 'Otro']

export function CheckoutPage() {
  const { items, total, clearCart } = useCartStore()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('contact')

  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerEmail: '',
    deliveryType: 'DELIVERY' as 'DELIVERY' | 'PICKUP',
    address: '', district: 'Pachacamac', reference: '',
    paymentMethod: 'CASH' as 'YAPE' | 'PLIN' | 'CASH',
    notes: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => storeApi.createOrder({
      ...form,
      items: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
    }),
    onSuccess: (res) => {
      clearCart()
      navigate(`/pedido/${res.data.data.orderNumber}`)
    },
    onError: () => toast.error('Error al procesar el pedido. Intenta de nuevo.'),
  })

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-white/10" />
        <p className="text-white/50 mb-4">Tu carrito está vacío</p>
        <Link to="/catalogo" className="bg-green-500 text-black font-bold px-6 py-3 rounded-full text-sm">Ver productos</Link>
      </div>
    )
  }

  const steps = [
    { id: 'contact', label: 'Datos' },
    { id: 'delivery', label: 'Entrega' },
    { id: 'payment', label: 'Pago' },
  ]

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/catalogo" className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />Volver al catálogo
      </Link>

      <h1 className="text-2xl font-bold mb-8">Finalizar pedido</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2">
          {/* Steps indicator */}
          <div className="flex items-center mb-8">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-2 text-sm font-medium ${step === s.id ? 'text-green-400' : steps.indexOf({ id: step, label: '' } as typeof s) > i ? 'text-white/40' : 'text-white/30'}`}>
                  <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${step === s.id ? 'bg-green-500 text-black' : 'bg-white/10'}`}>{i + 1}</span>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className="w-8 h-px bg-white/10 mx-3" />}
              </div>
            ))}
          </div>

          {/* Step 1: Contact */}
          {step === 'contact' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-4">Tus datos de contacto</h2>
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Nombre completo *</label>
                <input value={form.customerName} onChange={set('customerName')}
                  placeholder="Juan Pérez"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors" />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Teléfono / WhatsApp *</label>
                <input value={form.customerPhone} onChange={set('customerPhone')}
                  placeholder="987654321" type="tel"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors" />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Email (opcional)</label>
                <input value={form.customerEmail} onChange={set('customerEmail')}
                  placeholder="correo@ejemplo.com" type="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors" />
              </div>
              <button onClick={() => { if (!form.customerName || !form.customerPhone) { toast.error('Completa nombre y teléfono'); return; } setStep('delivery') }}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Delivery */}
          {step === 'delivery' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-4">¿Cómo quieres recibir tu pedido?</h2>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { val: 'DELIVERY', icon: '🚚', label: 'Delivery', desc: 'Te lo llevamos a casa' },
                  { val: 'PICKUP', icon: '🏪', label: 'Recojo en tienda', desc: 'Av. Manchay, Pachacamac' },
                ] as const).map(opt => (
                  <button key={opt.val} onClick={() => setForm(v => ({ ...v, deliveryType: opt.val }))}
                    className={`p-4 rounded-xl border text-left transition-all ${form.deliveryType === opt.val ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <div className="text-2xl mb-2">{opt.icon}</div>
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {form.deliveryType === 'DELIVERY' && (
                <>
                  <div>
                    <label className="text-sm text-white/60 mb-1.5 block">Dirección *</label>
                    <input value={form.address} onChange={set('address')}
                      placeholder="Av. Los Álamos 123, Mz A Lt 5"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-sm text-white/60 mb-1.5 block">Distrito</label>
                    <select value={form.district} onChange={set('district')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors">
                      {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-white/60 mb-1.5 block">Referencia (opcional)</label>
                    <input value={form.reference} onChange={set('reference')}
                      placeholder="Cerca al parque, frente a la bodega..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors" />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm text-white/60 mb-1.5 block">Notas adicionales</label>
                <textarea value={form.notes} onChange={set('notes')}
                  placeholder="Instrucciones especiales, horario de entrega..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('contact')}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors">
                  Atrás
                </button>
                <button onClick={() => { if (form.deliveryType === 'DELIVERY' && !form.address) { toast.error('Ingresa tu dirección'); return; } setStep('payment') }}
                  className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  Continuar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 'payment' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-4">¿Cómo quieres pagar?</h2>
              <div className="space-y-3">
                {([
                  { val: 'YAPE', emoji: '💜', label: 'Yape', desc: 'Escanea el QR al confirmar' },
                  { val: 'PLIN', emoji: '💚', label: 'Plin', desc: 'Escanea el QR al confirmar' },
                  { val: 'CASH', emoji: '💵', label: form.deliveryType === 'PICKUP' ? 'Efectivo en tienda' : 'Pago contra entrega', desc: form.deliveryType === 'PICKUP' ? 'Paga al recoger tu pedido' : 'Paga cuando llegue el delivery' },
                ] as const).map(opt => (
                  <button key={opt.val} onClick={() => setForm(v => ({ ...v, paymentMethod: opt.val }))}
                    className={`w-full p-4 rounded-xl border text-left flex items-center gap-4 transition-all ${form.paymentMethod === opt.val ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <span className="text-2xl">{opt.emoji}</span>
                    <div>
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <p className="text-xs text-white/40">{opt.desc}</p>
                    </div>
                    <div className={`ml-auto h-5 w-5 rounded-full border-2 flex items-center justify-center ${form.paymentMethod === opt.val ? 'border-green-500' : 'border-white/20'}`}>
                      {form.paymentMethod === opt.val && <div className="h-2.5 w-2.5 bg-green-500 rounded-full" />}
                    </div>
                  </button>
                ))}
              </div>

              {(form.paymentMethod === 'YAPE' || form.paymentMethod === 'PLIN') && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white/60">
                  <p className="font-medium text-white mb-1">📱 Instrucciones de pago</p>
                  <p>Después de confirmar tu pedido, recibirás el número de teléfono para realizar el pago por {form.paymentMethod}. Envíanos el comprobante por WhatsApp para confirmar tu pedido.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('delivery')}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors">
                  Atrás
                </button>
                <button onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-3.5 rounded-xl transition-colors">
                  {mutation.isPending ? 'Procesando...' : `Confirmar pedido · S/ ${total.toFixed(2)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="bg-zinc-900 rounded-2xl p-5 sticky top-24">
            <h3 className="font-bold mb-4">Resumen del pedido</h3>
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {items.map(item => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span className="text-white/70 flex-1 mr-2 line-clamp-1">{item.product.name} ×{item.quantity}</span>
                  <span className="font-medium shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-green-400 text-lg">S/ {total.toFixed(2)}</span>
            </div>
            {form.deliveryType === 'DELIVERY' && (
              <p className="text-xs text-white/30 mt-2">* Costo de delivery a coordinar</p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
