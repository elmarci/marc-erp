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
    paymentMethod: '' as 'YAPE' | 'CASH' | '',
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
        <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-paper-ink-ghost" />
        <p className="text-paper-ink-soft mb-6">Tu carrito está vacío</p>
        <Link to="/" className="bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold px-6 py-3 rounded-full text-sm transition-colors">Ir a la tienda</Link>
      </div>
    )
  }

  const steps = [
    { num: 1, icon: User, label: 'Tus datos' },
    { num: 2, icon: MapPin, label: 'Entrega' },
    { num: 3, icon: CreditCard, label: 'Pago' },
  ]

  return (
    <main className="min-h-screen bg-paper-bg">
      {/* Steps bar */}
      <div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-paper-line">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    step === s.num ? 'bg-brand-green-600 text-white ring-4 ring-brand-green-100' :
                    step > s.num ? 'bg-brand-green-100 text-brand-green-700 border border-brand-green-300' :
                    'bg-paper-surface text-paper-ink-ghost border border-paper-line'
                  }`}>
                    {step > s.num ? <Check className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${step === s.num ? 'text-brand-green-700' : step > s.num ? 'text-paper-ink-soft' : 'text-paper-ink-ghost'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 mb-4 transition-all ${step > s.num ? 'bg-brand-green-300' : 'bg-paper-line'}`} />
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
            <Link to="/" className="flex items-center gap-2 text-paper-ink-ghost hover:text-paper-ink text-sm mb-6 transition-colors">
              <ArrowLeft className="h-4 w-4" />Seguir comprando
            </Link>

            {/* STEP 1: Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-paper-ink">¿Quién realiza el pedido?</h2>
                  <p className="text-sm text-paper-ink-soft">Usaremos estos datos para contactarte</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-paper-ink-soft mb-2">Nombre completo *</label>
                    <input value={form.customerName} onChange={set('customerName')}
                      placeholder="Ej: María García"
                      className="w-full bg-white border border-paper-line hover:border-paper-ink-faint focus:border-brand-blue-400 rounded-xl px-4 py-3.5 text-sm text-paper-ink outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-paper-ink-soft mb-2">
                      Número de WhatsApp *
                      <span className="ml-2 text-paper-ink-ghost font-normal">Te enviaremos la confirmación</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-sm text-paper-ink-ghost">+51</span>
                      <input value={form.customerPhone} onChange={set('customerPhone')}
                        placeholder="987 654 321" type="tel" maxLength={9}
                        className="w-full bg-white border border-paper-line hover:border-paper-ink-faint focus:border-brand-blue-400 rounded-xl pl-12 pr-4 py-3.5 text-sm text-paper-ink outline-none transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-paper-ink-soft mb-2">
                      Email <span className="text-paper-ink-ghost font-normal">(opcional)</span>
                    </label>
                    <input value={form.customerEmail} onChange={set('customerEmail')}
                      placeholder="correo@ejemplo.com" type="email"
                      className="w-full bg-white border border-paper-line hover:border-paper-ink-faint focus:border-brand-blue-400 rounded-xl px-4 py-3.5 text-sm text-paper-ink outline-none transition-colors" />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!form.customerName.trim()) { toast.error('Ingresa tu nombre'); return }
                    if (!form.customerPhone.trim() || form.customerPhone.length < 9) { toast.error('Ingresa un número válido de 9 dígitos'); return }
                    setStep(2)
                  }}
                  className="w-full bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base mt-2">
                  Siguiente: ¿Cómo recibes tu pedido? <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* STEP 2: Delivery */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-paper-ink">¿Cómo recibes tu pedido?</h2>
                  <p className="text-sm text-paper-ink-soft">Elige la opción que más te convenga</p>
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
                          ? 'border-brand-green-500 bg-brand-green-50 ring-2 ring-brand-green-100'
                          : 'border-paper-line bg-white hover:border-paper-ink-faint shadow-sm'
                      }`}>
                      <p className="font-bold text-base text-paper-ink mb-1">{opt.title}</p>
                      <p className="text-sm text-paper-ink-soft">{opt.desc}</p>
                      <p className="text-xs text-brand-blue-700 mt-2">{opt.sub}</p>
                    </button>
                  ))}
                </div>

                {form.deliveryType === 'DELIVERY' && (
                  <div className="bg-white border border-paper-line rounded-2xl shadow-sm p-5 space-y-4">
                    <p className="text-sm font-semibold text-paper-ink-soft">📍 Dirección de entrega</p>

                    {isLoggedIn && savedAddresses.length > 0 && !showNewAddressForm && (
                      <div className="space-y-2">
                        {savedAddresses.map(a => (
                          <button key={a.id} type="button" onClick={() => pickSavedAddress(a.id)}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                              selectedAddressId === a.id ? 'border-brand-blue-500 bg-brand-blue-50' : 'border-paper-line hover:border-paper-ink-faint'
                            }`}>
                            <p className="text-sm font-semibold text-paper-ink">{a.label}</p>
                            <p className="text-xs text-paper-ink-soft">{a.address}, {a.district}</p>
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
                          <label className="block text-sm text-paper-ink-soft mb-2">Dirección completa *</label>
                          <input value={form.address} onChange={set('address')}
                            placeholder="Ej: Av. Los Álamos 123, Mz A Lt 5"
                            className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-paper-ink outline-none transition-colors" />
                        </div>
                        <div>
                          <label className="block text-sm text-paper-ink-soft mb-2">Distrito</label>
                          <select value={form.district} onChange={set('district')}
                            className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-paper-ink outline-none transition-colors">
                            {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-paper-ink-soft mb-2">Referencia <span className="text-paper-ink-ghost">(opcional)</span></label>
                          <input value={form.reference} onChange={set('reference')}
                            placeholder="Cerca al parque, frente a la bodega..."
                            className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-paper-ink outline-none transition-colors" />
                        </div>
                        {isLoggedIn && (
                          <label className="flex items-center gap-2 text-sm text-paper-ink-soft cursor-pointer">
                            <input type="checkbox" checked={saveNewAddress} onChange={e => setSaveNewAddress(e.target.checked)}
                              className="rounded border-paper-line text-brand-blue-600 focus:ring-brand-blue-400" />
                            Guardar esta dirección en mi cuenta
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-paper-ink-soft mb-2">Notas adicionales <span className="text-paper-ink-ghost">(opcional)</span></label>
                  <textarea value={form.notes} onChange={set('notes')} rows={2}
                    placeholder="Horario preferido de entrega, instrucciones especiales..."
                    className="w-full bg-white border border-paper-line focus:border-brand-blue-400 rounded-xl px-4 py-3 text-sm text-paper-ink outline-none transition-colors resize-none" />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="px-6 py-4 bg-white hover:bg-paper-surface border border-paper-line rounded-xl font-medium text-paper-ink-soft transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => {
                      if (!form.deliveryType) { toast.error('Elige cómo recibirás tu pedido'); return }
                      if (form.deliveryType === 'DELIVERY' && !form.address.trim()) { toast.error('Ingresa tu dirección de entrega'); return }
                      setStep(3)
                    }}
                    className="flex-1 bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    Siguiente: Elegir pago <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1 text-paper-ink">¿Cómo quieres pagar?</h2>
                  <p className="text-sm text-paper-ink-soft">Elige tu método de pago preferido</p>
                </div>

                <div className="space-y-3">
                  {/* Plin deshabilitado temporalmente — no hay cuenta Plin
                      activa todavía; se reactiva sumando la opción de vuelta
                      acá y en el enum de store.routes.ts cuando haya una. */}
                  {([
                    { val: 'YAPE', icon: '/yape.png', title: 'Yape', desc: 'Paga con tu app Yape', sub: 'Escanea el QR y listo' },
                    {
                      val: 'CASH', icon: '/cash.png',
                      title: form.deliveryType === 'PICKUP' ? 'Efectivo en tienda' : 'Pago contra entrega',
                      desc: form.deliveryType === 'PICKUP' ? 'Paga cuando recojas tu pedido' : 'Paga en efectivo al recibir',
                      sub: 'Sin cobros adicionales'
                    },
                  ] as const).map(opt => (
                    <button key={opt.val}
                      onClick={() => setForm(v => ({ ...v, paymentMethod: opt.val }))}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                        form.paymentMethod === opt.val
                          ? 'border-brand-green-500 bg-brand-green-50 ring-2 ring-brand-green-100'
                          : 'border-paper-line bg-white hover:border-paper-ink-faint shadow-sm'
                      }`}>
                      <div className="flex items-start gap-4">
                        <img src={opt.icon} alt={opt.title} className="h-11 w-11 rounded-xl object-contain shrink-0" />
                        <div className="flex-1">
                          <p className="font-bold text-base text-paper-ink">{opt.title}</p>
                          <p className="text-sm text-paper-ink-soft mt-0.5">{opt.desc}</p>
                          <p className="text-xs text-paper-ink-ghost mt-1">{opt.sub}</p>
                        </div>
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                          form.paymentMethod === opt.val ? 'border-brand-green-600 bg-brand-green-600' : 'border-paper-line'
                        }`}>
                          {form.paymentMethod === opt.val && <Check className="h-4 w-4 text-white" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {form.paymentMethod === 'YAPE' && (
                  <div className="bg-brand-blue-50 border border-brand-blue-200 rounded-xl p-4 text-sm flex flex-col items-center text-center gap-2">
                    <p className="font-semibold text-paper-ink">Escanea y paga con Yape</p>
                    <img src="/yape-qr.png" alt="QR de Yape para pagar" className="w-40 rounded-xl border border-paper-line" />
                    <p className="text-paper-ink-soft">
                      Paga <strong className="text-paper-ink">S/ {total.toFixed(2)}</strong> y guarda tu captura — te la pedimos apenas confirmes el pedido.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="px-6 py-4 bg-white hover:bg-paper-surface border border-paper-line rounded-xl font-medium text-paper-ink-soft transition-colors flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />Atrás
                  </button>
                  <button
                    onClick={() => { if (!form.paymentMethod) { toast.error('Elige un método de pago'); return } mutation.mutate() }}
                    disabled={mutation.isPending}
                    className="flex-1 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-base">
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

          {/* Order summary - sticky, estilo ticket */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-2xl border border-paper-line shadow-sm sticky top-36 overflow-hidden">
              {/* Franja perforada */}
              <div className="h-2 shrink-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(32,30,29,.18) 1.5px, transparent 1.5px)', backgroundSize: '10px 10px', backgroundPosition: 'center' }} />
              <div className="p-5">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-paper-ink">
                <ShoppingBag className="h-4 w-4 text-brand-blue-600" />
                Tu pedido
              </h3>
              <div className="space-y-0 max-h-48 overflow-y-auto mb-4">
                {items.map((item, idx) => (
                  <div key={item.product.id} className={`flex gap-3 py-2.5 ${idx > 0 ? 'border-t border-dashed border-paper-line' : ''}`}>
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt={item.product.name} className="h-10 w-10 rounded-lg object-cover shrink-0 bg-paper-surface" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-paper-surface shrink-0 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-paper-ink-ghost" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-paper-ink line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-paper-ink-ghost">×{item.quantity} · S/ {item.product.salePrice.toFixed(2)} c/u</p>
                    </div>
                    <p className="text-xs font-extrabold text-paper-ink shrink-0">S/ {(item.product.salePrice * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-paper-line pt-3 space-y-2 text-sm">
                <div className="flex justify-between text-paper-ink-soft">
                  <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>S/ {total.toFixed(2)}</span>
                </div>
                {form.deliveryType === 'DELIVERY' && (
                  <div className="flex justify-between text-paper-ink-soft">
                    <span>Delivery</span>
                    <span className="text-amber-600">A coordinar</span>
                  </div>
                )}
                {form.deliveryType === 'PICKUP' && (
                  <div className="flex justify-between text-paper-ink-soft">
                    <span>Recojo en tienda</span>
                    <span className="text-brand-blue-700">Gratis</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between font-black text-lg border-t border-dashed border-paper-line mt-3 pt-3 text-paper-ink">
                <span>TOTAL</span>
                <span className="text-brand-green-700">S/ {total.toFixed(2)}</span>
              </div>

              {/* Summary of selected options */}
              {(form.deliveryType || form.paymentMethod) && (
                <div className="mt-4 pt-4 border-t border-dashed border-paper-line space-y-2 text-xs text-paper-ink-soft">
                  {form.customerName && <p>👤 {form.customerName}</p>}
                  {form.deliveryType === 'DELIVERY' && form.address && <p>📍 {form.address}, {form.district}</p>}
                  {form.deliveryType === 'PICKUP' && <p>🏪 Recojo en Av. Manchay, Pachacamac</p>}
                  {form.paymentMethod === 'YAPE' && <p className="flex items-center gap-1.5"><img src="/yape.png" alt="" className="h-4 w-4 rounded object-contain" />Pago por Yape</p>}
                  {form.paymentMethod === 'CASH' && <p className="flex items-center gap-1.5"><img src="/cash.png" alt="" className="h-4 w-4 object-contain" />{form.deliveryType === 'PICKUP' ? 'Efectivo en tienda' : 'Contra entrega'}</p>}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
