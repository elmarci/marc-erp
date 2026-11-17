// Ficha de una caja abierta: lo que debe haber, lo vendido y lo que salió,
// con las acciones del turno y los movimientos de la sesión debajo.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Lock, PackageOpen, Printer } from 'lucide-react';
import { Btn, EmptyState, Modal, Panel, Segmented, surfaceCls, tableCls, thCls, tdCls } from '@/components/erp';
import { BottleDepositManager } from '@/modules/bottle-deposits/BottleDepositManager';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDateTime, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { CloseSessionDialog } from './CloseSessionDialog';
import { MoveMoneySheet } from './MoveMoneySheet';
import { KeyRows, Money } from './parts';
import { printArqueo } from './printing';
import type { CashSession, Movement, SessionSale, SessionSummary } from './types';

type Filter = 'all' | 'sales' | 'moves';
const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' });

function Column({ label, value, children, className }: { label: string; value: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 py-4', className)}>
      <div className="text-meta text-ink-muted">{label}</div>
      <div className="text-kpi font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function SessionCard({ session }: { session: CashSession }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [move, setMove] = useState<'out' | 'in' | null>(null);
  const [closing, setClosing] = useState(false);
  const [deposits, setDeposits] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['cash-summary', session.id],
    queryFn: async () => (await api.get<{ data: SessionSummary }>(`/cash/sessions/${session.id}/summary`)).data.data,
    refetchInterval: 30000,
  });
  const { data: movements } = useQuery({
    queryKey: ['cash-movements', session.id],
    queryFn: async () => (await api.get<{ data: Movement[] }>(`/cash/sessions/${session.id}/movements`)).data.data,
  });
  const { data: sales } = useQuery({
    queryKey: ['cash-sales', session.id],
    queryFn: async () => (await api.get<{ data: SessionSale[] }>(`/cash/sessions/${session.id}/sales`)).data.data,
    enabled: filter !== 'moves',
  });

  const sm = summary?.summary;
  const rows = [
    ...(filter !== 'moves' ? (sales ?? []).map((s) => {
      const cash = s.payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + Number(p.amount), 0);
      const methods = [...new Set(s.payments.map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method))].join(' + ');
      return {
        id: s.id, at: s.createdAt, kind: 'Venta', detail: `${s.saleNumber} · ${s._count.items} ítem(s)`,
        medio: cash > 0 && cash < Number(s.totalAmount) ? `${methods} (efectivo ${formatCurrency(cash)})` : methods,
        amount: Number(s.totalAmount),
      };
    }) : []),
    ...(filter !== 'sales' ? (movements ?? []).map((m) => ({
      id: m.id, at: m.createdAt, kind: m.type === 'WITHDRAWAL' ? 'Salida' : 'Entrada', detail: m.reason,
      medio: 'Efectivo', amount: m.type === 'WITHDRAWAL' ? -Number(m.amount) : Number(m.amount),
    })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-4">
      <section className={cn('overflow-hidden', surfaceCls)}>
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium text-ink">{session.cashRegister.name}</div>
            <div className="text-meta text-ink-muted">
              {session.user.firstName} {session.user.lastName} · abierta {formatDateTime(session.openedAt)} · inicial {formatCurrency(session.openingAmount)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="ghost" title="Cobrar o devolver garantía de envase" onClick={() => setDeposits(true)}><PackageOpen />Envases</Btn>
            <Btn size="sm" variant="ghost" disabled={!summary} onClick={() => summary && printArqueo(summary)}><Printer />Imprimir arqueo</Btn>
            <Btn size="sm" onClick={() => setMove('out')}><ArrowUpRight />Sacar dinero</Btn>
            <Btn size="sm" onClick={() => setMove('in')}><ArrowDownLeft />Meter dinero</Btn>
            <Btn size="sm" variant="primary" disabled={!summary} onClick={() => setClosing(true)}><Lock />Cerrar caja</Btn>
          </div>
        </header>
        {!sm ? (
          <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando resumen…</div>
        ) : (
          <div className="grid divide-line sm:grid-cols-[1.2fr_1fr_1fr] sm:divide-x">
            <Column label="Efectivo que debe haber" value={formatCurrency(sm.netCash)}>
              <KeyRows rows={[
                ['Inicial', <Money v={summary.session.openingAmount} />],
                ['Ventas en efectivo', <Money v={sm.salesByMethod['CASH'] ?? 0} />],
                sm.totalDeposits > 0 && ['Entradas', <Money v={sm.totalDeposits} sign />],
                sm.totalWithdrawals > 0 && ['Salidas', <Money v={-sm.totalWithdrawals} sign />],
              ]} />
            </Column>
            <Column className="border-t border-line sm:border-t-0" label={`Vendido · ${sm.totalTransactions} venta(s)`} value={formatCurrency(sm.totalSales)}>
              <KeyRows rows={[
                ...Object.entries(sm.salesByMethod).map(([m, v]) => [PAYMENT_METHOD_LABELS[m] ?? m, <Money v={v} />] as [string, React.ReactNode]),
                (sm.cardCommissions ?? 0) > 0 && ['Comisión tarjeta (aparte)', <Money v={sm.cardCommissions ?? 0} />],
              ]} />
              {((sm.salesByMethod['YAPE'] ?? 0) > 0 || (sm.salesByMethod['PLIN'] ?? 0) > 0) && (
                <p className="mt-2 text-meta text-ink-muted">Al cerrar se confirma lo que llegó por Yape y Plin.</p>
              )}
            </Column>
            <Column className="border-t border-line sm:border-t-0" label="Salió de la caja" value={formatCurrency(sm.totalWithdrawals)}>
              <KeyRows rows={[
                ['Pagos a proveedores', <Money v={sm.purchasePayments} />],
                ['Gastos', <Money v={sm.expensePayments} />],
                ['Otros retiros', <Money v={sm.otherWithdrawals} />],
              ]} />
            </Column>
          </div>
        )}
      </section>

      <Panel title={`Movimientos de ${session.cashRegister.name}`}
        meta={`${session._count.sales} venta(s) · ${movements?.length ?? session._count.movements} entrada(s) y salida(s)`}
        actions={<Segmented value={filter} onChange={setFilter} ariaLabel="Mostrar"
          options={[['all', 'Todo'], ['sales', 'Ventas'], ['moves', 'Entradas y salidas']]} />}>
        {rows.length === 0 ? (
          <EmptyState title={filter === 'sales' ? 'Sin ventas en esta sesión' : filter === 'moves' ? 'Sin movimientos registrados' : 'Sin ventas ni movimientos todavía'} />
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className={tableCls}>
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <th className={cn(thCls, 'w-16')}>Hora</th>
                  <th className={thCls}>Detalle</th>
                  <th className={cn(thCls, 'hidden sm:table-cell')}>Medio</th>
                  <th className={cn(thCls, 'text-right')}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'tabular-nums text-ink-muted')} title={formatDateTime(r.at)}>{hour(r.at)}</td>
                    <td className={tdCls}><span className="mr-2 text-ink-muted">{r.kind}</span>{r.detail}</td>
                    <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>{r.medio}</td>
                    <td className={cn(tdCls, 'text-right font-medium')}><Money v={r.amount} sign={r.kind !== 'Venta'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {move && <MoveMoneySheet session={session} mode={move} expectedCash={sm?.netCash} onClose={() => setMove(null)} />}
      {closing && summary && (
        <CloseSessionDialog sessionId={session.id} summary={summary} onClose={() => setClosing(false)} onClosed={() => setClosing(false)} />
      )}
      {deposits && (
        <Modal open onOpenChange={(o) => !o && setDeposits(false)} size="sm" title="Garantía de envase"
          description="Cobrar o devolver la garantía. No es una venta ni un ingreso.">
          <BottleDepositManager cashSessionId={session.id} onClose={() => setDeposits(false)} />
        </Modal>
      )}
    </div>
  );
}
