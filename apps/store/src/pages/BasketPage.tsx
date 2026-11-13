import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, Loader2, Mic, Package, ShoppingBasket, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { storeApi, type BasketItem, type BasketLine, type BasketProposal, type BasketSuggestResponse } from '../api'
import { useCartStore } from '../cartStore'
import { useVoiceSearch } from '../hooks/useVoiceSearch'
import { thumb } from '../lib/thumb'

// "Arma tu canasta": el cliente dice cuánto tiene, para cuántos y para qué
// ("tengo S/ 20 para un desayuno de 4") y recibe propuestas armadas con lo
// que hay hoy en tienda. El backend hace todo el cálculo con reglas (sin
// IA); acá solo se muestra, se permite cambiar productos y se pasa al carrito.

const BUDGETS = [10, 15, 20, 30, 50]
const PEOPLE = [1, 2, 3, 4, 5, 6]
const EXAMPLES = [
  'Tengo S/ 20 para un desayuno de 4',
  'Lonche para 3 con 15 soles',
  'Almuerzo para 5, tengo S/ 40',
]

const money = (n: number) => `S/ ${n.toFixed(2)}`
const qtyLabel = (l: BasketLine) =>
  l.product.isBulk ? `${l.quantity.toFixed(2)} ${l.product.bulkUnit ?? 'kg'}` : `${l.quantity} und`

type Query = { text?: string; budget?: number; people?: number; occasion?: string }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 px-3.5 h-9 rounded-full text-sm font-semibold transition-colors ${
        active ? 'bg-paper-ink text-white' : 'bg-paper-surface text-paper-ink hover:bg-paper-line'}`}>
      {children}
    </button>
  )
}

function ProductThumb({ line }: { line: BasketLine }) {
  return (
    <div className="h-14 w-14 rounded-xl bg-paper-surface overflow-hidden flex items-center justify-center shrink-0">
      {line.product.imageUrl
        ? <img src={thumb(line.product.imageUrl, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        : <Package className="h-6 w-6 text-paper-ink-ghost" />}
    </div>
  )
}

export function BasketPage() {
  const [text, setText] = useState('')
  const [budget, setBudget] = useState<number | null>(null)
  const [people, setPeople] = useState<number | null>(null)
  const [occasion, setOccasion] = useState<string | null>(null)
  const [data, setData] = useState<BasketSuggestResponse | null>(null)
  const [selectedKey, setSelectedKey] = useState<BasketProposal['key'] | null>(null)
  // Cambios del cliente sobre la propuesta: slotKey → producto elegido.
  const [swaps, setSwaps] = useState<Record<string, BasketLine>>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const { addItem, openCart } = useCartStore()

  const mutation = useMutation({
    mutationFn: (q: Query) => storeApi.suggestBasket(q).then(r => r.data.data),
    onSuccess: (res) => {
      setData(res)
      setBudget(res.understood.budget)
      setPeople(res.understood.people)
      setOccasion(res.understood.occasion)
      setSwaps({})
      setOpenSlot(null)
      setSelectedKey(res.result?.proposals[0]?.key ?? null)
    },
    onError: () => toast.error('No pudimos armar la canasta. Intenta de nuevo.'),
  })

  // Trae las ocasiones disponibles al entrar.
  useEffect(() => { mutation.mutate({}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const voice = useVoiceSearch({
    onResult: (t) => { setText(t); mutation.mutate({ text: t }) },
  })

  const submitText = (t = text) => {
    if (!t.trim()) return
    mutation.mutate({ text: t.trim() })
  }

  // Al tocar un botón se vuelve a pedir con lo elegido (manda sobre el texto).
  const pick = (patch: Partial<Record<'budget' | 'people' | 'occasion', number | string>>) => {
    const next = {
      budget: (patch.budget as number | undefined) ?? budget ?? undefined,
      people: (patch.people as number | undefined) ?? people ?? undefined,
      occasion: (patch.occasion as string | undefined) ?? occasion ?? undefined,
    }
    if (patch.budget !== undefined) setBudget(patch.budget as number)
    if (patch.people !== undefined) setPeople(patch.people as number)
    if (patch.occasion !== undefined) setOccasion(patch.occasion as string)
    mutation.mutate(next)
  }

  const result = data?.result ?? null
  const proposal = result?.proposals.find(p => p.key === selectedKey) ?? result?.proposals[0] ?? null

  const lines: Array<BasketItem & { current: BasketLine }> = useMemo(() =>
    (proposal?.items ?? []).map(i => ({ ...i, current: swaps[i.slotKey] ?? i })), [proposal, swaps])
  const total = Math.round(lines.reduce((s, l) => s + l.current.subtotal, 0) * 100) / 100
  const diff = result ? Math.round((result.budget - total) * 100) / 100 : 0

  const addAll = () => {
    let added = 0
    for (const l of lines) {
      const r = addItem(l.current.product, l.current.quantity)
      if (r.addedQuantity > 0) added++
    }
    if (added === 0) { toast.error('Esos productos ya están en tu carrito.'); return }
    toast.success(`Agregamos ${added} ${added === 1 ? 'producto' : 'productos'} a tu carrito`)
    openCart()
  }

  const missingText = data?.missing.length
    ? `Cuéntanos ${data.missing.map(m => ({ budget: 'cuánto tienes', people: 'para cuántas personas', occasion: 'para qué comida' }[m])).join(' y ')}.`
    : null

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-40">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-2xl bg-brand-blue-50 flex items-center justify-center">
          <ShoppingBasket className="h-5 w-5 text-brand-blue-600" />
        </div>
        <h1 className="text-2xl font-display font-bold text-paper-ink">Arma tu canasta</h1>
      </div>
      <p className="text-sm text-paper-ink-soft mb-4">
        Dinos cuánto tienes y para qué. Te armamos la compra con lo que hay hoy en tienda.
      </p>

      {/* Pedido en palabras */}
      <form onSubmit={e => { e.preventDefault(); submitText() }}
        className="flex items-center gap-2 bg-white rounded-2xl shadow-md p-2 pl-4">
        <input value={text} onChange={e => setText(e.target.value)}
          placeholder="Ej: tengo S/ 20 para un desayuno de 4"
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-paper-ink placeholder:text-paper-ink-ghost" />
        {voice.isSupported && (
          <button type="button" onClick={voice.toggle} aria-label="Dictar"
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${voice.isListening ? 'bg-brand-magenta-50 text-brand-magenta-600 animate-pulse' : 'text-paper-ink-soft hover:bg-paper-surface'}`}>
            <Mic className="h-5 w-5" />
          </button>
        )}
        <button type="submit" disabled={!text.trim() || mutation.isPending}
          className="h-10 px-4 rounded-xl bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white text-sm font-bold shrink-0">
          Armar
        </button>
      </form>

      {!data?.result && !text && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-4 px-4">
          {EXAMPLES.map(ex => (
            <button key={ex} type="button" onClick={() => { setText(ex); submitText(ex) }}
              className="shrink-0 text-xs text-brand-blue-700 bg-brand-blue-50 hover:bg-brand-blue-100 rounded-full px-3 py-1.5">
              “{ex}”
            </button>
          ))}
        </div>
      )}

      {/* O con botones */}
      <div className="mt-5 space-y-3">
        <div>
          <p className="text-xs font-bold text-paper-ink-soft uppercase tracking-wide mb-1.5">Para</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {(data?.occasions ?? []).map(o => (
              <Chip key={o.key} active={occasion === o.key} onClick={() => pick({ occasion: o.key })}>
                {o.emoji ? `${o.emoji} ` : ''}{o.name}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-paper-ink-soft uppercase tracking-wide mb-1.5">Personas</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {PEOPLE.map(n => <Chip key={n} active={people === n} onClick={() => pick({ people: n })}>{n}</Chip>)}
            {people != null && !PEOPLE.includes(people) && <Chip active onClick={() => {}}>{people}</Chip>}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-paper-ink-soft uppercase tracking-wide mb-1.5">Presupuesto</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {BUDGETS.map(b => <Chip key={b} active={budget === b} onClick={() => pick({ budget: b })}>S/ {b}</Chip>)}
            {budget != null && !BUDGETS.includes(budget) && <Chip active onClick={() => {}}>S/ {budget}</Chip>}
          </div>
        </div>
      </div>

      {mutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-paper-ink-soft mt-6">
          <Loader2 className="h-4 w-4 animate-spin" />Armando tu canasta…
        </div>
      )}

      {!mutation.isPending && data && data.missing.length > 0 && (text || budget || people || occasion) && (
        <p className="mt-6 text-sm text-paper-ink bg-brand-blue-50 rounded-2xl px-4 py-3">{missingText}</p>
      )}

      {!mutation.isPending && result?.status === 'empty' && (
        <p className="mt-6 text-sm text-paper-ink bg-paper-surface rounded-2xl px-4 py-3">
          Hoy no tenemos en tienda {result.missingSlots?.length ? <b>{result.missingSlots.join(', ').toLowerCase()}</b> : 'lo necesario'} para esta canasta. Prueba con otra comida.
        </p>
      )}

      {!mutation.isPending && result?.status === 'short' && (
        <div className="mt-6 text-sm text-paper-ink bg-brand-achiote-50 rounded-2xl px-4 py-3">
          Con {money(result.budget)} no alcanza para {result.people} personas: lo mínimo es <b>{money(result.minTotal ?? 0)}</b>.
          {result.maxPeople ? <> Sí alcanza para <b>{result.maxPeople} {result.maxPeople === 1 ? 'persona' : 'personas'}</b>.</> : ''}
        </div>
      )}

      {/* Propuestas */}
      {!mutation.isPending && proposal && (
        <section className="mt-6">
          {result!.proposals.length > 1 && (
            <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${result!.proposals.length}, minmax(0, 1fr))` }}>
              {result!.proposals.map(p => {
                const active = p.key === proposal.key
                return (
                  <button key={p.key} type="button" onClick={() => { setSelectedKey(p.key); setSwaps({}); setOpenSlot(null) }}
                    className={`rounded-2xl px-3 py-2.5 text-left transition-all ${active ? 'bg-white shadow-md ring-2 ring-paper-ink' : 'bg-paper-surface hover:bg-paper-line'}`}>
                    <span className="flex items-center gap-1 text-xs font-semibold text-paper-ink-soft">
                      {p.key === 'recomendada' && <Sparkles className="h-3.5 w-3.5 text-brand-blue-600" />}{p.label}
                    </span>
                    <span className="block text-base font-extrabold text-paper-ink">{money(p.total)}</span>
                  </button>
                )
              })}
            </div>
          )}

          <ul className="bg-white rounded-3xl shadow-md divide-y divide-paper-line overflow-hidden">
            {lines.map(l => (
              <li key={l.slotKey}>
                <div className="flex items-center gap-3 p-3">
                  <ProductThumb line={l.current} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-paper-ink-ghost">{l.slotLabel}</p>
                    <p className="text-sm font-semibold text-paper-ink leading-snug line-clamp-2">{l.current.product.name}</p>
                    <p className="text-xs text-paper-ink-soft">{qtyLabel(l.current)} × {money(l.current.product.salePrice)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-extrabold text-paper-ink">{money(l.current.subtotal)}</span>
                    {l.alternatives.length > 0 && (
                      <button type="button" onClick={() => setOpenSlot(openSlot === l.slotKey ? null : l.slotKey)}
                        className="flex items-center gap-1 text-xs font-semibold text-brand-blue-600 hover:text-brand-blue-700">
                        <ArrowLeftRight className="h-3.5 w-3.5" />Cambiar
                      </button>
                    )}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {openSlot === l.slotKey && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-paper-surface">
                      <div className="p-2 space-y-1">
                        {[l as BasketLine, ...l.alternatives]
                          .filter(a => a.product.id !== l.current.product.id)
                          .map(a => (
                            <button key={a.product.id} type="button"
                              onClick={() => { setSwaps(s => ({ ...s, [l.slotKey]: a })); setOpenSlot(null) }}
                              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white text-left">
                              <ProductThumb line={a} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-paper-ink leading-snug line-clamp-2">{a.product.name}</p>
                                <p className="text-xs text-paper-ink-soft">{qtyLabel(a)}</p>
                              </div>
                              <span className="text-sm font-bold text-paper-ink shrink-0">{money(a.subtotal)}</span>
                            </button>
                          ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
          <p className="text-xs text-paper-ink-ghost mt-3 px-1">
            Cantidades pensadas para {proposal.people} {proposal.people === 1 ? 'persona' : 'personas'}. Puedes ajustarlas en el carrito.
          </p>
        </section>
      )}

      {/* Barra de total */}
      {!mutation.isPending && proposal && (
        <div className="fixed inset-x-0 bottom-14 md:bottom-0 z-30 bg-white/95 backdrop-blur border-t border-paper-line">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-lg font-extrabold text-paper-ink leading-tight">{money(total)}</p>
              <p className={`text-xs ${diff >= 0 ? 'text-paper-ink-soft' : 'text-brand-achiote-600 font-semibold'}`}>
                {diff >= 0 ? `Te sobran ${money(diff)}` : `Te pasas por ${money(-diff)}`}
              </p>
            </div>
            <button type="button" onClick={addAll}
              className="h-12 px-5 rounded-2xl bg-brand-green-600 hover:bg-brand-green-700 text-white font-bold text-sm shadow-lg shadow-brand-green-600/25">
              Agregar todo al carrito
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
