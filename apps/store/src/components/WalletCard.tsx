import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import QRCode from 'qrcode'
import { Wallet, QrCode, Plus, KeyRound, X, ChevronDown, Clock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { storeApi, type WalletMovement } from '../api'

type Panel = null | 'qr' | 'topup' | 'pin'

const TOPUP_AMOUNTS = [20, 50, 100]

function errorMessage(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { error?: { message?: string } } } }
  return e.response?.data?.error?.message ?? fallback
}

function movementLabel(m: WalletMovement) {
  if (m.type === 'CARGA') {
    if (m.origin === 'MENSUAL') return 'Recarga mensual'
    if (m.origin === 'ONLINE') return 'Recarga por Yape'
    if (m.origin === 'BENEFICIO') return 'Saldo asignado'
    return 'Recarga'
  }
  if (m.type === 'CONSUMO') return m.description.replace('Pedido web', 'Pedido')
  if (m.type === 'DEVOLUCION') return m.description
  return 'Ajuste'
}

/* ── QR para pagar en caja: cambia cada 5 min y sirve una sola vez ──────── */
function PayQr({ onClose }: { onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null)
  const [left, setLeft] = useState(0)

  const qr = useMutation({
    mutationFn: () => storeApi.getWalletQr(),
    onSuccess: async (res) => {
      const { code, expiresIn } = res.data.data
      setImg(await QRCode.toDataURL(code, { width: 260, margin: 1, color: { dark: '#26241c', light: '#ffffff' } }))
      setLeft(expiresIn)
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo generar el QR')),
  })

  useEffect(() => { qr.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  const expired = img && left <= 0
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm text-paper-ink-soft mb-3">Muestra este código en caja para pagar con tu saldo.</p>
      <div className="relative">
        {img
          ? <img src={img} alt="QR para pagar con saldo" className={`w-56 h-56 rounded-2xl border border-paper-line ${expired ? 'opacity-20' : ''}`} />
          : <div className="w-56 h-56 rounded-2xl bg-paper-surface animate-pulse" />}
        {expired && (
          <button onClick={() => qr.mutate()} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-bold text-brand-blue-700">
            <RefreshCw className="h-5 w-5" />Generar otro
          </button>
        )}
      </div>
      {!expired && left > 0 && (
        <p className="text-xs text-paper-ink-ghost mt-2 tabular-nums">
          Vence en {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · sirve para una sola compra
        </p>
      )}
      <button onClick={onClose} className="mt-3 text-xs text-paper-ink-ghost hover:text-paper-ink">Cerrar</button>
    </div>
  )
}

/* ── Recarga por Yape: paga al QR del negocio y deja el N° de operación ─── */
function TopupForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState<number | ''>(50)
  const [op, setOp] = useState('')
  const m = useMutation({
    mutationFn: () => storeApi.requestTopup(Number(amount), op.trim()),
    onSuccess: () => {
      toast.success('Recibimos tu recarga. Se acredita apenas la verifiquemos.')
      qc.invalidateQueries({ queryKey: ['store-wallet'] })
      onDone()
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo registrar la recarga')),
  })
  const valid = Number(amount) >= 5 && op.trim().length >= 4

  return (
    <div>
      <p className="text-xs font-semibold text-paper-ink-soft mb-2">1. Elige cuánto recargar</p>
      <div className="flex gap-2 mb-2">
        {TOPUP_AMOUNTS.map(a => (
          <button key={a} onClick={() => setAmount(a)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-colors ${amount === a ? 'bg-brand-blue-600 text-white' : 'bg-paper-surface text-paper-ink'}`}>
            S/ {a}
          </button>
        ))}
      </div>
      <input type="number" inputMode="decimal" min={5} max={1000} value={amount}
        onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="Otro monto"
        className="w-full bg-paper-surface border border-transparent focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none mb-4" />

      <p className="text-xs font-semibold text-paper-ink-soft mb-2">2. Yapea S/ {Number(amount || 0).toFixed(2)} a este QR</p>
      <img src="/yape-qr.png" alt="QR de Yape de la tienda" className="w-36 mx-auto rounded-xl border border-paper-line mb-4" />

      <p className="text-xs font-semibold text-paper-ink-soft mb-2">3. Escribe el N° de operación de tu Yape</p>
      <input value={op} onChange={e => setOp(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} maxLength={30}
        inputMode="numeric" placeholder="Ej. 12345678"
        className="w-full bg-paper-surface border border-transparent focus:border-brand-blue-400 rounded-xl px-3 py-2 text-sm text-paper-ink outline-none mb-4" />

      <button disabled={!valid || m.isPending} onClick={() => m.mutate()}
        className="w-full bg-brand-green-600 hover:bg-brand-green-700 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-colors">
        {m.isPending ? 'Enviando...' : 'Enviar recarga'}
      </button>
      <p className="text-[11px] text-paper-ink-ghost text-center mt-2">También puedes recargar pagando directamente en caja.</p>
    </div>
  )
}

/* ── PIN de 4 dígitos para pagar en caja sin el celular ─────────────────── */
function PinForm({ hasPin, onDone }: { hasPin: boolean; onDone: () => void }) {
  const qc = useQueryClient()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const m = useMutation({
    mutationFn: () => storeApi.setWalletPin(pin),
    onSuccess: () => {
      toast.success('PIN guardado')
      qc.invalidateQueries({ queryKey: ['store-wallet'] })
      onDone()
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo guardar el PIN')),
  })
  const input = 'w-full bg-paper-surface border border-transparent focus:border-brand-blue-400 rounded-xl px-3 py-2.5 text-center text-lg tracking-[0.5em] font-bold text-paper-ink outline-none'
  return (
    <div>
      <p className="text-sm text-paper-ink-soft mb-3">
        Si vas sin celular, en caja te buscan por tu DNI o teléfono y dictas este PIN. No lo compartas.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" className={input} />
        <input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="Repite" className={input} />
      </div>
      {pin2.length === 4 && pin !== pin2 && <p className="text-xs text-brand-magenta-600 mb-2">Los PIN no coinciden.</p>}
      <button disabled={pin.length !== 4 || pin !== pin2 || m.isPending} onClick={() => m.mutate()}
        className="w-full bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-40 text-white font-bold rounded-xl py-3 text-sm transition-colors">
        {hasPin ? 'Cambiar PIN' : 'Crear PIN'}
      </button>
    </div>
  )
}

/* ── Tarjeta "Mi saldo" del perfil ──────────────────────────────────────── */
export function WalletCard() {
  const [panel, setPanel] = useState<Panel>(null)
  const [showAll, setShowAll] = useState(false)
  const { data } = useQuery({ queryKey: ['store-wallet'], queryFn: () => storeApi.getWallet() })
  const w = data?.data.data
  if (!w) return null

  const pending = w.topups.filter(t => t.status === 'PENDING')
  const movements = showAll ? w.movements : w.movements.slice(0, 4)

  const actions: Array<{ key: Exclude<Panel, null>; icon: typeof QrCode; label: string; disabled?: boolean }> = [
    { key: 'qr', icon: QrCode, label: 'Pagar en caja', disabled: w.balance <= 0 },
    { key: 'topup', icon: Plus, label: 'Recargar' },
    { key: 'pin', icon: KeyRound, label: w.hasPin ? 'Mi PIN' : 'Crear PIN' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-paper-line overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display font-semibold text-paper-ink flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand-blue-600" />Mi saldo
            </h3>
            <p className="text-3xl font-extrabold text-paper-ink tabular-nums mt-2">S/ {w.balance.toFixed(2)}</p>
            <p className="text-xs text-paper-ink-ghost mt-0.5">Úsalo al pagar en la tienda online o en caja.</p>
          </div>
          {w.monthly && (
            <span className="text-[11px] font-semibold bg-brand-blue-50 text-brand-blue-700 rounded-full px-2.5 py-1 whitespace-nowrap">
              +S/ {w.monthly.amount.toFixed(0)} cada día {w.monthly.dayOfMonth}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          {actions.map(a => (
            <button key={a.key} disabled={a.disabled} onClick={() => setPanel(p => p === a.key ? null : a.key)}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                panel === a.key ? 'bg-brand-blue-600 text-white' : 'bg-paper-surface text-paper-ink hover:bg-brand-blue-50'
              }`}>
              <a.icon className="h-4 w-4" />{a.label}
            </button>
          ))}
        </div>

        {pending.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 text-amber-800 text-xs px-3 py-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {pending.length === 1
              ? `Recarga de S/ ${pending[0].amount.toFixed(2)} en verificación`
              : `${pending.length} recargas en verificación`}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {panel && (
          <motion.div key={panel} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }} className="overflow-hidden">
            <div className="px-5 pb-5 relative">
              <button onClick={() => setPanel(null)} className="absolute right-4 -top-1 text-paper-ink-ghost hover:text-paper-ink" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
              {panel === 'qr' && <PayQr onClose={() => setPanel(null)} />}
              {panel === 'topup' && <TopupForm onDone={() => setPanel(null)} />}
              {panel === 'pin' && <PinForm hasPin={w.hasPin} onDone={() => setPanel(null)} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {w.movements.length > 0 && (
        <div className="border-t border-paper-line px-5 py-3">
          <p className="text-xs font-semibold text-paper-ink-faint mb-1">Movimientos</p>
          <div className="divide-y divide-paper-line">
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-paper-ink truncate">{movementLabel(m)}</p>
                  <p className="text-[11px] text-paper-ink-ghost">
                    {new Date(m.createdAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className={`text-sm font-bold tabular-nums shrink-0 ${m.amount > 0 ? 'text-brand-green-700' : 'text-paper-ink'}`}>
                  {m.amount > 0 ? '+' : '−'}S/ {Math.abs(m.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          {w.movements.length > 4 && (
            <button onClick={() => setShowAll(v => !v)} className="w-full flex items-center justify-center gap-1 text-xs text-brand-blue-600 font-semibold pt-1">
              {showAll ? 'Ver menos' : 'Ver todos'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      )}
      {w.topups.some(t => t.status === 'REJECTED') && (
        <div className="border-t border-paper-line px-5 py-2 text-[11px] text-paper-ink-ghost">
          {w.topups.filter(t => t.status === 'REJECTED').slice(0, 1).map(t => (
            <p key={t.id}>Recarga op. {t.operationNumber} no aprobada{t.rejectReason ? `: ${t.rejectReason}` : ''}.</p>
          ))}
        </div>
      )}
    </div>
  )
}
