// Caja General: el total, cada cuenta (efectivo, Yape, Plin) con su último
// arqueo, y los movimientos con filtro por cuenta o traspasos.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { EmptyState, Panel, Segmented, fieldCls, surfaceCls, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { Money } from './parts';
import {
  TREASURY_ACCOUNT_LABELS, balanceOf, isZero,
  type TransferRow, type TreasuryAccount, type TreasuryBalances, type TreasuryMovementRow, type TreasuryReconciliationRow,
} from './types';

type View = 'ALL' | TreasuryAccount | 'TRANSFERS';

export function useTreasuryBalance(enabled = true) {
  return useQuery({
    queryKey: ['treasury-balance'],
    queryFn: async () => (await api.get<{ data: TreasuryBalances }>('/treasury/balance')).data.data,
    refetchInterval: 30000,
    enabled,
  });
}

export function useTreasuryReconciliations(enabled = true) {
  return useQuery({
    queryKey: ['treasury-reconciliations'],
    queryFn: async () => (await api.get<{ data: TreasuryReconciliationRow[] }>('/treasury/reconciliations?limit=50')).data.data,
    enabled,
  });
}

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}

function lastCount(rows: TreasuryReconciliationRow[] | undefined, acc: TreasuryAccount): { text: string; tone: 'ok' | 'warn' | 'none' } {
  const r = rows?.find((x) => x.account === acc);
  if (!r) return { text: 'Sin arqueo registrado', tone: 'none' };
  const d = Number(r.difference);
  if (isZero(d)) return { text: `Contado ${daysAgo(r.date)} · cuadró`, tone: 'ok' };
  return { text: `Contado ${daysAgo(r.date)} · ${d < 0 ? 'faltaron' : 'sobraron'} ${formatCurrency(Math.abs(d))}`, tone: 'warn' };
}

export function TreasuryTab({ onCount }: { onCount: (acc: TreasuryAccount) => void }) {
  const [view, setView] = useState<View>('ALL');
  const [q, setQ] = useState('');
  const { data: balances } = useTreasuryBalance();
  const { data: reconciliations } = useTreasuryReconciliations();
  const { data: movements, isLoading } = useQuery({
    queryKey: ['treasury-movements'],
    queryFn: async () => (await api.get<{ data: TreasuryMovementRow[] }>('/treasury/movements?limit=50')).data.data,
    enabled: view !== 'TRANSFERS',
  });
  const { data: transfers } = useQuery({
    queryKey: ['treasury-transfers'],
    queryFn: async () => (await api.get<{ data: TransferRow[] }>('/treasury/transfers?limit=50')).data.data,
    enabled: view === 'TRANSFERS',
  });
  const { data: depositsOutstanding } = useQuery({
    queryKey: ['bottle-deposits-totals'],
    queryFn: async () => (await api.get<{ totals: { outstandingQty: number; outstandingAmount: number } }>('/bottle-deposits')).data.totals,
  });

  const needle = q.trim().toLowerCase();
  const shown = (movements ?? []).filter((m) => (view === 'ALL' || m.account === view)
    && (!needle || `${m.description} ${m.user.firstName} ${m.user.lastName}`.toLowerCase().includes(needle)));
  const shownTransfers = (transfers ?? []).filter((t) => !needle || `${t.notes ?? ''} ${t.user.firstName} ${t.user.lastName}`.toLowerCase().includes(needle));
  const total = balances?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Cada cuenta se cuadra por separado: nunca se mezclan aunque sumen al mismo total. */}
      <div className={cn('grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4', surfaceCls)}>
        <div className="flex flex-col gap-1 bg-brand px-4 py-3.5 text-white">
          <div className="text-meta opacity-70">Saldo de Caja General</div>
          <div className="text-kpi font-semibold tabular-nums">{balances ? formatCurrency(total) : '…'}</div>
          <div className="text-meta opacity-70">Efectivo + Yape + Plin</div>
        </div>
        {(['CASH', 'YAPE', 'PLIN'] as const).map((acc) => {
          const c = lastCount(reconciliations, acc);
          const v = balanceOf(balances, acc);
          return (
            <div key={acc} className="flex flex-col gap-1 bg-surface px-4 py-3.5">
              <div className="flex items-center justify-between text-meta text-ink-muted">
                {TREASURY_ACCOUNT_LABELS[acc]}
                <button type="button" onClick={() => onCount(acc)} className="rounded font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">Contar</button>
              </div>
              <div className={cn('text-kpi font-semibold tabular-nums text-ink', v < 0 && 'text-bad-ink')}>{balances ? formatCurrency(v) : '…'}</div>
              <div className="flex items-center gap-1.5 text-meta text-ink-muted">
                <span className={cn('size-1.5 shrink-0 rounded-full', c.tone === 'ok' ? 'bg-ok' : c.tone === 'warn' ? 'bg-warn' : 'bg-ink-muted/40')} aria-hidden />
                <span className="truncate">{c.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Movimientos de Caja General" meta="Últimos 50">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <div className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input placeholder="Buscar movimiento" aria-label="Buscar movimiento" value={q} onChange={(e) => setQ(e.target.value)} className={cn(fieldCls, 'h-8 pl-8')} />
          </div>
          <Segmented value={view} onChange={setView} ariaLabel="Cuenta"
            options={[['ALL', 'Todas'], ['CASH', 'Efectivo'], ['YAPE', 'Yape'], ['PLIN', 'Plin'], ['TRANSFERS', 'Traspasos']]} />
        </div>

        {view === 'TRANSFERS' ? (<>
          <p className="px-3 pt-2 text-meta text-ink-muted">Dinero que pasó de una cuenta a otra. No son gastos ni ingresos, no afectan el margen.</p>
          {shownTransfers.length === 0 ? <EmptyState title="Sin traspasos registrados" /> : (
            <div className="mt-2 overflow-x-auto">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>Fecha</th><th className={thCls}>De</th><th className={thCls}>A</th>
                  <th className={cn(thCls, 'hidden md:table-cell')}>Notas</th><th className={cn(thCls, 'hidden sm:table-cell')}>Registrado por</th>
                  <th className={cn(thCls, 'text-right')}>Monto</th>
                </tr></thead>
                <tbody>
                  {shownTransfers.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{formatDateTime(t.createdAt)}</td>
                      <td className={tdCls}>{TREASURY_ACCOUNT_LABELS[t.fromAccount] ?? t.fromAccount}</td>
                      <td className={tdCls}>{TREASURY_ACCOUNT_LABELS[t.toAccount] ?? t.toAccount}</td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{t.notes ?? '—'}</td>
                      <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>{t.user.firstName} {t.user.lastName}</td>
                      <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>) : isLoading ? (
          <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando…</div>
        ) : shown.length === 0 ? (
          <EmptyState title={needle ? 'Ningún movimiento coincide con la búsqueda' : 'Sin movimientos registrados'} />
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={cn(thCls, 'w-36')}>Fecha</th><th className={thCls}>Detalle</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Cuenta</th>
                <th className={cn(thCls, 'text-right')}>Monto</th>
                <th className={cn(thCls, 'hidden text-right md:table-cell')}>Saldo de la cuenta</th>
              </tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{formatDateTime(m.createdAt)}</td>
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div>{m.description}</div>
                      <div className="text-meta text-ink-muted">{m.user.firstName} {m.user.lastName}<span className="sm:hidden"> · {TREASURY_ACCOUNT_LABELS[m.account] ?? m.account}</span></div>
                    </td>
                    <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>{TREASURY_ACCOUNT_LABELS[m.account] ?? m.account}</td>
                    <td className={cn(tdCls, 'text-right font-medium')}><Money v={m.type === 'WITHDRAWAL' ? -m.amount : m.amount} sign /></td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums text-ink-muted md:table-cell')}>{formatCurrency(m.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {depositsOutstanding && depositsOutstanding.outstandingQty > 0 && (
          <div className="border-t border-line px-3 py-2.5 text-meta text-ink-muted">
            Pendiente por devolver en garantías: <span className="font-medium text-ink">{formatCurrency(depositsOutstanding.outstandingAmount)}</span>
            {' '}({depositsOutstanding.outstandingQty} envase{depositsOutstanding.outstandingQty !== 1 ? 's' : ''}). No está incluido en el saldo. Ver detalle en Ventas, pestaña Envases.
          </div>
        )}
      </Panel>
    </div>
  );
}
