import { Btn, StatusBadge, surfaceCls, useConfirm } from '@/components/erp';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { printThermalHtml } from '@/lib/printThermal';
import { PayAmountModal } from './PayModals';
import { AgingRow } from './PayableTab';
import { PaymentHistoryRow, RepaymentHistoryTable, groupRepaymentBatches } from './PayersTab';
import { ACCOUNTING_STATE_LABELS, ACCOUNTING_STATE_TONE, AccountingState, PAYMENT_METHOD_LABELS, Supplier } from './types';

export interface SettlementPayment {
  id: string; paidAt: string; amount: number; method: string;
  reference: string | null; notes: string | null;
  orderNumber: string; orderTotal: number; supplierInvoice: string | null; user: string;
}
export interface Settlement {
  supplier: { id: string; businessName: string; taxId: string | null };
  payments: SettlementPayment[];
  totalsByMethod: Record<string, number>;
  grandTotal: number;
  count: number;
}

export function printSettlement(s: Settlement, dateFrom: string, dateTo: string) {
  const rangeLabel = dateFrom || dateTo ? `${dateFrom || '...'} a ${dateTo || '...'}` : 'Todo el historial';
  const rows = s.payments.map(p => `
    <tr>
      <td>${formatDateTime(p.paidAt)}</td>
      <td>${p.orderNumber}</td>
      <td>${PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
      <td style="text-align:right">${formatCurrency(p.amount)}</td>
    </tr>`).join('');
  const methodRows = Object.entries(s.totalsByMethod)
    .map(([m, amt]) => `<div class="row"><span>${PAYMENT_METHOD_LABELS[m] ?? m}</span><span>${formatCurrency(amt)}</span></div>`)
    .join('');
  printThermalHtml('Liquidación de Pagos', `
    <p class="c b">LIQUIDACIÓN DE PAGOS</p>
    <p class="c">${s.supplier.businessName}</p>
    ${s.supplier.taxId ? `<p class="c">RUC: ${s.supplier.taxId}</p>` : ''}
    <p class="c">${rangeLabel}</p>
    <div class="line"></div>
    <table><thead><tr><th>Fecha</th><th>OC</th><th>Método</th><th style="text-align:right">Monto</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="line"></div>
    ${methodRows}
    <div class="row b"><span>TOTAL (${s.count} pagos)</span><span>${formatCurrency(s.grandTotal)}</span></div>
  `);
}

/* ─── Pagadores (terceros que ponen el dinero de su bolsillo) ───────────── */

export interface SupplierStatementDebt {
  orderId: string; orderNumber: string; date: string; dueDate: string | null; supplierInvoice: string | null;
  totalAmount: number; paidAmount: number; outstanding: number;
  agingBucket: '0-15' | '16-30' | '31-60' | '60+'; accountingState: AccountingState;
}
export interface SupplierStatement {
  supplier: { id: string; businessName: string; taxId: string | null };
  totalOwed: number;
  aging: Record<'0-15' | '16-30' | '31-60' | '60+', number>;
  debts: SupplierStatementDebt[];
  recentPayments: PaymentHistoryRow[];
}

// "Cuánto le debo y por qué" — a diferencia del historial de pagos de abajo
// (que solo muestra lo ya pagado), esto muestra la deuda pendiente real con
// sus compras de origen, fechas y montos.
export function SupplierDebtCard({ supplierId, businessName }: { supplierId: string; businessName: string }) {
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const { data: statement, isLoading } = useQuery({
    queryKey: ['purchases-supplier-statement', supplierId],
    queryFn: async () => (await api.get<{ data: SupplierStatement }>(`/purchases/suppliers/${supplierId}/statement`)).data.data,
  });

  const confirm = useConfirm();
  const revertMutation = useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) =>
      api.post(`/purchases/payment-batches/${batchId}/revert`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases-supplier-statement', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable-summary'] });
      toast.success('Pago revertido — el dinero volvió a Caja y el saldo pendiente se restauró.');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === '__cancelled__') return;
      toast.error(getErrorMessage(err));
    },
  });

  if (isLoading) return <div className="py-8 text-center text-ink-muted">Cargando estado de cuenta...</div>;
  if (!statement) return null;

  return (
    <div className={surfaceCls}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <div>
          <h3 className="text-body font-semibold text-ink">Deuda pendiente — {businessName}</h3>
          <p className="text-body text-ink-muted">Qué se debe y de qué compras viene, con fechas y montos.</p>
        </div>
        <div className="text-right">
          <p className="text-kpi font-semibold tabular-nums text-bad-ink">{formatCurrency(statement.totalOwed)}</p>
          {statement.totalOwed > 0 && <Btn variant="primary" size="sm" className="mt-1" onClick={() => setPayOpen(true)}>Pagar monto</Btn>}
        </div>
      </div>
      {statement.debts.length > 0 && (
        <div className="space-y-3">
          <AgingRow aging={statement.aging} />
          <div className="overflow-x-auto rounded-srf border">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b bg-surface-2 text-left text-meta uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-semibold">N° Orden</th>
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-4 py-2 font-semibold">Vence</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold">Factura</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                  <th className="px-4 py-2 font-semibold text-right">Pagado</th>
                  <th className="px-4 py-2 font-semibold text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statement.debts.map((d) => (
                  <tr key={d.orderId}>
                    <td className="px-4 py-2 font-medium">{d.orderNumber}</td>
                    <td className="px-4 py-2 text-ink-muted">{formatDateTime(d.date)}</td>
                    <td className="px-4 py-2 text-ink-muted">{d.dueDate ? formatDateTime(d.dueDate) : '—'}</td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={ACCOUNTING_STATE_TONE[d.accountingState] ?? 'neutral'}>
                        {ACCOUNTING_STATE_LABELS[d.accountingState] ?? d.accountingState}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2">{d.supplierInvoice ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(d.totalAmount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{formatCurrency(d.paidAmount)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-bad-ink">{formatCurrency(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {statement.recentPayments.length > 0 && (
        <div className="p-4">
          <RepaymentHistoryTable batches={groupRepaymentBatches(statement.recentPayments)} canRevert
            onRevert={async (batchId) => {
          const r = await confirm({
            title: 'Revertir este pago por lote',
            description: 'El dinero vuelve a donde salió y las compras recuperan su saldo pendiente.',
            confirmLabel: 'Revertir',
            reason: { label: 'Motivo', placeholder: 'Ej.: lote pagado por error, monto mal tipeado' },
          });
          if (r.ok && r.reason) revertMutation.mutate({ batchId, reason: r.reason });
        }}
            revertingKey={revertMutation.isPending ? revertMutation.variables?.batchId ?? null : null} />
        </div>
      )}
      {payOpen && (
        <PayAmountModal
          title="Pagar a proveedor"
          subtitle={businessName}
          totalOwed={statement.totalOwed}
          payUrl={`/purchases/suppliers/${supplierId}/pay`}
          invalidateKeys={[['purchases-supplier-statement', supplierId], ['purchases-payable-summary'], ['purchases-payable', supplierId], ['purchases']]}
          onClose={() => setPayOpen(false)}
          onPaid={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}

export function SettlementsTab() {
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [runFilters, setRunFilters] = useState<{ supplierId: string; dateFrom: string; dateTo: string } | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: async () => (await api.get<{ data: Supplier[] }>('/suppliers?limit=200')).data.data,
  });

  const { data: settlement, isLoading, isFetching } = useQuery({
    queryKey: ['purchase-settlement', runFilters],
    queryFn: async () => {
      const params = new URLSearchParams({ supplierId: runFilters!.supplierId });
      if (runFilters!.dateFrom) params.set('dateFrom', runFilters!.dateFrom);
      if (runFilters!.dateTo) params.set('dateTo', `${runFilters!.dateTo}T23:59:59.999`);
      return (await api.get<{ data: Settlement }>(`/purchases/settlements?${params}`)).data.data;
    },
    enabled: !!runFilters,
  });

  return (
    <div className="space-y-4">
      <p className="text-body text-ink-muted">
        Elige un proveedor para ver cuánto se le debe y de qué compras viene esa deuda. También puedes generar un
        resumen de los pagos ya hechos en un rango de fechas, para cuadrar cuentas o entregarle una liquidación.
      </p>
      <div className={surfaceCls}>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-meta font-medium text-ink-muted">Proveedor</label>
            <Select className="w-64" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selecciona un proveedor...</option>
              {(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-meta font-medium text-ink-muted">Desde</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="mb-1.5 block text-meta font-medium text-ink-muted">Hasta</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Btn variant="primary" disabled={!supplierId} loading={isFetching}
            onClick={() => setRunFilters({ supplierId, dateFrom, dateTo })}>
            Generar liquidación
          </Btn>
        </div>
      </div>

      {supplierId && (
        <SupplierDebtCard supplierId={supplierId} businessName={suppliers?.find(s => s.id === supplierId)?.businessName ?? ''} />
      )}

      {isLoading && <div className="py-12 text-center text-ink-muted">Cargando...</div>}

      {settlement && (
        <div className={surfaceCls}>
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
            <div>
              <h3 className="text-body font-semibold text-ink">{settlement.supplier.businessName}</h3>
              {settlement.supplier.taxId && <p className="text-body text-ink-muted">RUC: {settlement.supplier.taxId}</p>}
            </div>
            <Btn onClick={() => printSettlement(settlement, dateFrom, dateTo)}>
              <FileText />Imprimir
            </Btn>
          </div>
          <div className="space-y-4">
            {settlement.payments.length === 0 ? (
              <p className="py-8 text-center text-ink-muted">No hay pagos registrados a este proveedor en el rango seleccionado.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-srf border">
                  <table className="w-full text-body">
                    <thead>
                      <tr className="border-b bg-surface-2 text-left text-meta uppercase tracking-wide text-ink-muted">
                        <th className="px-4 py-2 font-semibold">Fecha</th>
                        <th className="px-4 py-2 font-semibold">Orden</th>
                        <th className="px-4 py-2 font-semibold">Factura</th>
                        <th className="px-4 py-2 font-semibold">Método</th>
                        <th className="px-4 py-2 font-semibold">Referencia</th>
                        <th className="px-4 py-2 font-semibold">Registrado por</th>
                        <th className="px-4 py-2 font-semibold text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {settlement.payments.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-2">{formatDateTime(p.paidAt)}</td>
                          <td className="px-4 py-2">{p.orderNumber}</td>
                          <td className="px-4 py-2">{p.supplierInvoice ?? '—'}</td>
                          <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                          <td className="px-4 py-2">{p.reference ?? '—'}</td>
                          <td className="px-4 py-2">{p.user}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-6 border-t pt-4 text-body">
                  {Object.entries(settlement.totalsByMethod).map(([m, amt]) => (
                    <span key={m} className="text-ink-muted tabular-nums">
                      {PAYMENT_METHOD_LABELS[m] ?? m}: <span className="font-semibold text-ink">{formatCurrency(amt)}</span>
                    </span>
                  ))}
                  <span className="text-section font-semibold tabular-nums">
                    Total ({settlement.count} {settlement.count === 1 ? 'pago' : 'pagos'}): {formatCurrency(settlement.grandTotal)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Dashboard consolidado ─────────────────────────────────────────────── */
