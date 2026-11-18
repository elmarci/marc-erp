// Historial y arqueos: cierres de caja de turno (con detalle e impresión) y,
// para supervisores, los arqueos de Caja General.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Plus, Printer } from 'lucide-react';
import { Btn, EmptyState, Pagination, Panel, Sheet, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDateTime, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { Diff, KeyRows, Money } from './parts';
import { printArqueo } from './printing';
import { useTreasuryReconciliations } from './TreasuryTab';
import { TREASURY_ACCOUNT_LABELS, type CashSession, type SessionSummary } from './types';

const PAGE_SIZE = 15;

function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data: summary } = useQuery({
    queryKey: ['cash-summary', sessionId],
    queryFn: async () => (await api.get<{ data: SessionSummary }>(`/cash/sessions/${sessionId}/summary`)).data.data,
  });
  const recs = summary?.reconciliations ?? [];
  const s = summary?.session;
  const sm = summary?.summary;
  const totalDiff = s?.difference != null ? Number(s.difference) + recs.reduce((n, r) => n + Number(r.difference), 0) : null;
  const minutes = s?.closedAt ? Math.round((new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / 60000) : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} size="sm"
      title={s ? `Cierre de ${s.cashRegister.name}` : 'Cierre de caja'}
      description={s ? `${s.cashier.firstName} ${s.cashier.lastName} · ${formatDateTime(s.openedAt)}${s.closedAt ? ` a ${formatDateTime(s.closedAt)}` : ''}` : undefined}
      footer={<><Btn onClick={onClose}>Cerrar</Btn><Btn variant="primary" disabled={!summary} onClick={() => summary && printArqueo(summary, recs)}><Printer />Imprimir arqueo</Btn></>}>
      {!s || !sm ? <div className="py-10 text-center text-table text-ink-muted">Cargando…</div> : (
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-2 text-meta font-medium text-ink-muted">Resumen financiero</h3>
            <KeyRows rows={[
              ['Monto inicial', <Money v={s.openingAmount} />],
              ...Object.entries(sm.salesByMethod).map(([m, v]) => [`Ventas ${PAYMENT_METHOD_LABELS[m] ?? m}`, <Money v={v} sign />] as [string, React.ReactNode]),
              ...Object.entries(sm.refundsByMethod ?? {}).filter(([, v]) => Number(v) > 0).map(([m, v]) => [`Devoluciones ${PAYMENT_METHOD_LABELS[m] ?? m} (ya restadas)`, <Money v={-v} />] as [string, React.ReactNode]),
              sm.debtPayments > 0 && ['Cobro de cuentas', <Money v={sm.debtPayments} sign />],
              sm.otherDeposits > 0 && ['Otros depósitos', <Money v={sm.otherDeposits} sign />],
              sm.purchasePayments > 0 && ['Pago a proveedores', <Money v={-sm.purchasePayments} sign />],
              sm.expensePayments > 0 && ['Gastos pagados', <Money v={-sm.expensePayments} sign />],
              sm.otherWithdrawals > 0 && ['Otros retiros', <Money v={-sm.otherWithdrawals} sign />],
            ]} />
          </section>
          <section className="border-t border-line pt-4">
            <h3 className="mb-2 text-meta font-medium text-ink-muted">Cuadre</h3>
            <KeyRows rows={[
              ['Efectivo esperado', <span className="font-medium tabular-nums text-ink">{formatCurrency(s.expectedAmount ?? 0)}</span>],
              ['Efectivo contado', <span className="font-medium tabular-nums text-ink">{formatCurrency(s.closingAmount ?? 0)}</span>],
              s.difference != null && ['Diferencia efectivo', <Diff v={Number(s.difference)} />],
              ...recs.map((r) => [`Diferencia ${PAYMENT_METHOD_LABELS[r.method] ?? r.method}`, <Diff v={Number(r.difference)} />] as [string, React.ReactNode]),
              totalDiff != null && recs.length > 0 && ['Diferencial total', <Diff v={totalDiff} />],
            ]} />
          </section>
          <section className="border-t border-line pt-4">
            <h3 className="mb-2 text-meta font-medium text-ink-muted">Estadísticas</h3>
            <KeyRows rows={[
              ['Total transacciones', <span className="tabular-nums text-ink">{sm.totalTransactions}</span>],
              ['Total ventas', <span className="font-medium tabular-nums text-ink">{formatCurrency(sm.totalSales)}</span>],
              ['Duración', <span className="text-ink">{minutes != null ? `${minutes} min` : '—'}</span>],
            ]} />
          </section>
        </div>
      )}
    </Sheet>
  );
}

export function HistoryTab({ canSeeTreasury, onReconcile }: { canSeeTreasury: boolean; onReconcile: () => void }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['cash-sessions', 'CLOSED', page],
    queryFn: async () => (await api.get<{ data: CashSession[]; pagination: { total: number; totalPages: number } }>(
      `/cash/sessions?status=CLOSED&page=${page}&limit=${PAGE_SIZE}`)).data,
  });
  const { data: reconciliations } = useTreasuryReconciliations(canSeeTreasury);
  const sessions = data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Cierres de caja" meta={data ? `${data.pagination.total} en total` : undefined}>
        {isLoading ? <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando…</div>
          : sessions.length === 0 ? <EmptyState icon={Clock} title="No hay sesiones cerradas aún" /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Caja</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Cajero</th>
                <th className={cn(thCls, 'hidden lg:table-cell')}>Apertura</th>
                <th className={thCls}>Cierre</th>
                <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Ventas</th>
                <th className={cn(thCls, 'hidden text-right md:table-cell')}>Esperado</th>
                <th className={cn(thCls, 'hidden text-right md:table-cell')}>Contado</th>
                <th className={cn(thCls, 'text-right')}>Diferencia</th>
              </tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} tabIndex={0} aria-label={`Ver cierre de ${s.cashRegister.name}`}
                    onClick={() => setSelected(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s.id); } }}
                    className={cn('cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none', selected === s.id && 'bg-brand-soft')}>
                    <td className={cn(tdCls, 'font-medium')}>{s.cashRegister.name}</td>
                    <td className={cn(tdCls, 'hidden md:table-cell')}>{s.user.firstName} {s.user.lastName}</td>
                    <td className={cn(tdCls, 'hidden whitespace-nowrap tabular-nums text-ink-muted lg:table-cell')}>{formatDateTime(s.openedAt)}</td>
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{s.closedAt ? formatDateTime(s.closedAt) : '—'}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{s._count.sales}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums md:table-cell')}>{s.expectedAmount != null ? formatCurrency(s.expectedAmount) : '—'}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums md:table-cell')}>{s.closingAmount != null ? formatCurrency(s.closingAmount) : '—'}</td>
                    <td className={cn(tdCls, 'text-right')}>{s.difference != null ? <Diff v={Number(s.difference)} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPage={setPage} />
        )}
      </Panel>

      {canSeeTreasury && (
        <Panel title="Arqueos de Caja General" meta="Últimos 50" actions={<Btn size="sm" onClick={onReconcile}><Plus />Registrar arqueo</Btn>}>
          {!reconciliations || reconciliations.length === 0 ? <EmptyState title="Sin arqueos registrados" /> : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>Fecha</th><th className={thCls}>Cuenta</th>
                  <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Esperado</th>
                  <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Contado</th>
                  <th className={cn(thCls, 'text-right')}>Diferencia</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Registrado por</th>
                </tr></thead>
                <tbody>
                  {reconciliations.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{formatDateTime(r.date)}</td>
                      <td className={tdCls}>{TREASURY_ACCOUNT_LABELS[r.account] ?? r.account}</td>
                      <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{formatCurrency(r.expectedAmount)}</td>
                      <td className={cn(tdCls, 'hidden text-right tabular-nums sm:table-cell')}>{formatCurrency(r.countedAmount)}</td>
                      <td className={cn(tdCls, 'text-right')} title={r.notes ?? undefined}><Diff v={Number(r.difference)} /></td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{r.user.firstName} {r.user.lastName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {selected && <SessionDetail sessionId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
