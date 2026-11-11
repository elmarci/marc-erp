import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Check, ShoppingBag, Truck, Store, Plus, LocateFixed, CheckCircle2, Gift, Zap } from 'lucide-react'
import { useCartStore, cartTotal } from '../cartStore'
import { useAuthStore } from '../authStore'
import { storeApi } from '../api'
import { toast } from 'sonner'
import { DELIVERY, FEES, cardFee, deliveryDays, deliveryFee, deliveryStatus, money } from '../lib/storeInfo'

// Quien compra sin cuenta no vuelve a escribir su nombre y WhatsApp en cada
// pedido: se recuerdan en este equipo.
const CONTACT_KEY = 'marc-checkout-contact'
function savedContact(): { name?: string; phone?: string } {
  try { return JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}') } catch { return {} }
}

export function CheckoutPage() {
  const items = useCartStore(s => s.items)
  const clearCart = useCartStore(s => s.clearCart)
  const { customer, isLoggedIn } = useAuthStore()
  const navigate = useNavigate()
  const total = cartTotal(items)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [saveNewAddress, setSaveNewAddress] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // El cliente puede no estar en el lugar de entrega al pedir (o el celular
  // puede negar el GPS): entonces el envío se cobra por zona.
  const [gpsSkipped, setGpsSkipped] = useState(false)

  // Cuándo: día (hoy / mañana / pasado), turno y hora dentro del turno; o
  // express (lo antes posible), solo mientras hay reparto en curso.
  const days = deliveryDays()
  const expressAvailable = deliveryStatus().now
  const firstDay = days.find(d => d.turns.length > 0)?.offset ?? 1
  const [dayOffset, setDayOffset] = useState(firstDay)
  const [turnKey, setTurnKey] = useState<'M' | 'T' | 'X' | ''>('')
  const [hour, setHour] = useState('')
  const day = days.find(d => d.offset === dayOffset) ?? days[1]
  const turn = day.turns.find(t => t.key === turnKey)
  const express = turnKey === 'X'

  // Quién recibe: el mismo que hace el pedido u otra persona.
  const [otherReceiver, setOtherReceiver] = useState(false)
  const [receiver, setReceiver] = useState({ name: '', phone: '' })

  const { data: profileData } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => storeApi.getProfile(),
    enabled: !!isLoggedIn,
  })
  const savedAddresses = profileData?.data.data.addresses ?? []

  // Canje de puntos — mismo valor por punto (loyalty_point_value) que ya
  // usa el POS del ERP, así "cuánto vale un punto" nunca se desalinea entre
  // canal online y tienda física (ver store.service.ts).
  const { data: displaySettings } = useQuery({
    queryKey: ['store-display-settings'],
    queryFn: () => storeApi.getDisplaySettings(),
  })
  const pointValue = displaySettings?.data.data.loyaltyPointValue ?? 0.03
  const pointsAvailable = profileData?.data.data.loyaltyPoints ?? 0
  const [usePoints, setUsePoints] = useState(false)
  // No canjea más puntos de los necesarios para cubrir el pedido — si tiene
  // 1000 puntos y el pedido cuesta S/10, no le conviene gastarlos todos acá.
  const [form, setForm] = useState({
    customerName: customer?.name ?? savedContact().name ?? '',
    customerPhone: customer?.phone ?? savedContact().phone ?? '',
    customerEmail: customer?.email ?? '',
    deliveryType: '' as 'DELIVERY' | 'PICKUP' | '',
    address: '', district: '', reference: '',
    paymentMethod: '' as 'YAPE' | 'CASH' | 'YAPE_CONTRAENTREGA' | 'CARD_CONTRAENTREGA' | '',
    notes: '',
  })

  // Envío: por distancia a la tienda si hay GPS útil; si no, por zona. El
  // servidor lo recalcula con la misma regla y ese es el que vale.
  const shipping = deliveryFee({ coords, zone: form.district, express })
  const feeKnown = form.deliveryType === 'DELIVERY' && (shipping.km != null || !!form.district)
  const fee = form.deliveryType === 'DELIVERY' && feeKnown ? shipping.fee : 0
  const pointsNeeded = pointValue > 0 ? Math.ceil((total + fee) / pointValue) : 0
  const pointsToRedeem = usePoints ? Math.min(pointsAvailable, pointsNeeded) : 0
  const pointsDiscount = Math.min(pointsToRedeem * pointValue, total + fee)
  const cardCommission = form.paymentMethod === 'CARD_CONTRAENTREGA' ? cardFee(total + fee - pointsDiscount) : 0
  const finalTotal = total + fee - pointsDiscount + cardCommission

  // Fecha, turno, hora y quién recibe viajan al inicio de la nota del
  // pedido: así la tienda y el repartidor los ven sin cambiar la base de datos.
  const orderNotes = () => {
    const lines: string[] = []
    if (form.deliveryType === 'DELIVERY') {
      lines.push(express
        ? `ENTREGA: hoy ${day.date}, EXPRESS (lo antes posible)`
        : `ENTREGA: ${day.label.toLowerCase()} ${day.date}, turno ${turn?.name.toLowerCase()} (${turn?.range}), hora ${hour}`)
    }
    if (otherReceiver) lines.push(`RECIBE: ${receiver.name.trim()}, cel. ${receiver.phone.trim()}`)
    else lines.push('RECIBE: el mismo cliente')
    if (form.notes.trim()) lines.push(`NOTA: ${form.notes.trim()}`)
    return lines.join(' | ')
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  // Ubicación GPS del navegador — sólo ayuda a ubicar mejor la entrega, nunca
  // reemplaza la dirección escrita a mano (que sigue siendo obligatoria).
  const shareLocation = () => {
    if (!navigator.geolocation) { toast.error('Tu navegador no soporta compartir ubicación.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
        setGpsSkipped(false)
      },
      () => {
        setLocating(false)
        setGpsSkipped(true)
        toast.error('No pudimos leer tu ubicación. Calcularemos el envío por tu zona.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

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
      notes: orderNotes(),
      paymentMethod: form.paymentMethod,
      express: form.deliveryType === 'DELIVERY' && express ? true : undefined,
      latitude: coords?.lat,
      longitude: coords?.lng,
      pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
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
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: form.customerName, phone: form.customerPhone })) } catch { /* sin almacenamiento */ }
      clearCart()
      navigate(`/pedido/${res.data.data.orderNumber}`, { replace: true })
    },
    onError: (err) => toast.error(
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? 'No pudimos enviar tu pedido. Revisa tu conexión e intenta de nuevo.'),
  })

  if (items.length === 0) {
    return (
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <ShoppingBag className="h-14 w-14 mx-auto mb-4 text-paper-ink-soft" aria-hidden="true" />
        <p className="text-lg font-bold text-paper-ink">Aún no tienes productos</p>
        <p className="text-sm text-paper-ink-soft mt-1 mb-5">Agrega lo que necesitas y vuelve para hacer tu pedido.</p>
        <Link to="/" className="h-12 rounded-xl bg-brand-blue-600 text-white font-bold flex items-center justify-center">Ver productos</Link>
      </main>
    )
  }

  const isDelivery = form.deliveryType === 'DELIVERY'
  const isPickup = form.deliveryType === 'PICKUP'
  const showAddressForm = !isLoggedIn || savedAddresses.length === 0 || showNewAddressForm

  // Una sola pantalla: se valida todo al confirmar y se avisa del primer
  // dato que falta, en el orden en que aparece.
  const confirm = () => {
    if (!form.deliveryType) { toast.error('Elige si te lo llevamos o lo recoges'); return }
    if (isDelivery && !form.address.trim()) { toast.error('Escribe tu dirección de entrega'); return }
    if (isDelivery && !form.district) { toast.error('Elige tu zona'); return }
    if (isDelivery && !coords && !gpsSkipped) { toast.error('Comparte tu ubicación, o indica que no estás en el lugar de entrega'); return }
    if (isDelivery && !turnKey) { toast.error('Elige el turno de entrega'); return }
    if (isDelivery && !express && !hour) { toast.error('Elige la hora de entrega'); return }
    if (form.customerName.trim().length < 2) { toast.error('Escribe tu nombre'); return }
    if (form.customerPhone.replace(/\D/g, '').length < 9) { toast.error('Escribe tu WhatsApp de 9 dígitos'); return }
    if (otherReceiver && receiver.name.trim().length < 2) { toast.error('Escribe el nombre de quien recibe'); return }
    if (otherReceiver && receiver.phone.replace(/\D/g, '').length < 9) { toast.error('Escribe el celular de quien recibe'); return }
    if (!form.paymentMethod) { toast.error('Elige cómo quieres pagar'); return }
    mutation.mutate()
  }

  const card = 'bg-white rounded-2xl shadow-card p-4'
  const h2 = 'text-[17px] font-extrabold text-paper-ink'
  // Cada paso lleva su número en un círculo azul: separa los bloques y deja
  // claro en cuál está el cliente.
  const step = (n: number, id: string, title: string) => (
    <div className="flex items-center gap-2.5 mb-3.5">
      <span className="h-7 w-7 rounded-full bg-brand-blue-600 text-white text-sm font-extrabold flex items-center justify-center shrink-0" aria-hidden="true">{n}</span>
      <h2 id={id} className={h2}>{title}</h2>
    </div>
  )
  const sub = 'text-[13px] font-bold uppercase tracking-wide text-paper-ink-soft mb-2'
  const chip = (active: boolean) =>
    `min-h-12 rounded-xl border-2 px-2 py-1.5 flex flex-col items-center justify-center text-center leading-tight ${active ? 'border-brand-blue-600 bg-brand-blue-50 text-brand-blue-700' : 'border-paper-line bg-white text-paper-ink'}`
  const label = 'block text-[15px] font-semibold text-paper-ink mb-1.5'
  const input = 'w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none'
  const option = (active: boolean) =>
    `w-full text-left rounded-xl border-2 p-3.5 flex items-center gap-3 ${active ? 'border-brand-blue-600 bg-brand-blue-50' : 'border-paper-line bg-white'}`
  const radio = (active: boolean) => (
    <span className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-brand-blue-600 bg-brand-blue-600' : 'border-paper-ink-ghost'}`} aria-hidden="true">
      {active && <Check className="h-4 w-4 text-white" />}
    </span>
  )

  const payments = [
    { val: 'YAPE', icon: '/yape.png', title: 'Yape ahora', desc: 'Escaneas el QR y nos mandas la captura' },
    { val: 'YAPE_CONTRAENTREGA', icon: '/yape.png', title: isPickup ? 'Yape al recoger' : 'Yape al recibir', desc: 'Pagas cuando tengas tu pedido' },
    { val: 'CASH', icon: '/cash.png', title: isPickup ? 'Efectivo en tienda' : 'Efectivo al recibir', desc: 'Pagas cuando tengas tu pedido' },
    { val: 'CARD_CONTRAENTREGA', icon: '/card.svg', title: isPickup ? 'Tarjeta en tienda' : 'Tarjeta al recibir', desc: `${isPickup ? 'Débito o crédito, en caja' : 'Débito o crédito. El repartidor lleva el POS'}. Comisión de ${FEES.cardPercent} %` },
  ] as const

  return (
    <main className="max-w-2xl mx-auto px-4 pt-2 pb-28 md:pb-10">
      <Link to="/" className="inline-flex items-center gap-1 h-11 text-sm font-bold text-brand-blue-600">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Seguir comprando
      </Link>
      <h1 className="text-2xl font-extrabold text-paper-ink mb-4">Tu pedido</h1>

      <div className="space-y-4">
        {/* 1. Entrega: dos opciones lado a lado */}
        <section className={card} aria-labelledby="co-entrega">
          {step(1, 'co-entrega', '¿Cómo lo recibes?')}
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="co-entrega">
            {([
              { val: 'DELIVERY', Icon: Truck, title: 'Delivery', desc: `Desde ${money(DELIVERY.costFrom)}` },
              { val: 'PICKUP', Icon: Store, title: 'Recojo en tienda', desc: 'Sin costo' },
            ] as const).map(o => {
              const active = form.deliveryType === o.val
              return (
                <button key={o.val} type="button" role="radio" aria-checked={active}
                  onClick={() => setForm(v => ({ ...v, deliveryType: o.val }))}
                  className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1 text-center ${active ? 'border-brand-blue-600 bg-brand-blue-50' : 'border-paper-line bg-white'}`}>
                  <o.Icon className="h-6 w-6 text-brand-blue-600" aria-hidden="true" />
                  <span className="font-bold text-paper-ink text-[15px] leading-tight">{o.title}</span>
                  <span className="text-[13px] text-paper-ink-soft">{o.desc}</span>
                </button>
              )
            })}
          </div>
          {isPickup && (
            <p className="mt-3 text-sm text-paper-ink-soft bg-paper-surface rounded-xl px-3.5 py-2.5 leading-snug">
              Te avisamos por WhatsApp cuando esté listo. Recoge en Av. Manchay, de 7 am a 10 pm.
            </p>
          )}
        </section>

        {/* 2. Dónde */}
        {isDelivery && (
          <section className={card} aria-labelledby="co-donde">
            {step(2, 'co-donde', '¿Dónde lo entregamos?')}
            <div className="space-y-3.5">
              {!showAddressForm && (
                <div className="space-y-2.5">
                  {savedAddresses.map(a => (
                    <button key={a.id} type="button" onClick={() => pickSavedAddress(a.id)} className={option(selectedAddressId === a.id)}>
                      <MapPin className="h-5 w-5 text-brand-blue-600 shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-paper-ink">{a.label}</span>
                        <span className="block text-sm text-paper-ink-soft">{a.address}, {a.district}</span>
                      </span>
                      {radio(selectedAddressId === a.id)}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setShowNewAddressForm(true); setSelectedAddressId(null); setForm(v => ({ ...v, address: '', district: '', reference: '' })) }}
                    className="w-full h-11 flex items-center justify-center gap-1.5 text-[15px] font-bold text-brand-blue-600">
                    <Plus className="h-4 w-4" />Usar otra dirección
                  </button>
                </div>
              )}

              {showAddressForm && (
                <>
                  <div>
                    <label htmlFor="co-address" className={label}>Dirección</label>
                    <input id="co-address" value={form.address} onChange={set('address')} autoComplete="street-address"
                      placeholder="Mz A Lt 5, calle o avenida" className={input} />
                  </div>
                  <div>
                    <label htmlFor="co-zone" className={label}>Zona</label>
                    <select id="co-zone" value={form.district} onChange={set('district')} className={input}>
                      <option value="">Elige tu zona</option>
                      {DELIVERY.zones.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                    <p className="text-sm text-paper-ink-soft mt-1.5">Solo repartimos en {DELIVERY.zoneName}.</p>
                  </div>
                  <div>
                    <label htmlFor="co-ref" className={label}>Referencia <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
                    <input id="co-ref" value={form.reference} onChange={set('reference')}
                      placeholder="Frente al parque, portón verde" className={input} />
                  </div>
                  {isLoggedIn && (
                    <label className="flex items-center gap-3 min-h-11 text-[15px] text-paper-ink cursor-pointer">
                      <input type="checkbox" checked={saveNewAddress} onChange={e => setSaveNewAddress(e.target.checked)}
                        className="h-5 w-5 rounded border-paper-ink-ghost accent-brand-blue-600" />
                      Guardar esta dirección en mi cuenta
                    </label>
                  )}
                </>
              )}

              {/* Ubicación exacta: con ella el repartidor llega directo y el
                  envío se calcula por distancia a la tienda. */}
              <div className="border-t border-paper-line pt-3.5">
                <p className={sub}>Ubicación exacta</p>
                {coords ? (
                  <div className="flex items-start gap-2.5 bg-brand-green-50 rounded-xl px-3.5 py-3">
                    <CheckCircle2 className="h-5 w-5 text-brand-green-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-[15px] text-paper-ink leading-snug">
                      <span className="font-bold">Ubicación recibida.</span>{' '}
                      {shipping.km != null
                        ? `Estás a ${shipping.km < 1 ? `${Math.round(shipping.km * 100) * 10} m` : `${shipping.km.toFixed(1)} km`} de la tienda.`
                        : 'Estás lejos de la zona de reparto, así que calculamos el envío por tu zona.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={shareLocation} disabled={locating}
                      className="w-full h-12 flex items-center justify-center gap-2 text-[15px] font-bold text-white bg-brand-blue-600 active:bg-brand-blue-700 rounded-xl disabled:opacity-60">
                      <LocateFixed className="h-5 w-5" aria-hidden="true" />
                      {locating ? 'Buscando tu ubicación…' : 'Compartir mi ubicación'}
                    </button>
                    <label className="flex items-center gap-3 min-h-11 mt-1 text-[15px] text-paper-ink cursor-pointer">
                      <input type="checkbox" checked={gpsSkipped} onChange={e => setGpsSkipped(e.target.checked)}
                        className="h-5 w-5 rounded border-paper-ink-ghost accent-brand-blue-600" />
                      No estoy en el lugar de entrega
                    </label>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 3. Cuándo */}
        {isDelivery && (
          <section className={card} aria-labelledby="co-cuando">
            {step(3, 'co-cuando', '¿Cuándo lo quieres?')}
            <p className={sub}>Día</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Día de entrega">
              {days.map(d => {
                const active = dayOffset === d.offset
                const none = d.turns.length === 0
                return (
                  <button key={d.offset} type="button" role="radio" aria-checked={active} disabled={none}
                    onClick={() => { setDayOffset(d.offset); setTurnKey(''); setHour('') }}
                    className={`${chip(active)} disabled:opacity-50`}>
                    <span className="text-[15px] font-bold">{d.label}</span>
                    <span className="text-xs text-paper-ink-soft">{none ? 'Sin turnos' : d.date}</span>
                  </button>
                )
              })}
            </div>

            <p className={`${sub} mt-4`}>Turno</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Turno de entrega">
              {day.turns.map(t => (
                <button key={t.key} type="button" role="radio" aria-checked={turnKey === t.key}
                  onClick={() => { setTurnKey(t.key); setHour('') }} className={chip(turnKey === t.key)}>
                  <span className="text-[15px] font-bold">{t.name}</span>
                  <span className="text-xs text-paper-ink-soft">{t.range}</span>
                </button>
              ))}
              {dayOffset === 0 && expressAvailable && (
                <button type="button" role="radio" aria-checked={express}
                  onClick={() => { setTurnKey('X'); setHour('') }} className={`${chip(express)} ${day.turns.length % 2 === 0 ? 'col-span-2' : ''}`}>
                  <span className="text-[15px] font-bold flex items-center gap-1"><Zap className="h-4 w-4" aria-hidden="true" />Express</span>
                  <span className="text-xs text-paper-ink-soft">Lo antes posible · +{money(FEES.expressExtra)}</span>
                </button>
              )}
            </div>

            {turn && (
              <>
                <label htmlFor="co-hour" className={`${sub} block mt-4`}>Hora</label>
                <select id="co-hour" value={hour} onChange={e => setHour(e.target.value)} className={input}>
                  <option value="">Elige la hora</option>
                  {turn.times.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}

            <div className="mt-4 flex items-center justify-between bg-paper-surface rounded-xl px-3.5 h-12">
              <span className="text-[15px] font-semibold text-paper-ink">Costo de envío</span>
              <span className="text-[15px] font-extrabold text-paper-ink tabular-nums">
                {feeKnown ? money(shipping.fee) : 'Comparte tu ubicación o elige tu zona'}
              </span>
            </div>
          </section>
        )}

        {/* Datos y quién recibe */}
        <section className={card} aria-labelledby="co-datos">
          {step(isDelivery ? 4 : 2, 'co-datos', isPickup ? '¿Quién lo recoge?' : '¿Quién lo recibe?')}
          <div className="space-y-3.5">
            <div>
              <label htmlFor="co-name" className={label}>Tu nombre</label>
              <input id="co-name" value={form.customerName} onChange={set('customerName')} autoComplete="name"
                placeholder="María García" className={input} />
            </div>
            <div>
              <label htmlFor="co-phone" className={label}>Tu WhatsApp</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-paper-ink-soft">+51</span>
                <input id="co-phone" value={form.customerPhone} onChange={set('customerPhone')} type="tel" inputMode="numeric"
                  autoComplete="tel-national" maxLength={9} placeholder="987 654 321" className={`${input} pl-12`} />
              </div>
              <p className="text-sm text-paper-ink-soft mt-1.5">Por aquí te confirmamos el pedido.</p>
            </div>

            <div className="border-t border-paper-line pt-3.5">
              <p className={sub}>{isPickup ? 'Persona que recoge' : 'Persona que recibe'}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={isPickup ? 'Persona que recoge' : 'Persona que recibe'}>
                <button type="button" role="radio" aria-checked={!otherReceiver} onClick={() => setOtherReceiver(false)} className={chip(!otherReceiver)}>
                  <span className="text-[15px] font-bold">Yo mismo</span>
                </button>
                <button type="button" role="radio" aria-checked={otherReceiver} onClick={() => setOtherReceiver(true)} className={chip(otherReceiver)}>
                  <span className="text-[15px] font-bold">Otra persona</span>
                </button>
              </div>
              {otherReceiver && (
                <div className="mt-3.5 space-y-3.5">
                  <div>
                    <label htmlFor="co-rname" className={label}>Nombre de quien {isPickup ? 'recoge' : 'recibe'}</label>
                    <input id="co-rname" value={receiver.name} onChange={e => setReceiver(v => ({ ...v, name: e.target.value }))}
                      placeholder="Nombre y apellido" className={input} />
                  </div>
                  <div>
                    <label htmlFor="co-rphone" className={label}>Su celular</label>
                    <input id="co-rphone" value={receiver.phone} onChange={e => setReceiver(v => ({ ...v, phone: e.target.value }))}
                      type="tel" inputMode="numeric" maxLength={9} placeholder="987 654 321" className={input} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="co-notes" className={label}>Nota para la tienda <span className="font-normal text-paper-ink-soft">(opcional)</span></label>
              <textarea id="co-notes" value={form.notes} onChange={set('notes')} rows={2}
                placeholder="Tocar el timbre, sin bolsa…"
                className="w-full bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 py-3 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none resize-none" />
            </div>
            {!isLoggedIn && (
              <p className="text-sm text-paper-ink-soft">
                ¿Ya tienes cuenta? <Link to="/ingresar" className="font-bold text-brand-blue-600 underline inline-block py-3 -my-3">Ingresa</Link> para usar tus puntos y direcciones guardadas.
              </p>
            )}
          </div>
        </section>

        {/* Pago */}
        <section className={card} aria-labelledby="co-pago">
          {step(isDelivery ? 5 : 3, 'co-pago', '¿Cómo pagas?')}
          <div className="space-y-2.5" role="radiogroup" aria-labelledby="co-pago">
            {payments.map(opt => (
              <button key={opt.val} type="button" role="radio" aria-checked={form.paymentMethod === opt.val}
                onClick={() => setForm(v => ({ ...v, paymentMethod: opt.val }))} className={option(form.paymentMethod === opt.val)}>
                <img src={opt.icon} alt="" width={36} height={36} className="h-9 w-9 rounded-lg object-contain shrink-0" />
                <span className="flex-1">
                  <span className="block font-bold text-paper-ink">{opt.title}</span>
                  <span className="block text-sm text-paper-ink-soft">{opt.desc}</span>
                </span>
                {radio(form.paymentMethod === opt.val)}
              </button>
            ))}
          </div>

          {form.paymentMethod === 'YAPE' && (
            <div className="mt-3.5 bg-paper-surface rounded-xl p-4 flex flex-col items-center text-center gap-2.5">
              <img src="/yape-qr.png" alt="QR de Tiendas Marc para Yape" width={176} height={176} loading="lazy" className="w-44 rounded-xl bg-white" />
              <p className="text-[15px] text-paper-ink-soft leading-snug">
                Yapea <strong className="text-paper-ink">{money(finalTotal)}</strong> y guarda la captura. Te la pedimos al confirmar.
              </p>
            </div>
          )}
        </section>

        {/* Resumen */}
        <section className={card} aria-labelledby="co-resumen">
          <h2 id="co-resumen" className={`${h2} mb-3`}>Resumen</h2>
          <ul className="divide-y divide-paper-line -mt-1">
            {items.map(item => (
              <li key={item.product.id} className="flex items-baseline gap-3 py-2.5 text-[15px]">
                <span className="font-bold text-paper-ink tabular-nums shrink-0">{item.quantity} ×</span>
                <span className="flex-1 min-w-0 text-paper-ink line-clamp-2">{item.product.name}</span>
                <span className="font-bold text-paper-ink tabular-nums shrink-0">{money(item.product.salePrice * item.quantity)}</span>
              </li>
            ))}
          </ul>

          {/* Canje de puntos: saldo real del ERP, el mismo que ve la caja. */}
          {isLoggedIn && pointsAvailable > 0 && (
            <label className={`mt-3 flex items-center gap-3 rounded-xl border-2 p-3.5 cursor-pointer ${usePoints ? 'border-brand-blue-600 bg-brand-blue-50' : 'border-paper-line'}`}>
              <input type="checkbox" checked={usePoints} onChange={e => setUsePoints(e.target.checked)}
                className="h-5 w-5 rounded accent-brand-blue-600 shrink-0" />
              <Gift className="h-5 w-5 text-brand-blue-600 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-[15px] text-paper-ink">
                Usar {pointsToRedeem > 0 ? pointsToRedeem : Math.min(pointsAvailable, pointsNeeded)} de tus <b>{pointsAvailable} puntos</b>
              </span>
              <span className="text-[15px] font-bold text-paper-ink shrink-0 tabular-nums">
                −{money(usePoints ? pointsDiscount : Math.min(pointsAvailable * pointValue, total))}
              </span>
            </label>
          )}

          <dl className="mt-3 pt-3 border-t border-paper-line space-y-1.5 text-[15px]">
            <div className="flex justify-between text-paper-ink-soft">
              <dt>Productos</dt><dd className="tabular-nums">{money(total)}</dd>
            </div>
            {usePoints && pointsDiscount > 0 && (
              <div className="flex justify-between text-paper-ink-soft">
                <dt>Puntos canjeados</dt><dd className="tabular-nums">−{money(pointsDiscount)}</dd>
              </div>
            )}
            {isDelivery && (
              <div className="flex justify-between text-paper-ink-soft">
                <dt>Envío{express ? ' express' : ''}</dt><dd className="tabular-nums">{feeKnown ? money(fee) : 'Falta tu zona'}</dd>
              </div>
            )}
            {isPickup && (
              <div className="flex justify-between text-paper-ink-soft">
                <dt>Recojo en tienda</dt><dd>Sin costo</dd>
              </div>
            )}
            {cardCommission > 0 && (
              <div className="flex justify-between text-paper-ink-soft">
                <dt>Comisión por tarjeta ({FEES.cardPercent} %)</dt><dd className="tabular-nums">{money(cardCommission)}</dd>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 text-paper-ink">
              <dt className="text-base font-bold">Total</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{money(finalTotal)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Confirmar: fijo sobre la barra inferior en celular. */}
      <div className="fixed md:static inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 bg-white md:bg-transparent border-t md:border-0 border-paper-line px-4 py-3 md:px-0 md:mt-4">
        <button onClick={confirm} disabled={mutation.isPending}
          className="w-full max-w-2xl mx-auto h-[52px] rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 disabled:opacity-60 text-white font-bold text-base flex items-center justify-between px-5">
          <span>{mutation.isPending ? 'Enviando tu pedido…' : 'Confirmar pedido'}</span>
          <span className="tabular-nums">{money(finalTotal)}</span>
        </button>
      </div>
    </main>
  )
}
