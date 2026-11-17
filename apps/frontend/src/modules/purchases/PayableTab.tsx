import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Btn, EmptyState, Panel, StatusBadge, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { formatCurrency, formatDate, formatDateTime, cn } from '@/lib/utils';
import { PayAmountModal, PayPurchaseModal } from './PayModals';
import { AGING_BUCKET_LABELS, PayableOrder } from './types';

export interface SupplierPayableSummary {
  supplierId: string; businessName: string; totalOwed: number; orderCount: number; oldestDate: string;
  overdueCount: number; observedCount: number;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
}

export function AgingRow({ aging }: { aging: Record<'0-15' | '16-30' | '31-60' | '60+', number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(['0-15', '16-30', '31-60', '60+'] as const).filter(b => aging[b] > 0).map((b) => (
        <StatusBadge key={b} tone={b === '60+' ? 'bad' : b === '31-60' ? 'warn' : 'neutral'}>
          {AGING_BUCKET_LABELS[b]}: {formatCurrency(aging[b])}
        </StatusBadge>
      ))}
    </div>
  );
}

// Detalle de las órdenes pendientes de UN proveedor — se pide solo cuando se
// expande su fila, no de entrada (evita traer todo el detalle de golpe).
export function SupplierPayableDetail({ supplierId, onPayOrder }: { supplierId: string; onPayOrder: (o: PayableOrder) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchases-payable', supplierId],
    queryFn: async () => (await api.get<{ data: PayableOrder[] }>(`/purchases/payable?supplierId=${supplierId}&limit=100`)).data.data,
  });

  if (isLoading) return <div className="py-4 text-center text-meta text-ink-muted">Cargando…</div>;

  return (
    <div className="overflow-x-auto rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
      <table className={tableCls}>
        <thead>
          <tr>
            <th className={thCls}>N° de orden</th>
            <th className={thCls}>Fecha</th>
            <th className={cn(thCls, 'text-right')}>Total</th>
            <th className={cn(thCls, 'text-right')}>Pagado</th>
            <th className={cn(thCls, 'text-right')}>Pendiente</th>
            <th className={cn(thCls, 'w-px')} />
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((o) => (
            <tr key={o.id}>
              <td className={cn(tdCls, 'font-medium tabular-nums')}>{o.orderNumber}</td>
              <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-ink-muted')}>{formatDateTime(o.createdAt)}</td>
              <td className={cn(tdCls, 'text-right tabular-nums')}>{formatCurrency(o.totalAmount)}</td>
              <td className={cn(tdCls, 'text-right tabular-nums text-ink-muted')}>{formatCurrency(o.paidAmount)}</td>
              <td className={cn(tdCls, 'text-right font-medium tabular-nums text-bad-ink')}>{formatCurrency(o.outstanding)}</td>
              <td className={cn(tdCls, 'pr-2 text-right')}><Btn size="sm" onClick={() => onPayOrder(o)}>Pagar esta</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayableTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payOrder, setPayOrder] = useState<PayableOrder | null>(null);
  const [paySupplier, setPaySupplier] = useState<SupplierPayableSummary | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases-payable-summary'],
    queryFn: async () => (await api.get<{ data: { suppliers: SupplierPayableSummary[]; grandTotal: number } }>(
      '/purchases/payable-summary'
    )).data.data,
  });
  const suppliers = data?.suppliers ?? [];

  return (
    <>
      <Panel title="Cuentas por pagar"
        meta={suppliers.length ? `${suppliers.length} ${suppliers.length === 1 ? 'proveedor' : 'proveedores'}` : undefined}
        actions={suppliers.length > 0 && data ? (
          <span className="text-table text-ink-muted">Total pendiente <span className="text-body font-semibold tabular-nums text-bad-ink">{formatCurrency(data.grandTotal)}</span></span>
        ) : undefined}>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div> : (
          <div className="divide-y divide-line">
            {suppliers.map((s) => {
              const open = expanded === s.supplierId;
              return (
                <div key={s.supplierId}>
                  <div role="button" tabIndex={0} aria-expanded={open}
                    className={cn('flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-ink/[0.025]', open && 'bg-ink/[0.025]')}
                    onClick={() => setExpanded(v => v === s.supplierId ? null : s.supplierId)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => v === s.supplierId ? null : s.supplierId); } }}>
                    {open ? <ChevronDown className="size-4 shrink-0 text-ink-muted" /> : <ChevronRight className="size-4 shrink-0 text-ink-muted" />}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-medium text-ink">{s.businessName}</span>
                        {s.overdueCount > 0 && <StatusBadge tone="bad">{s.overdueCount} {s.overdueCount === 1 ? 'vencida' : 'vencidas'}</StatusBadge>}
                        {s.observedCount > 0 && <StatusBadge tone="warn">{s.observedCount} {s.observedCount === 1 ? 'observada' : 'observadas'}</StatusBadge>}
                      </div>
                      <span className="text-meta text-ink-muted">{s.orderCount} {s.orderCount === 1 ? 'compra pendiente' : 'compras pendientes'} · desde {formatDate(s.oldestDate)}</span>
                      <AgingRow aging={s.aging} />
                    </div>
                    <span className="text-section font-semibold tabular-nums text-bad-ink">{formatCurrency(s.totalOwed)}</span>
                    <Btn variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); setPaySupplier(s); }}>Pagar monto</Btn>
                  </div>
                  {open && (
                    <div className="bg-surface-2 px-4 pb-4 pt-1">
                      <SupplierPayableDetail supplierId={s.supplierId} onPayOrder={setPayOrder} />
                    </div>
                  )}
                </div>
              );
            })}
            {suppliers.length === 0 && <EmptyState title="No hay compras pendientes de pago." />}
          </div>
        )}
      </Panel>

      {payOrder && <PayPurchaseModal order={payOrder} onClose={() => setPayOrder(null)} onPaid={() => setPayOrder(null)} />}
      {paySupplier && (
        <PayAmountModal
          title="Pagar a proveedor"
          subtitle={paySupplier.businessName}
          totalOwed={paySupplier.totalOwed}
          payUrl={`/purchases/suppliers/${paySupplier.supplierId}/pay`}
          invalidateKeys={[['purchases-payable-summary'], ['purchases-payable', paySupplier.supplierId], ['purchases']]}
          onClose={() => setPaySupplier(null)}
          onPaid={() => setPaySupplier(null)}
        />
      )}
    </>
  );
}
