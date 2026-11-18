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
type Medio = 'ALL' | 'CASH' | 'YAPE' | 'PLIN' | 'CARD';
const MEDIO_LABEL: Record<Medio, string> = { ALL: 'Todos', CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', CARD: 'Tarjeta' };
const inMedio = (method: string, medio: Medio) =>
  medio === 'ALL' || method === medio || (medio === 'CARD' && (method === 'DEBIT_CARD' || method === 'CREDIT_CARD'));
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
  const [medio, setMedio] = useState<Medio>('ALL');
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
  const refundTotal = Object.values(sm?.refundsByMethod ?? {}).reduce((a, v) => a + Number(v), 0);
  const rows = [
    ...(filter !== 'moves' ? (sales ?? []).flatMap((s) => {
      const legs = s.payments.filter((p) => inMedio(p.method, medio));
      if (!legs.length) return [];
      const cash = s.payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + Number(p.amount), 0);
      const methods = [...new Set(s.payments.map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method))].join(' + ');
      const mixed = s.payments.length > 1;
      // Con un medio elegido, el monto es solo lo pagado por ese medio.
      const amount = medio === 'ALL' ? Number(s.totalAmount) : legs.reduce((a, p) => a + Number(p.amount), 0);
      return [{
        id: s.id, at: s.createdAt, kind: 'Venta', detail: `${s.saleNumber} · ${s._count.items} ítem(s)`,
        medio: medio === 'ALL' && cash > 0 && cash < Number(s.totalAmount) ? `${methods} (efectivo ${formatCurrency(cash)})`
          : medio !== 'ALL' && mixed ? `${methods} (de ${formatCurrency(s.totalAmount)})` : methods,
        amount,
      }];
    }) : []),
    // Las entradas y salidas del cajón son siempre en efectivo.
    ...(filter !== 'sales' && inMedio('CASH', medio) ? (movements ?? []).map((m) => ({
      id: m.id, at: m.createdAt, kind: m.type === 'WITHDRAWAL' ? 'Salida' : 'Entrada', detail: m.reason,
      medio: 'Efectivo', amount: m.type === 'WITHDRAWAL' ? -Number(m.amount) : Number(m.amount),
    })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const rowsTotal = rows.reduce((a, r) => a + r.amount, 0);

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
                refundTotal > 0 && ['Devoluciones (ya restadas)', <Money v={-refundTotal} sign />],
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
        actions={<>
          <Segmented value={medio} onChange={setMedio} ariaLabel="Medio de pago"
            options={(Object.keys(MEDIO_LABEL) as Medio[]).map((k) => [k, MEDIO_LABEL[k]] as const)} />
          <Segmented value={filter} onChange={setFilter} ariaLabel="Mostrar"
            options={[['all', 'Todo'], ['sales', 'Ventas'], ['moves', 'Entradas y salidas']]} />
        </>}>
        {rows.length === 0 ? (
          <EmptyState title={medio !== 'ALL' ? `Nada en ${MEDIO_LABEL[medio]} en esta sesión` : filter === 'sales' ? 'Sin ventas en esta sesión' : filter === 'moves' ? 'Sin movimientos registrados' : 'Sin ventas ni movimientos todavía'} />
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
        {medio !== 'ALL' && rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2.5 text-table">
            <span className="text-ink-muted">{rows.length} movimiento(s) en {MEDIO_LABEL[medio]}{filter === 'all' && medio === 'CASH' ? ', sin contar el monto inicial' : ''}</span>
            <span className="font-medium"><Money v={rowsTotal} sign={filter !== 'sales'} /></span>
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
