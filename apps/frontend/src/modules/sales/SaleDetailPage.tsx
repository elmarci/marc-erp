// Detalle de una venta: datos, pagos, productos, ticket y anulación.
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { useState } from 'react';
import { ReceiptModal, type ReceiptData } from '@/modules/pos/ReceiptModal';
import { toast } from 'sonner';
import { Btn, Panel, StatusBadge, tableCls, tdCls, thCls, useConfirm } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime, STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { SALE_STATUS_TONE } from './SalesPage';

const DOC_LABELS: Record<string, string> = { BOLETA: 'Boleta', FACTURA: 'Factura', NOTA_VENTA: 'Nota de venta', TICKET: 'Ticket' };

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasMinRole } = useAuthStore();
  const confirm = useConfirm();

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const res = await api.get<{ data: unknown }>(`/sales/${id}`);
      return res.data.data as {
        id: string; saleNumber: string; totalAmount: number; subtotal: number; taxAmount: number;
        discountAmount: number; status: string; createdAt: string; documentType: string; notes: string | null;
        cashier: { firstName: string; lastName: string };
        customer: { firstName: string; lastName: string } | null;
        items: Array<{ id: string; productName: string; quantity: number; unitPrice: number; subtotal: number; unit: string | null }>;
        payments: Array<{ method: string; amount: number; commissionAmount?: number }>;
        commissionAmount?: number; commissionPercent?: number;
        amountTendered?: number; changeAmount?: number; pointsEarned?: number; pointsRedeemed?: number;
      };
    },
  });

  const [showReceipt, setShowReceipt] = useState(false);

  // Los pagos se guardan netos (hasta el total de la venta); lo que el cliente
  // realmente entregó y el vuelto están aparte. Para el ticket reimpreso se
  // vuelve a sumar el vuelto al pago en efectivo, como salió al cobrar.
  const change = Number(sale?.changeAmount ?? 0);
  const receiptPayments = (sale?.payments ?? []).map((p) => ({ method: p.method, amount: Number(p.amount), commissionAmount: Number(p.commissionAmount ?? 0) }));
  if (change > 0.004 && receiptPayments.length > 0) {
    const idx = receiptPayments.findIndex((p) => p.method === 'CASH');
    receiptPayments[idx >= 0 ? idx : receiptPayments.length - 1].amount += change;
  }

  const voidMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/sales/${id}/void`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      toast.success('Venta anulada.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <div className="erp py-16 text-center text-table text-ink-muted">Cargando…</div>;
  if (!sale) return <div className="erp py-16 text-center text-table text-ink-muted">Venta no encontrada</div>;

  const voidSale = async () => {
    const r = await confirm({
      title: `Anular venta ${sale.saleNumber}`,
      description: 'La venta queda anulada y sus productos vuelven al stock.',
      confirmLabel: 'Anular venta',
      reason: { label: 'Motivo de anulación', placeholder: 'Ej.: el cliente se arrepintió' },
    });
    if (r.ok && r.reason) voidMutation.mutate(r.reason);
  };
  const row = (label: string, value: React.ReactNode, cls?: string) => (
    <div className={cn('flex justify-between gap-3', cls)}><span className="text-ink-muted">{label}</span><span className="tabular-nums">{value}</span></div>
  );

  return (
    <div className="erp flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* navigate(-1): vuelve a la página y filtros de donde vino. */}
          <Btn variant="ghost" size="sm" aria-label="Volver" onClick={() => navigate(-1)}><ArrowLeft /></Btn>
          <div>
            <h1 className="flex items-center gap-2 font-mono text-title font-semibold tracking-tight text-ink">
              {sale.saleNumber}
              <StatusBadge tone={SALE_STATUS_TONE[sale.status] ?? 'neutral'} className="font-sans">{STATUS_LABELS[sale.status] ?? sale.status}</StatusBadge>
            </h1>
            <p className="text-table text-ink-muted">{formatDateTime(sale.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn onClick={() => setShowReceipt(true)}><Printer />Ticket</Btn>
          {hasMinRole('SUPERVISOR') && sale.status === 'COMPLETED' && (
            <Btn variant="danger" loading={voidMutation.isPending} onClick={voidSale}><Ban />Anular</Btn>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Información" bodyClassName="flex flex-col gap-2 p-4 text-table">
          {row('Cajero', `${sale.cashier.firstName} ${sale.cashier.lastName}`)}
          {sale.customer && row('Cliente', `${sale.customer.firstName} ${sale.customer.lastName}`)}
          {row('Documento', DOC_LABELS[sale.documentType] ?? sale.documentType)}
          {sale.notes && row('Nota', sale.notes)}
        </Panel>
        <Panel title="Pagos" bodyClassName="flex flex-col gap-2 p-4 text-table">
          {receiptPayments.map((p, i) => <div key={i}>{row(PAYMENT_METHOD_LABELS[p.method] ?? p.method, <span className="font-medium">{formatCurrency(p.amount)}</span>)}</div>)}
          {change > 0.004 && row('Vuelto', <span className="font-medium">{formatCurrency(change)}</span>, 'border-t border-line pt-2')}
        </Panel>
      </div>

      <Panel title="Productos" meta={`${sale.items.length} línea(s)`}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={thCls}>Producto</th>
              <th className={cn(thCls, 'text-right')}>Cant.</th>
              <th className={cn(thCls, 'text-right')}>Precio</th>
              <th className={cn(thCls, 'text-right')}>Subtotal</th>
            </tr></thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className={tdCls}>{item.productName}</td>
                  <td className={cn(tdCls, 'text-right tabular-nums')}>{Number(item.quantity)}{item.unit ? <span className="ml-1 text-meta text-ink-muted">{item.unit}</span> : null}</td>
                  <td className={cn(tdCls, 'text-right tabular-nums')}>{formatCurrency(item.unitPrice)}</td>
                  <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto flex max-w-xs flex-col gap-1 p-4 text-table">
          {row('Subtotal', formatCurrency(sale.subtotal))}
          {Number(sale.discountAmount) > 0 && row('Descuento', `-${formatCurrency(sale.discountAmount)}`)}
          {row('IGV', formatCurrency(sale.taxAmount))}
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-section font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(sale.totalAmount)}</span></div>
          {Number(sale.commissionAmount ?? 0) > 0 && <>
            {row(`Comisión tarjeta (${Number(sale.commissionPercent)}%)`, formatCurrency(Number(sale.commissionAmount)))}
            <div className="flex justify-between font-semibold"><span>Cobrado al cliente</span><span className="tabular-nums">{formatCurrency(Number(sale.totalAmount) + Number(sale.commissionAmount))}</span></div>
          </>}
        </div>
      </Panel>
      {showReceipt && (
        <ReceiptModal
          data={{
            saleNumber: sale.saleNumber,
            createdAt: sale.createdAt,
            cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
            customerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : null,
            documentType: sale.documentType,
            notes: sale.notes,
            items: sale.items.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, unit: i.unit ?? undefined })),
            subtotal: sale.subtotal,
            discountAmount: sale.discountAmount,
            taxAmount: sale.taxAmount,
            totalAmount: Number(sale.totalAmount),
            commissionAmount: Number(sale.commissionAmount ?? 0),
            commissionPercent: Number(sale.commissionPercent ?? 0) || undefined,
            payments: receiptPayments,
            change: change > 0.004 ? change : undefined,
            pointsEarned: Number(sale.pointsEarned ?? 0),
            pointsRedeemed: Number(sale.pointsRedeemed ?? 0),
          } as ReceiptData}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
