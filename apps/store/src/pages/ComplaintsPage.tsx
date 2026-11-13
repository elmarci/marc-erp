import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { BookOpen, CheckCircle2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { storeApi, type Complaint, type ComplaintInput } from '../api'
import { useAuthStore } from '../authStore'
import { BUSINESS, money } from '../lib/storeInfo'

// Libro de Reclamaciones virtual (Código de Protección y Defensa del
// Consumidor, Ley 29571, y su reglamento D.S. 011-2011-PCM). La hoja lleva
// los datos del proveedor, número correlativo, fecha, datos del consumidor,
// el bien contratado, el detalle y el pedido. Se responde en 15 días hábiles.

const DEFINITIONS = {
  RECLAMO: 'Disconformidad con los productos o el servicio que compraste.',
  QUEJA: 'Malestar con la atención, sin relación directa con el producto o servicio.',
} as const

const input = 'w-full h-12 bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none'
const area = 'w-full bg-white border border-paper-line focus:border-brand-blue-600 rounded-xl px-3.5 py-3 text-base text-paper-ink placeholder:text-paper-ink-ghost outline-none resize-none'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-paper-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-paper-ink-soft mt-1">{hint}</span>}
    </label>
  )
}

function Choice<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`h-12 rounded-xl text-[15px] font-bold border ${value === o.value ? 'bg-brand-blue-600 border-brand-blue-600 text-white' : 'bg-white border-paper-line text-paper-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const card = 'bg-white rounded-2xl shadow-card p-4 space-y-4'
const h2 = 'text-[13px] font-bold uppercase tracking-wide text-paper-ink-soft'
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })

function Provider() {
  return (
    <div className="text-sm text-paper-ink-soft leading-snug">
      <p className="font-semibold text-paper-ink">{BUSINESS.owner}</p>
      <p>RUC {BUSINESS.ruc} · {BUSINESS.tradeName}</p>
      <p>{BUSINESS.address}</p>
    </div>
  )
}

export function ComplaintsPage() {
  const [params] = useSearchParams()
  const customer = useAuthStore(s => s.customer)
  const [form, setForm] = useState<ComplaintInput>({
    kind: 'RECLAMO', consumerName: customer?.name ?? '', docType: 'DNI', docNumber: '', address: '',
    phone: customer?.phone ?? '', email: customer?.email ?? '', isMinor: false, guardianName: '',
    itemType: 'PRODUCTO', amount: undefined, itemDescription: '', orderNumber: params.get('pedido') ?? '',
    detail: '', request: '',
  })
  const [accepted, setAccepted] = useState(false)
  const [done, setDone] = useState<Complaint | null>(null)
  const set = <K extends keyof ComplaintInput>(k: K, v: ComplaintInput[K]) => setForm(f => ({ ...f, [k]: v }))

  const submit = useMutation({
    mutationFn: () => storeApi.createComplaint({
      ...form,
      guardianName: form.isMinor ? form.guardianName : undefined,
      orderNumber: form.orderNumber?.trim() || undefined,
      amount: form.amount && form.amount > 0 ? form.amount : undefined,
    }),
    onSuccess: (res) => { setDone(res.data.data); window.scrollTo(0, 0) },
    onError: (err) => toast.error(
      (err as { response?: { status?: number } })?.response?.status === 429
        ? 'Registraste varias hojas seguidas. Intenta en una hora o escríbenos por WhatsApp.'
        : 'Revisa que todos los datos estén completos e intenta de nuevo.'),
  })

  const missing =
    form.consumerName.trim().length < 3 || form.docNumber.trim().length < 6 || form.address.trim().length < 5 ||
    form.phone.replace(/\D/g, '').length < 9 || !/^\S+@\S+\.\S+$/.test(form.email) ||
    (form.isMinor && (form.guardianName ?? '').trim().length < 3) ||
    form.itemDescription.trim().length < 3 || form.detail.trim().length < 10 || form.request.trim().length < 3 || !accepted

  if (done) return <ComplaintReceipt c={done} />

  return (
    <main className="max-w-xl mx-auto px-4 pt-4 pb-10 space-y-3">
      <div className="flex items-start gap-3">
        <span className="h-12 w-12 rounded-xl bg-brand-blue-600 text-white flex items-center justify-center shrink-0">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold text-paper-ink leading-tight">Libro de Reclamaciones</h1>
          <p className="text-sm text-paper-ink-soft">Hoja de reclamación virtual · Fecha: {fmtDate(new Date().toISOString())}</p>
        </div>
      </div>

      <section className={card}>
        <h2 className={h2}>Proveedor</h2>
        <Provider />
      </section>

      <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!missing) submit.mutate() }}>
        <section className={card}>
          <h2 className={h2}>1. Tus datos</h2>
          <Field label="Nombres y apellidos">
            <input className={input} value={form.consumerName} onChange={e => set('consumerName', e.target.value)} autoComplete="name" maxLength={120} required />
          </Field>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Field label="Documento">
              <select className={input} value={form.docType} onChange={e => set('docType', e.target.value as ComplaintInput['docType'])}>
                <option value="DNI">DNI</option><option value="CE">C.E.</option><option value="PASAPORTE">Pasaporte</option>
              </select>
            </Field>
            <Field label="Número">
              <input className={input} value={form.docNumber} onChange={e => set('docNumber', e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                inputMode={form.docType === 'DNI' ? 'numeric' : 'text'} maxLength={15} required />
            </Field>
          </div>
          <Field label="Domicilio">
            <input className={input} value={form.address} onChange={e => set('address', e.target.value)} autoComplete="street-address" maxLength={200} required />
          </Field>
          <Field label="Celular">
            <input className={input} value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^0-9+ ]/g, ''))} inputMode="tel" autoComplete="tel" maxLength={15} required />
          </Field>
          <Field label="Correo electrónico" hint="Aquí te enviaremos la respuesta.">
            <input className={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" maxLength={120} required />
          </Field>
          <label className="flex items-center gap-3 min-h-11">
            <input type="checkbox" className="h-5 w-5 accent-brand-blue-600" checked={form.isMinor} onChange={e => set('isMinor', e.target.checked)} />
            <span className="text-sm text-paper-ink">Soy menor de edad</span>
          </label>
          {form.isMinor && (
            <Field label="Nombre del padre, madre o apoderado">
              <input className={input} value={form.guardianName} onChange={e => set('guardianName', e.target.value)} maxLength={120} required />
            </Field>
          )}
        </section>

        <section className={card}>
          <h2 className={h2}>2. Lo que compraste</h2>
          <Choice label="Tipo de bien" value={form.itemType} onChange={v => set('itemType', v)}
            options={[{ value: 'PRODUCTO', label: 'Producto' }, { value: 'SERVICIO', label: 'Servicio' }]} />
          <Field label="¿Qué producto o servicio?">
            <input className={input} value={form.itemDescription} onChange={e => set('itemDescription', e.target.value)} maxLength={300}
              placeholder={form.itemType === 'PRODUCTO' ? 'Ej. Leche Gloria 400 g' : 'Ej. Delivery de mi pedido'} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Monto (S/)" hint="Opcional">
              <input className={input} inputMode="decimal" value={form.amount ?? ''} placeholder="0.00"
                onChange={e => { const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); set('amount', v === '' ? undefined : Number(v)) }} />
            </Field>
            <Field label="N.º de pedido" hint="Opcional">
              <input className={input} value={form.orderNumber} onChange={e => set('orderNumber', e.target.value.toUpperCase())} placeholder="ORD-00000" maxLength={30} />
            </Field>
          </div>
        </section>

        <section className={card}>
          <h2 className={h2}>3. Tu reclamo o queja</h2>
          <Choice label="Tipo" value={form.kind} onChange={v => set('kind', v)}
            options={[{ value: 'RECLAMO', label: 'Reclamo' }, { value: 'QUEJA', label: 'Queja' }]} />
          <p className="text-sm text-paper-ink-soft -mt-1">{DEFINITIONS[form.kind]}</p>
          <Field label="Detalle" hint="Cuéntanos qué pasó.">
            <textarea className={area} rows={5} value={form.detail} onChange={e => set('detail', e.target.value)} maxLength={2000} required />
          </Field>
          <Field label="¿Qué solicitas?" hint="Ej. cambio del producto, devolución del dinero.">
            <textarea className={area} rows={3} value={form.request} onChange={e => set('request', e.target.value)} maxLength={1000} required />
          </Field>
        </section>

        <section className="text-xs text-paper-ink-soft leading-relaxed space-y-2 px-1">
          <p>La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
          <p>El proveedor deberá dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles improrrogables.</p>
        </section>

        <label className="flex items-start gap-3 bg-white rounded-2xl shadow-card p-4">
          <input type="checkbox" className="h-5 w-5 mt-0.5 accent-brand-blue-600 shrink-0" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
          <span className="text-sm text-paper-ink leading-snug">
            Declaro que los datos son verdaderos y acepto que se usen para atender mi reclamo, según la <Link to="/privacidad" className="text-brand-blue-600 font-semibold underline">política de privacidad</Link>.
          </span>
        </label>

        <button type="submit" disabled={missing || submit.isPending}
          className="w-full h-12 rounded-xl bg-brand-blue-600 active:bg-brand-blue-700 text-white font-bold text-[15px] disabled:opacity-50">
          {submit.isPending ? 'Enviando…' : `Enviar ${form.kind === 'RECLAMO' ? 'reclamo' : 'queja'}`}
        </button>
      </form>
    </main>
  )
}

// Constancia: la hoja completa, para guardar o imprimir (como PDF).
function ComplaintReceipt({ c }: { c: Complaint }) {
  const row = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 text-sm"><dt className="text-paper-ink-soft">{k}</dt><dd className="text-paper-ink break-words">{v}</dd></div>
  )
  return (
    <main className="max-w-xl mx-auto px-4 pt-4 pb-10 space-y-3">
      <section className="bg-white rounded-2xl shadow-card p-4 text-center space-y-1 print:shadow-none">
        <CheckCircle2 className="h-10 w-10 text-brand-green-600 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-extrabold text-paper-ink">Recibimos tu {c.kind === 'RECLAMO' ? 'reclamo' : 'queja'}</h1>
        <p className="text-sm text-paper-ink-soft">Hoja N.º <b className="text-paper-ink tabular-nums">{c.code}</b></p>
        <p className="text-sm text-paper-ink-soft">Te responderemos a <b className="text-paper-ink">{c.email}</b> a más tardar el <b className="text-paper-ink">{fmtDate(c.dueAt)}</b>.</p>
      </section>

      <section className="bg-white rounded-2xl shadow-card p-4 print:shadow-none">
        <h2 className={h2}>Hoja de reclamación virtual</h2>
        <dl className="divide-y divide-paper-line mt-2">
          {row('N.º', c.code)}
          {row('Fecha', fmtDate(c.createdAt))}
          {row('Proveedor', <Provider />)}
          {row('Consumidor', c.consumerName)}
          {row('Documento', `${c.docType} ${c.docNumber}`)}
          {row('Domicilio', c.address)}
          {row('Celular', c.phone)}
          {row('Correo', c.email)}
          {c.isMinor && row('Apoderado', c.guardianName)}
          {row('Bien', `${c.itemType === 'PRODUCTO' ? 'Producto' : 'Servicio'}: ${c.itemDescription}`)}
          {c.amount != null && row('Monto', money(Number(c.amount)))}
          {c.orderNumber && row('Pedido', c.orderNumber)}
          {row('Tipo', c.kind === 'RECLAMO' ? 'Reclamo' : 'Queja')}
          {row('Detalle', c.detail)}
          {row('Pedido del consumidor', c.request)}
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-2 print:hidden">
        <button onClick={() => window.print()} className="h-12 rounded-xl bg-white shadow-card text-paper-ink font-bold flex items-center justify-center gap-2">
          <Printer className="h-5 w-5" aria-hidden="true" />Guardar copia
        </button>
        <Link to="/" className="h-12 rounded-xl bg-brand-blue-600 text-white font-bold flex items-center justify-center">Volver a la tienda</Link>
      </div>
      <p className="text-xs text-paper-ink-soft text-center print:hidden">"Guardar copia" te deja imprimirla o guardarla como PDF.</p>
    </main>
  )
}
