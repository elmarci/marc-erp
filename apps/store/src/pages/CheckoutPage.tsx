import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, MapPin, CreditCard, User, Check, ShoppingBag, Truck, Store } from 'lucide-react'
import { useCartStore, cartTotal } from '../cartStore'
import { useAuthStore, type CustomerProfile } from '../authStore'
import { storeApi } from '../api'
import { toast } from 'sonner'

type Step = 1 | 2 | 3

const DISTRICTS = ['Pachacamac', 'Villa María del Triunfo', 'San Juan de Miraflores', 'Villa El Salvador', 'Lurín', 'Cieneguilla', 'Otro']

export function CheckoutPage() {
  const items = useCartStore(s => s.items)
  const clearCart = useCartStore(s => s.clearCart)
  const { customer, setCustomer, isLoggedIn } = useAuthStore()
  const navigate = useNavigate()
  const total = cartTotal(items)
  const [step, setStep] = useState<Step>(1)

  const [form, setForm] = useState({
    customerName: customer?.name ?? '', customerPhone: customer?.phone ?? '', customerEmail: customer?.email ?? '',
    deliveryType: '' as 'DELIVERY' | 'PICKUP' | '',
    address: '', district: 'Pachacamac', reference: '',
    paymentMethod: '' as 'YAPE' | 'PLIN' | 'CASH' | '',
    notes: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => storeApi.createOrder({
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail || undefined,
      deliveryType: form.deliveryType,
      address: form.address || undefined,
      district: form.district || undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      paymentMethod: form.paymentMethod,
      items: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
    }),
    onSuccess: (res) => {
      // Save customer profile for next time
      setCustomer({ name: form.customerName, phone: form.customerPhone, email: form.customerEmail || undefined })
      clearCart()
      navigate(`/pedido/${res.data.data.orderNumber}`)
    },
    onError: () => toast.error('Error al procesar el pedido. Intenta de nuevo.'),
  })

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-white/10" />
        <p className="text-white/50 mb-6">Tu carrito está vacío</p>
        <Link to="/" className="bg-green-500 text-black font-bold px-6 py-3 rounded-full text-sm">Ir a la tienda</Link>
      </div>
    )
  }

  const steps = [
    { num: 1, icon: User, label: 'Tus datos' },
    { num: 2, icon: MapPin, label: 'Entrega' },
    { num: 3, icon: CreditCard, label: 'Pago' },
  ]

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Steps bar */}
      <div className="sticky top-16 z-40 bg-zinc-950/95 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    step === s.num ? 'bg-green-500 text-black ring-4 ring-green-500/20' :
                    step > s.num ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                    'bg-white/5 text-white/30 border border-white/10'
                  }`}>
                    {step > s.num ? <Check className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${step === s.num ? 'text-green-400' : step > s.num ? 'text-white/50' : 'text-white/20'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 mb-4 transition-all ${step > s.num ? 'bg-green-500/40' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-5 gap-6">
          {/* Form */}
          <div className="md:col-span-3">
            <Link to="/" className="flex items-center gap-2 text-white/30 hover:text-white text-sm mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" />Seguir comprando
            </Link>

            {/* STEP 1: Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">¿Quién realiza el pedido?</h2>
                  <p className="text-sm text-white/40">Usaremos estos datos para contactarte</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Nombre completo *</label>
                    <input value={form.customerName} onChange={set('customerName')}
                      placeholder="Ej: María García"
                      className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-green-400 rounded-xl px-4 py-3.5 text-sm outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Número de WhatsApp *
                      <span className="ml-2 text-white/30 font-normal">Te enviaremos la confirmación</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-sm text-white/40">+51</span>
                      <input value={form.customerPhone} onChange={set('customerPhone')}
                        placeholder="987 654 321" type="tel" maxLength={9}
                        className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-green-400 rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Email <span className="text-white/30 font-normal">(opcional)</span>
                    </label>
                    <input value={form.customerEmail} onChange={set('customerEmail')}
                      placeholder="correo@ejemplo.com" type="email"
                      className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-green-400 rounded-xl px-4 py-3.5 text-sm outline-none transition-colors" />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!form.customerName.trim()) { toast.error('Ingresa tu nombre'); return }
                    if (!form.customerPhone.trim() || form.customerPhone.length < 9) { toast.error('Ingresa un número válido de 9 dígitos'); return }
                    setStep(2)
                  }}
                  className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base mt-2">
                  Siguiente: ¿Cómo recibes tu pedido? <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* STEP 2: Delivery */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">¿Cómo recibes tu pedido?</h2>
                  <p className="text-sm text-white/40">Elige la opción que más te convenga</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { val: 'DELIVERY', icon: Truck, title: '🚚 Delivery a domicilio', desc: 'Te llevamos tu pedido', sub: 'Costo a coordinar' },
                    { val: 'PICKUP', icon: Store, title: '🏪 Recojo en tienda', desc: 'Av. Manchay, Pachacamac', sub: 'Gratis · Horario 7am–10pm' },
                  ] as const).map(opt => (
                    <button key={opt.val}
                      onClick={() => setForm(v => ({ ...v, deliveryType: opt.val }))}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        form.deliveryType === opt.val
                          ? 'border-green-500 bg-green-500/10 ring-2 ring-green-500/20'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}>
                      <p className="font-bold text-base mb-1">{opt.title}</p>
                      <p className="text-sm text-white/60">{opt.desc}</p>
                      <p className="text-xs text-green-400 mt-2">{opt.sub}</p>
                    </button>
                  ))}
                </div>

                {form.deliveryType === 'DELIVERY' && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                    <p className="text-sm font-semibold text-white/70">📍 Dirección de entrega</p>
                    <div>
                      <label className="block text-sm text-white/50 mb-2">Dirección completa *</label>
                      <input value={form.address} onChange={set('address')}
                        placeholder="Ej: Av. Los Álamos 123, Mz A Lt 5"
                        className="w-full bg-white/5 border border-white/10 focus:border-green-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
                    </div>
                    <div>
                      <label className="block text-sm text-white/50 mb-2">Distrito</label>
                      <select value={form.district} onChange={set('district')}
                        className="w-full bg-zinc-900 border border-white/10 focus:border-green-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors">
                        {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-white/50 mb-2">Referencia <span className="text-white/30">(opcional)</span></label>
                      <input value={form.reference} onChange={set('reference')}
                        placeholder="Cerca al parque, frente a la bodega..."
                        className="w-full bg-white/5 border border-white/10 focus:border-green-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-white/50 mb-2">Notas adicionales <span className="text-white/30">(opcional)</span></label>
                  <textarea value={form.notes} onChange={set('notes')} rows={2}
                    placeholder="Horario preferido de entrega, instrucciones especiales..."
                    className="w-full bg-white/5 border border-white/10 focus:border-green-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none" />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => {
                      if (!form.deliveryType) { toast.error('Elige cómo recibirás tu pedido'); return }
                      if (form.deliveryType === 'DELIVERY' && !form.address.trim()) { toast.error('Ingresa tu dirección de entrega'); return }
                      setStep(3)
                    }}
                    className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    Siguiente: Elegir pago <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">¿Cómo quieres pagar?</h2>
                  <p className="text-sm text-white/40">Elige tu método de pago preferido</p>
                </div>

                <div className="space-y-3">
                  {([
                    {
                      val: 'YAPE', emoji: '💜', color: 'from-purple-500/20 to-purple-900/10 border-purple-500/30',
                      activeColor: 'from-purple-500/30 to-purple-900/20 border-purple-500 ring-purple-500/20',
                      title: 'Yape', desc: 'Paga con tu app Yape', sub: 'Te enviaremos el número para pagar'
                    },
                    {
                      val: 'PLIN', emoji: '💚', color: 'from-emerald-500/20 to-emerald-900/10 border-emerald-500/30',
                      activeColor: 'from-emerald-500/30 to-emerald-900/20 border-emerald-500 ring-emerald-500/20',
                      title: 'Plin', desc: 'Paga con tu app Plin', sub: 'Te enviaremos el número para pagar'
                    },
                    {
                      val: 'CASH', emoji: '💵', color: 'from-amber-500/20 to-amber-900/10 border-amber-500/30',
                      activeColor: 'from-amber-500/30 to-amber-900/20 border-amber-500 ring-amber-500/20',
                      title: form.deliveryType === 'PICKUP' ? 'Efectivo en tienda' : 'Pago contra entrega',
                      desc: form.deliveryType === 'PICKUP' ? 'Paga cuando recojas tu pedido' : 'Paga en efectivo al recibir',
                      sub: 'Sin cobros adicionales'
                    },
                  ] as const).map(opt => (
                    <button key={opt.val}
                      onClick={() => setForm(v => ({ ...v, paymentMethod: opt.val }))}
                      className={`w-full p-5 rounded-2xl border-2 bg-gradient-to-br text-left transition-all ${
                        form.paymentMethod === opt.val
                          ? `${opt.activeColor} ring-2`
                          : opt.color
                      }`}>
                      <div className="flex items-start gap-4">
                        <span className="text-3xl">{opt.emoji}</span>
                        <div className="flex-1">
                          <p className="font-bold text-base">{opt.title}</p>
                          <p className="text-sm text-white/60 mt-0.5">{opt.desc}</p>
                          <p className="text-xs text-white/40 mt-1">{opt.sub}</p>
                        </div>
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                          form.paymentMethod === opt.val ? 'border-white bg-white' : 'border-white/20'
                        }`}>
                          {form.paymentMethod === opt.val && <Check className="h-4 w-4 text-black" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {(form.paymentMethod === 'YAPE' || form.paymentMethod === 'PLIN') && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm">
                    <p className="font-semibold mb-1">ℹ️ ¿Cómo funciona?</p>
                    <p className="text-white/50">Confirma tu pedido → Te llegará el número de {form.paymentMethod} → Realizas la transferencia → Envianos tu captura por WhatsApp → ¡Pedido confirmado!</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => { if (!form.paymentMethod) { toast.error('Elige un método de pago'); return } mutation.mutate() }}
                    disabled={mutation.isPending}
                    className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base">
                    {mutation.isPending ? (
                      <><div className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Procesando...</>
                    ) : (
                      <><Check className="h-5 w-5" />Confirmar pedido · S/ {total.toFixed(2)}</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Order summary - sticky */}
          <div className="md:col-span-2">
            <div className="bg-zinc-900 rounded-2xl p-5 border border-white/5 sticky top-36">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-green-400" />
                Tu pedido
              </h3>
              <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
                {items.map(item => (
                  <div key={item.product.id} className="flex gap-3">
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product.name} className="h-10 w-10 rounded-lg object-cover shrink-0 bg-zinc-800" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-white/5 shrink-0 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-white/20" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-white/40">×{item.quantity} · S/ {item.product.salePrice.toFixed(2)} c/u</p>
                    </div>
                    <p className="text-xs font-bold text-green-400 shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2 text-sm">
                <div className="flex justify-between text-white/50">
                  <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>S/ {total.toFixed(2)}</span>
                </div>
                {form.deliveryType === 'DELIVERY' && (
                  <div className="flex justify-between text-white/50">
                    <span>Delivery</span>
                    <span className="text-amber-400">A coordinar</span>
                  </div>
                )}
                {form.deliveryType === 'PICKUP' && (
                  <div className="flex justify-between text-white/50">
                    <span>Recojo en tienda</span>
                    <span className="text-green-400">Gratis</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-black text-lg border-t border-white/10 mt-3 pt-3">
                <span>TOTAL</span>
                <span className="text-green-400">S/ {total.toFixed(2)}</span>
              </div>

              {/* Summary of selected options */}
              {(form.deliveryType || form.paymentMethod) && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs text-white/40">
                  {form.customerName && <p>👤 {form.customerName}</p>}
                  {form.deliveryType === 'DELIVERY' && form.address && <p>📍 {form.address}, {form.district}</p>}
                  {form.deliveryType === 'PICKUP' && <p>🏪 Recojo en Av. Manchay, Pachacamac</p>}
                  {form.paymentMethod === 'YAPE' && <p>💜 Pago por Yape</p>}
                  {form.paymentMethod === 'PLIN' && <p>💚 Pago por Plin</p>}
                  {form.paymentMethod === 'CASH' && <p>💵 {form.deliveryType === 'PICKUP' ? 'Efectivo en tienda' : 'Contra entrega'}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
