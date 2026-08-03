import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, MapPin, CreditCard, User, Check, ShoppingBag, Truck, Store, Plus } from 'lucide-react'
import { useCartStore, cartTotal } from '../cartStore'
import { useAuthStore } from '../authStore'
import { storeApi } from '../api'
import { toast } from 'sonner'

type Step = 1 | 2 | 3

const DISTRICTS = ['Pachacamac', 'Villa María del Triunfo', 'San Juan de Miraflores', 'Villa El Salvador', 'Lurín', 'Cieneguilla', 'Otro']

export function CheckoutPage() {
  const items = useCartStore(s => s.items)
  const clearCart = useCartStore(s => s.clearCart)
  const { customer, isLoggedIn } = useAuthStore()
  const navigate = useNavigate()
  const total = cartTotal(items)
  const [step, setStep] = useState<Step>(1)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [saveNewAddress, setSaveNewAddress] = useState(false)

  const { data: profileData } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
    enabled: !!isLoggedIn,
  })
  const savedAddresses = profileData?.data.data.addresses ?? []

  const [form, setForm] = useState({
    customerName: customer?.name ?? '',
    customerPhone: customer?.phone ?? '',
    customerEmail: customer?.email ?? '',
    deliveryType: '' as 'DELIVERY' | 'PICKUP' | '',
    address: '', district: 'Pachacamac', reference: '',
    paymentMethod: '' as 'YAPE' | 'PLIN' | 'CASH' | '',
    notes: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const pickSavedAddress = (id: string) => {
    const addr = savedAddresses.find(a => a.id === id)
    if (!addr) return
    setSelectedAddressId(id)
    setShowNewAddressForm(false)
    setForm(v => ({ ...v, address: addr.address, district: addr.district, reference: addr.reference ?? '' }))
  }

  // Preselecciona la dirección principal apenas cargan las guardadas — así el
  // cliente registrado no tiene que volver a escribir su dirección de siempre.
  useEffect(() => {
    if (selectedAddressId || savedAddresses.length === 0) return
    const preferred = savedAddresses.find(a => a.isDefault) ?? savedAddresses[0]
    pickSavedAddress(preferred.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddresses.length])

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
      items: items.map(i => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: Number(i.product.salePrice),  // precio real (incluyendo descuento de oferta)
        name: i.product.name,                     // nombre con badge si aplica
      })),
    }),
    onSuccess: (res) => {
      // Guardar la dirección nueva es un extra de conveniencia — si falla no
      // debe bloquear ni afectar la confirmación del pedido, que ya sucedió.
      if (isLoggedIn && saveNewAddress && !selectedAddressId && form.address) {
        storeApi.addAddress({
          label: 'Casa', address: form.address, district: form.district,
          reference: form.reference || undefined, isDefault: savedAddresses.length === 0,
        }).catch(() => {})
      }
      clearCart()
      navigate(`/pedido/${res.data.data.orderNumber}`)
    },
    onError: () => toast.error('Error al procesar el pedido. Intenta de nuevo.'),
  })

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-gray-200" />
        <p className="text-gray-500 mb-6">Tu carrito está vacío</p>
        <Link to="/" className="bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold px-6 py-3 rounded-full text-sm transition-colors">Ir a la tienda</Link>
      </div>
    )
  }

  const steps = [
    { num: 1, icon: User, label: 'Tus datos' },
    { num: 2, icon: MapPin, label: 'Entrega' },
    { num: 3, icon: CreditCard, label: 'Pago' },
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Steps bar */}
      <div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    step === s.num ? 'bg-brand-blue-600 text-white ring-4 ring-brand-blue-100' :
                    step > s.num ? 'bg-brand-green-100 text-brand-green-700 border border-brand-green-300' :
                    'bg-gray-100 text-gray-400 border border-gray-200'
                  }`}>
                    {step > s.num ? <Check className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${step === s.num ? 'text-brand-blue-600' : step > s.num ? 'text-gray-500' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 mb-4 transition-all ${step > s.num ? 'bg-brand-green-300' : 'bg-gray-200'}`} />
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
            <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" />Seguir comprando
            </Link>

            {/* STEP 1: Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-gray-900">¿Quién realiza el pedido?</h2>
                  <p className="text-sm text-gray-500">Usaremos estos datos para contactarte</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nombre completo *</label>
                    <input value={form.customerName} onChange={set('customerName')}
                      placeholder="Ej: María García"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-brand-blue-400 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de WhatsApp *
                      <span className="ml-2 text-gray-400 font-normal">Te enviaremos la confirmación</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-sm text-gray-400">+51</span>
                      <input value={form.customerPhone} onChange={set('customerPhone')}
                        placeholder="987 654 321" type="tel" maxLength={9}
                        className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-brand-blue-400 rounded-xl pl-12 pr-4 py-3.5 text-sm text-gray-900 outline-none transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <input value={form.customerEmail} onChange={set('customerEmail')}
                      placeholder="correo@ejemplo.com" type="email"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-brand-blue-400 rounded-xl px-4 py-3.5 text-sm text-gray-900 outline-none transition-colors" />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!form.customerName.trim()) { toast.error('Ingresa tu nombre'); return }
                    if (!form.customerPhone.trim() || form.customerPhone.length < 9) { toast.error('Ingresa un número válido de 9 dígitos'); return }
                    setStep(2)
                  }}
                  className="w-full bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base mt-2">
                  Siguiente: ¿Cómo recibes tu pedido? <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* STEP 2: Delivery */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-gray-900">¿Cómo recibes tu pedido?</h2>
                  <p className="text-sm text-gray-500">Elige la opción que más te convenga</p>
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
                          ? 'border-brand-blue-500 bg-brand-blue-50 ring-2 ring-brand-blue-100'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <p className="font-bold text-base text-gray-900 mb-1">{opt.title}</p>
                      <p className="text-sm text-gray-500">{opt.desc}</p>
                      <p className="text-xs text-brand-green-700 mt-2">{opt.sub}</p>
                    </button>
                  ))}
                </div>

                {form.deliveryType === 'DELIVERY' && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                    <p className="text-sm font-semibold text-gray-700">📍 Dirección de entrega</p>

                    {isLoggedIn && savedAddresses.length > 0 && !showNewAddressForm && (
                      <div className="space-y-2">
                        {savedAddresses.map(a => (
                          <button key={a.id} type="button" onClick={() => pickSavedAddress(a.id)}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                              selectedAddressId === a.id ? 'border-brand-blue-500 bg-brand-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}>
                            <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                            <p className="text-xs text-gray-500">{a.address}, {a.district}</p>
                          </button>
                        ))}
                        <button type="button" onClick={() => { setShowNewAddressForm(true); setSelectedAddressId(null); setForm(v => ({ ...v, address: '', reference: '' })) }}
                          className="w-full flex items-center justify-center gap-1.5 text-sm text-brand-blue-600 hover:text-brand-blue-700 py-2 transition-colors">
                          <Plus className="h-3.5 w-3.5" />Usar otra dirección
                        </button>
                      </div>
                    )}

                    {(!isLoggedIn || savedAddresses.length === 0 || showNewAddressForm) && (
                      <>
                        <div>
                          <label className="block text-sm text-gray-500 mb-2">Dirección completa *</label>
                          <input value={form.address} onChange={set('address')}
                            placeholder="Ej: Av. Los Álamos 123, Mz A Lt 5"
                            className="w-full bg-white border border-gray-200 focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition-colors" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 mb-2">Distrito</label>
                          <select value={form.district} onChange={set('district')}
                            className="w-full bg-white border border-gray-200 focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition-colors">
                            {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 mb-2">Referencia <span className="text-gray-400">(opcional)</span></label>
                          <input value={form.reference} onChange={set('reference')}
                            placeholder="Cerca al parque, frente a la bodega..."
                            className="w-full bg-white border border-gray-200 focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition-colors" />
                        </div>
                        {isLoggedIn && (
                          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={saveNewAddress} onChange={e => setSaveNewAddress(e.target.checked)}
                              className="rounded border-gray-300 text-brand-blue-600 focus:ring-brand-blue-400" />
                            Guardar esta dirección en mi cuenta
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Notas adicionales <span className="text-gray-400">(opcional)</span></label>
                  <textarea value={form.notes} onChange={set('notes')} rows={2}
                    placeholder="Horario preferido de entrega, instrucciones especiales..."
                    className="w-full bg-white border border-gray-200 focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition-colors resize-none" />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="px-6 py-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => {
                      if (!form.deliveryType) { toast.error('Elige cómo recibirás tu pedido'); return }
                      if (form.deliveryType === 'DELIVERY' && !form.address.trim()) { toast.error('Ingresa tu dirección de entrega'); return }
                      setStep(3)
                    }}
                    className="flex-1 bg-brand-blue-600 hover:bg-brand-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    Siguiente: Elegir pago <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-gray-900">¿Cómo quieres pagar?</h2>
                  <p className="text-sm text-gray-500">Elige tu método de pago preferido</p>
                </div>

                <div className="space-y-3">
                  {([
                    {
                      val: 'YAPE', emoji: '💜', color: 'from-purple-50 to-white border-purple-200',
                      activeColor: 'from-purple-100 to-white border-purple-500 ring-purple-100',
                      title: 'Yape', desc: 'Paga con tu app Yape', sub: 'Te enviaremos el número para pagar'
                    },
                    {
                      val: 'PLIN', emoji: '💚', color: 'from-emerald-50 to-white border-emerald-200',
                      activeColor: 'from-emerald-100 to-white border-emerald-500 ring-emerald-100',
                      title: 'Plin', desc: 'Paga con tu app Plin', sub: 'Te enviaremos el número para pagar'
                    },
                    {
                      val: 'CASH', emoji: '💵', color: 'from-amber-50 to-white border-amber-200',
                      activeColor: 'from-amber-100 to-white border-amber-500 ring-amber-100',
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
                          <p className="font-bold text-base text-gray-900">{opt.title}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{opt.desc}</p>
                          <p className="text-xs text-gray-400 mt-1">{opt.sub}</p>
                        </div>
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                          form.paymentMethod === opt.val ? 'border-brand-blue-600 bg-brand-blue-600' : 'border-gray-300'
                        }`}>
                          {form.paymentMethod === opt.val && <Check className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {(form.paymentMethod === 'YAPE' || form.paymentMethod === 'PLIN') && (
                  <div className="bg-brand-blue-50 border border-brand-blue-100 rounded-2xl p-4 text-sm">
                    <p className="font-semibold mb-1 text-gray-900">ℹ️ ¿Cómo funciona?</p>
                    <p className="text-gray-600">Confirma tu pedido → Te llegará el número de {form.paymentMethod} → Realizas la transferencia → Envianos tu captura por WhatsApp → ¡Pedido confirmado!</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="px-6 py-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700 transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => { if (!form.paymentMethod) { toast.error('Elige un método de pago'); return } mutation.mutate() }}
                    disabled={mutation.isPending}
                    className="flex-1 bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base">
                    {mutation.isPending ? (
                      <><div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Procesando...</>
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
            <div className="bg-white rounded-2xl p-5 border border-gray-200 sticky top-36">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-900">
                <ShoppingBag className="h-4 w-4 text-brand-blue-600" />
                Tu pedido
              </h3>
              <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
                {items.map(item => (
                  <div key={item.product.id} className="flex gap-3">
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product.name} className="h-10 w-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-gray-400">×{item.quantity} · S/ {item.product.salePrice.toFixed(2)} c/u</p>
                    </div>
                    <p className="text-xs font-bold text-brand-green-700 shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>S/ {total.toFixed(2)}</span>
                </div>
                {form.deliveryType === 'DELIVERY' && (
                  <div className="flex justify-between text-gray-500">
                    <span>Delivery</span>
                    <span className="text-amber-600">A coordinar</span>
                  </div>
                )}
                {form.deliveryType === 'PICKUP' && (
                  <div className="flex justify-between text-gray-500">
                    <span>Recojo en tienda</span>
                    <span className="text-brand-green-700">Gratis</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-black text-lg border-t border-gray-100 mt-3 pt-3 text-gray-900">
                <span>TOTAL</span>
                <span className="text-brand-green-700">S/ {total.toFixed(2)}</span>
              </div>

              {/* Summary of selected options */}
              {(form.deliveryType || form.paymentMethod) && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-xs text-gray-500">
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
