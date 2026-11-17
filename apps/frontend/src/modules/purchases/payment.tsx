import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { Btn, Segmented, fieldCls } from '@/components/erp';
import { MoneyInput } from '@/components/ui/money-input';
import { api } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from './types';

export interface PaymentLeg { amount: number; method: string; cashSessionId?: string; }

// Cajas del día con sesión abierta ahora mismo — para poder elegir "de qué
// caja sale el dinero" en vez de asumir siempre Caja General.
export function useOpenCashSessions() {
  return useQuery({
    queryKey: ['cash-registers-open-sessions'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        id: string; name: string;
        sessions: Array<{ id: string; user: { firstName: string; lastName: string } }>;
      }> }>('/cash/registers');
      return res.data.data
        .filter(r => r.sessions.length > 0)
        .map(r => ({ cashSessionId: r.sessions[0].id, label: `Caja del día — ${r.name} (${r.sessions[0].user.firstName})` }));
    },
    staleTime: 15_000,
  });
}

export function legsSum(legs: PaymentLeg[]) {
  return legs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export function legsMatch(legs: PaymentLeg[], total: number) {
  return legs.length > 0 && legs.every(l => l.amount > 0) && Math.abs(legsSum(legs) - total) <= 0.01;
}

export function PaymentLegsEditor({ total, legs, onChange }: {
  total: number; legs: PaymentLeg[]; onChange: (legs: PaymentLeg[]) => void;
}) {
  const { data: openSessions = [] } = useOpenCashSessions();
  const remaining = total - legsSum(legs);

  const updateLeg = (idx: number, patch: Partial<PaymentLeg>) =>
    onChange(legs.map((l, i) => i === idx ? { ...l, ...patch } : l));

  return (
    <div className="flex flex-col gap-2">
      {legs.map((leg, idx) => (
        <div key={idx} className="grid grid-cols-[112px_1fr_auto] items-center gap-2 sm:grid-cols-[120px_150px_1fr_auto]">
          <MoneyInput size="sm" min={0} value={leg.amount} aria-label="Monto"
            state={leg.amount > 0 ? 'ok' : undefined}
            onChange={e => updateLeg(idx, { amount: Number(e.target.value) })} />
          <select className={cn(fieldCls, 'h-9')} value={leg.method} aria-label="Medio de pago"
            onChange={e => updateLeg(idx, { method: e.target.value, cashSessionId: undefined })}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {leg.method === 'CASH' ? (
            <select className={cn(fieldCls, 'col-span-2 h-9 sm:col-span-1')} value={leg.cashSessionId ?? ''} aria-label="De qué caja sale"
              onChange={e => updateLeg(idx, { cashSessionId: e.target.value || undefined })}>
              <option value="">Caja General</option>
              {openSessions.map(s => <option key={s.cashSessionId} value={s.cashSessionId}>{s.label}</option>)}
            </select>
          ) : <span className="hidden sm:block" />}
          {legs.length > 1 ? (
            <button type="button" aria-label="Quitar forma de pago"
              className="tap grid size-8 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink"
              onClick={() => onChange(legs.filter((_, i) => i !== idx))}>
              <X className="size-4" />
            </button>
          ) : <span className="size-8" />}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Btn size="sm" variant="ghost"
          onClick={() => onChange([...legs, { amount: Math.max(0, remaining), method: 'CASH' }])}>
          <Plus />Otra forma de pago
        </Btn>
        <span className={cn('text-table font-medium tabular-nums', Math.abs(remaining) > 0.01 ? 'text-bad-ink' : 'text-ok-ink')}>
          {Math.abs(remaining) > 0.01 ? `Falta ${formatCurrency(remaining)}` : 'Cuadra'}
        </span>
      </div>
    </div>
  );
}

export function PaymentStatusPicker({ paid, legs, total, onChange, title = '¿Cómo se paga esta compra?' }: {
  paid: boolean; legs: PaymentLeg[]; total: number;
  onChange: (v: { paid: boolean; legs: PaymentLeg[] }) => void;
  title?: string;
}) {
  return (
    <div className="erp flex flex-col gap-3 rounded-srf bg-surface-2 p-3 shadow-[0_0_0_1px_hsl(var(--line))]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-table font-medium text-ink">{title}</span>
        <span className="text-body font-semibold tabular-nums text-ink">{formatCurrency(total)}</span>
      </div>
      <Segmented ariaLabel={title} value={paid ? 'paid' : 'credit'}
        onChange={(v) => onChange(v === 'paid'
          ? { paid: true, legs: legs.length ? legs : [{ amount: total, method: 'CASH' }] }
          : { paid: false, legs })}
        options={[['paid', 'Pagado ahora'], ['credit', 'A crédito']]} />
      {paid && <PaymentLegsEditor total={total} legs={legs} onChange={l => onChange({ paid: true, legs: l })} />}
      {!paid && (
        <p className="text-meta text-ink-muted">
          Queda como cuenta por pagar al proveedor. Se salda luego desde "Cuentas por pagar".
        </p>
      )}
    </div>
  );
}

/* ─── Registrar Compra (directa, con CPP/bonificación/granel) ───────────── */
