// Personal: trabajadores (sueldo, adelantos, pagos) y pagos del mes.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, HandCoins, Wallet, Pencil, History, UserRound } from 'lucide-react';
import { Btn, PageHeader, PageTabs, StatCard, StatGrid, fieldCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDate, PAYMENT_METHOD_LABELS, todayLimaDateString } from '@/lib/utils';

import {
  type Employee, type Payment, FREQ_LABEL, FREQ_PER, KIND_LABEL, n, name, periodLabel, employeeTag, Field,
} from './staffParts';
import { AdvanceModal, EmployeeModal, PayModal } from './StaffModals';
import { HistoryModal, ReceiptModal } from './StaffReceipt';

/* ─── Página ────────────────────────────────────────────────────────────── */
type Modal =
  | { type: 'edit'; employee?: Employee }
  | { type: 'advance' | 'pay' | 'history'; employee: Employee }
  | { type: 'receipt'; paymentId: string };

export function StaffPage() {
  const [tab, setTab] = useState<'people' | 'payments'>('people');
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const { data: employees, isLoading } = useQuery({
    queryKey: ['staff', showInactive],
    queryFn: async () => (await api.get<{ data: Employee[] }>('/staff', { params: { all: showInactive || undefined } })).data.data,
  });
  const active = (employees ?? []).filter((e) => e.isActive);
  const due = active.filter((e) => e.payDue);
  const advancesTotal = active.reduce((s, e) => s + e.pendingAdvances, 0);

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Personal" actions={<Btn variant="primary" onClick={() => setModal({ type: 'edit' })}><Plus />Agregar trabajador</Btn>}>
        <p className="text-table text-ink-muted">Sueldos, adelantos y pagos de quienes trabajan contigo.</p>
      </PageHeader>

      <PageTabs value={tab} onChange={setTab} tabs={[['people', 'Trabajadores'], ['payments', 'Pagos']]} />

      {tab === 'people' && (
        <div className="flex flex-col gap-4">
          <StatGrid cols={3}>
            <StatCard label="Trabajando" value={String(active.length)} />
            <StatCard label="Toca pagar" value={<span className={cn(due.length > 0 && 'text-warn-ink')}>{due.length}</span>} />
            <StatCard label="Adelantos por descontar" value={formatCurrency(advancesTotal)} />
          </StatGrid>

          {isLoading ? <p className="py-10 text-center text-ink-muted">Cargando...</p> : (employees ?? []).length === 0 ? (
            <div className="rounded-ctl bg-surface-2 p-8 text-center text-table text-ink-muted">
              <UserRound className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Agrega a quienes trabajan contigo, estén o no en planilla. Con eso llevas sus adelantos y pagos.
            </div>
          ) : (
            <div className="divide-y divide-line rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
              {(employees ?? []).map((e) => (
                <div key={e.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !e.isActive && 'opacity-60')}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setModal({ type: 'history', employee: e })}>
                    <p className="font-medium">{name(e)}{e.position ? <span className="font-normal text-ink-muted"> · {e.position}</span> : null}</p>
                    <p className="text-table text-ink-muted">
                      {employeeTag(e)} · {formatCurrency(e.salary)} {e.employmentType === 'PLANILLA' ? 'al mes' : FREQ_PER[e.payFrequency]}
                      {e.employmentType === 'PLANILLA' && e.payFrequency !== 'MONTHLY' ? `, pago ${FREQ_LABEL[e.payFrequency].toLowerCase()}` : ''}
                    </p>
                    <p className="mt-0.5 text-meta">
                      {!e.isActive ? <span className="text-ink-muted">De baja</span> : (
                        <span className={e.payDue ? 'font-medium text-warn-ink' : 'text-ink-muted'}>
                          {e.payDue ? 'Toca pagar' : 'Próximo pago'}: {periodLabel(e.nextPeriod.from, e.nextPeriod.to)}
                        </span>
                      )}
                      {e.pendingAdvances > 0 && <span className="text-ink-muted"> · adelantos {formatCurrency(e.pendingAdvances)}</span>}
                      {e.user && !e.user.hasSchedule && <span className="text-ink-muted"> · sin horario en Asistencia</span>}
                    </p>
                  </button>
                  {e.isActive && (
                    <div className="flex shrink-0 gap-2">
                      <Btn size="sm" variant="ghost" aria-label="Editar" onClick={() => setModal({ type: 'edit', employee: e })}><Pencil /></Btn>
                      <Btn size="sm" variant="ghost" aria-label="Historial" onClick={() => setModal({ type: 'history', employee: e })}><History /></Btn>
                      <Btn size="sm" onClick={() => setModal({ type: 'advance', employee: e })}><HandCoins />Adelanto</Btn>
                      <Btn size="sm" variant={e.payDue ? 'primary' : 'secondary'} onClick={() => setModal({ type: 'pay', employee: e })}><Wallet />Pagar</Btn>
                    </div>
                  )}
                  {!e.isActive && <Btn size="sm" variant="ghost" onClick={() => setModal({ type: 'edit', employee: e })}>Editar</Btn>}
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-table text-ink-muted">
            <input type="checkbox" className="size-4 accent-[hsl(var(--brand))]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar también a quienes ya no trabajan
          </label>
        </div>
      )}

      {tab === 'payments' && <PaymentsTab onOpen={(id) => setModal({ type: 'receipt', paymentId: id })} />}

      {modal?.type === 'edit' && <EmployeeModal employee={modal.employee} onClose={() => setModal(null)} />}
      {modal?.type === 'advance' && <AdvanceModal employee={modal.employee} onClose={() => setModal(null)} />}
      {modal?.type === 'pay' && <PayModal employee={modal.employee} onClose={() => setModal(null)} onPaid={(id) => setModal({ type: 'receipt', paymentId: id })} />}
      {modal?.type === 'history' && <HistoryModal employee={modal.employee} onClose={() => setModal(null)} onOpenPayment={(id) => setModal({ type: 'receipt', paymentId: id })} />}
      {modal?.type === 'receipt' && <ReceiptModal paymentId={modal.paymentId} onClose={() => setModal(null)} />}
    </div>
  );
}

function PaymentsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const today = todayLimaDateString();
  const [month, setMonth] = useState(today.slice(0, 7));
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
  }, [month]);
  const { data, isLoading } = useQuery({
    queryKey: ['staff-payments', range],
    queryFn: async () => (await api.get<{ data: Payment[] }>('/staff/payments', { params: range })).data.data,
  });
  const valid = (data ?? []).filter((p) => !p.voidedAt);
  const totalNet = valid.reduce((s, p) => s + n(p.netAmount), 0);
  const totalCost = valid.reduce((s, p) => s + n(p.grossAmount) + n(p.employerHealth), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mes"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={cn(fieldCls, 'w-44')} /></Field>
      </div>
      <StatGrid cols={2}>
        <StatCard label="Pagado a tu personal" value={formatCurrency(totalNet)} />
        <StatCard label="Costo total (con adelantos y aportes)" value={formatCurrency(totalCost)} />
      </StatGrid>
      <div className="divide-y divide-line rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
        {isLoading && <p className="p-6 text-center text-ink-muted">Cargando...</p>}
        {!isLoading && (data ?? []).length === 0 && <p className="p-6 text-center text-table text-ink-muted">No hay pagos en este mes.</p>}
        {(data ?? []).map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
            <span className="min-w-0">
              <span className={cn('block truncate text-table font-medium', p.voidedAt && 'text-ink-muted line-through')}>{name(p.employee)}</span>
              <span className="block text-meta text-ink-muted">
                {KIND_LABEL[p.kind]}{p.kind === 'REGULAR' ? ` ${periodLabel(p.periodStart, p.periodEnd)}` : ''} · {p.number} · {formatDate(p.paidAt)}{p.voidedAt ? ' · anulado' : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-table font-semibold tabular-nums">{formatCurrency(n(p.netAmount))}</span>
              <span className="block text-meta text-ink-muted">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
