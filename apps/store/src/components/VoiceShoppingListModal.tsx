import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, X, Check, ShoppingBag, Loader2, ListChecks } from 'lucide-react'
import { useVoiceListDictation } from '../hooks/useVoiceListDictation'
import { parseVoiceList } from '../lib/parseVoiceList'
import { storeApi, type Product } from '../api'
import { useCartStore } from '../cartStore'

type Screen = 'listening' | 'processing' | 'results'

interface ResultRow {
  term: string
  product: Product | null
}

// FAB flotante + modal para armar el pedido dictando varios productos
// seguidos ("cebolla, tomate, zanahoria, arveja, tallarín...") — busca cada
// uno en el catálogo real y agrega al carrito los que encuentra, mostrando
// al final qué entró y qué no se encontró para que el cliente lo revise.
export function VoiceShoppingListButton() {
  const [open, setOpen] = useState(false)
  const cartOpen = useCartStore(s => s.isOpen)
  const { isListening, chunks, start, stop, reset, isSupported } = useVoiceListDictation()
  const [screen, setScreen] = useState<Screen>('listening')
  const [results, setResults] = useState<ResultRow[]>([])
  const addItem = useCartStore(s => s.addItem)
  const openCart = useCartStore(s => s.openCart)

  if (!isSupported) return null

  const handleOpen = () => {
    setOpen(true)
    setScreen('listening')
    setResults([])
    reset()
    start()
  }

  const handleClose = () => {
    stop()
    setOpen(false)
  }

  const handleSearchAll = async () => {
    stop()
    const terms = parseVoiceList(chunks)
    if (terms.length === 0) { setOpen(false); return }
    setScreen('processing')

    const rows = await Promise.all(terms.map(async (term): Promise<ResultRow> => {
      try {
        const res = await storeApi.getProducts({ search: term, limit: 1 })
        const product = res.data.data[0] ?? null
        return { term, product }
      } catch {
        return { term, product: null }
      }
    }))

    rows.forEach(row => {
      if (row.product && row.product.currentStock > 0) addItem(row.product)
    })

    setResults(rows)
    setScreen('results')
  }

  const addedCount = results.filter(r => r.product && r.product.currentStock > 0).length
  const notFoundCount = results.length - addedCount

  return (
    <>
      <AnimatePresence>
        {!cartOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
            onClick={handleOpen}
            className="fixed right-4 bottom-20 md:bottom-6 z-40 h-14 w-14 rounded-full bg-brand-green-600 hover:bg-brand-green-700 text-white shadow-lg shadow-brand-green-600/30 flex items-center justify-center animate-ring-pulse"
            title="Arma tu pedido dictando la lista">
            <Mic className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-paper-ink/50 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}>
            <motion.div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
              initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-paper-line">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-brand-green-600" />
                  <h2 className="font-bold text-paper-ink">Lista por voz</h2>
                </div>
                <button onClick={handleClose} className="h-8 w-8 bg-paper-surface hover:bg-paper-line rounded-full flex items-center justify-center transition-colors">
                  <X className="h-4 w-4 text-paper-ink-soft" />
                </button>
              </div>

              <div className="p-5">
                {screen === 'listening' && (
                  <>
                    <div className="flex flex-col items-center text-center gap-3 mb-4">
                      <div className={`h-16 w-16 rounded-full flex items-center justify-center ${isListening ? 'bg-brand-magenta-500 animate-pulse' : 'bg-paper-surface'}`}>
                        <Mic className={`h-7 w-7 ${isListening ? 'text-white' : 'text-paper-ink-ghost'}`} />
                      </div>
                      <p className="text-sm text-paper-ink-soft">
                        {isListening ? 'Escuchando… di los productos uno tras otro' : 'Toca para empezar a hablar'}
                      </p>
                      <p className="text-xs text-paper-ink-ghost">Ej: "cebolla, tomate, zanahoria, arveja, tallarín, laurel, tuco"</p>
                    </div>

                    {chunks.length > 0 && (
                      <div className="bg-paper-surface rounded-2xl p-3 mb-4 max-h-40 overflow-y-auto space-y-1.5">
                        {chunks.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-paper-ink">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-green-600 shrink-0" />
                            {c}
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={handleSearchAll} disabled={chunks.length === 0}
                      className="w-full py-3.5 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-brand-green-600/25 transition-colors flex items-center justify-center gap-2">
                      <Check className="h-4 w-4" />
                      {chunks.length === 0 ? 'Di al menos un producto' : `Buscar y agregar (${parseVoiceList(chunks).length})`}
                    </button>
                  </>
                )}

                {screen === 'processing' && (
                  <div className="flex flex-col items-center text-center gap-3 py-8">
                    <Loader2 className="h-8 w-8 text-brand-green-600 animate-spin" />
                    <p className="text-sm text-paper-ink-soft">Buscando tus productos…</p>
                  </div>
                )}

                {screen === 'results' && (
                  <>
                    <p className="text-sm text-paper-ink-soft mb-3">
                      {addedCount > 0 && <span className="text-brand-green-700 font-semibold">{addedCount} agregados</span>}
                      {addedCount > 0 && notFoundCount > 0 && ' · '}
                      {notFoundCount > 0 && <span className="text-brand-magenta-600 font-semibold">{notFoundCount} no encontrados</span>}
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                      {results.map((r, i) => {
                        const ok = r.product && r.product.currentStock > 0
                        return (
                          <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl ${ok ? 'bg-brand-green-50' : 'bg-brand-magenta-50'}`}>
                            <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${ok ? 'bg-brand-green-600' : 'bg-brand-magenta-400'}`}>
                              {ok ? <Check className="h-4 w-4 text-white" /> : <X className="h-4 w-4 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-paper-ink truncate">{r.product?.name ?? r.term}</p>
                              {!ok && <p className="text-xs text-paper-ink-ghost">No lo encontramos en el catálogo</p>}
                              {ok && <p className="text-xs text-paper-ink-soft">S/ {Number(r.product!.salePrice).toFixed(2)}</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={handleOpen}
                        className="flex-1 py-3 border border-paper-line hover:border-paper-ink-ghost rounded-xl text-sm text-paper-ink-soft hover:text-paper-ink transition-colors">
                        Dictar de nuevo
                      </button>
                      <button onClick={() => { setOpen(false); openCart() }} disabled={addedCount === 0}
                        className="flex-1 py-3 bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md shadow-brand-green-600/25 transition-colors flex items-center justify-center gap-2">
                        <ShoppingBag className="h-4 w-4" />Ver carrito
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
