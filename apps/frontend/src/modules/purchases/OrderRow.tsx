import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, XCircle, Truck, FileText, Undo2, Pencil, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, RowMenu, StatusBadge, tableCls, tdCls, thCls, useConfirm, type RowAction } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, formatDate, formatDateTime, cn } from '@/lib/utils';
import { EditDocumentModal, SupplierReturnModal, SupplierReturnsList, DOC_TYPE_LABELS } from './SupplierDocuments';
import { CorrectItemModal, EditOrderItemModal } from './ItemModals';
import { PayPurchaseModal } from './PayModals';
import { ReceiveOrderModal } from './ReceiveOrderModal';
import { printPurchaseReceipt } from './printing';
import { ACCOUNTING_STATE_LABELS, ACCOUNTING_STATE_TONE, OrderDetail, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONE, PurchaseOrder, STATUS_LABELS, STATUS_TONE } from './types';

export function OrderRow({ order }: { order: PurchaseOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [correctingItem, setCorrectingItem] = useState<{ productId: string; name: string; receivedQty: number; unitCost: number; isBonus: boolean } | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; orderedQty: number; unitCost: number } | null>(null);
  const [editingDoc, setEditingDoc] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data: detail } = useQuery({
    queryKey: ['purchase', order.id],
    queryFn: async () => (await api.get<{ data: OrderDetail }>(`/purchases/${order.id}`)).data.data,
    enabled: expanded,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/purchases/${order.id}/cancel`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchases'] }); toast.success('Orden cancelada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${order.id}/void`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Compra anulada — stock y costo revertidos a como estaban antes.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const discrepancyMutation = useMutation({
    mutationFn: ({ hasDiscrepancy, notes }: { hasDiscrepancy: boolean; notes?: string }) =>
      api.patch(`/purchases/${order.id}/discrepancy`, { hasDiscrepancy, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Se actualizó el estado de observación.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const revertPaymentMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${order.id}/revert-payment`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases-payable'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success('Pago revertido — el dinero volvió a Caja General y la orden quedó a crédito.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleRevertPayment = async () => {
    const r = await confirm({
      title: `Revertir el pago de ${order.orderNumber}`,
      description: 'El dinero vuelve a Caja General y la compra queda a crédito.',
      confirmLabel: 'Revertir pago',
      reason: { label: 'Motivo', placeholder: 'Ej.: se marcó pagada por error, era a crédito' },
    });
    if (r.ok && r.reason) revertPaymentMutation.mutate(r.reason);
  };

  const handleDiscrepancy = async (hasDiscrepancy: boolean) => {
    if (!hasDiscrepancy) { discrepancyMutation.mutate({ hasDiscrepancy }); return; }
    const r = await confirm({
      title: `Marcar ${order.orderNumber} como observada`,
      description: 'No entra a los pagos "por monto" hasta que se resuelva.',
      confirmLabel: 'Marcar observada',
      tone: 'primary',
      reason: { label: '¿Cuál es la discrepancia?', placeholder: 'Ej.: llegó menos cantidad de la pedida', optional: true },
    });
    if (r.ok) discrepancyMutation.mutate({ hasDiscrepancy, notes: r.reason || undefined });
  };

  const handleCancel = async () => {
    const r = await confirm({
      title: `Anular el pedido ${order.orderNumber}`,
      description: 'Todavía no llegó mercadería, así que no cambia el stock ni el costo.',
      confirmLabel: 'Anular pedido',
    });
    if (r.ok) cancelMutation.mutate();
  };

  const handleVoid = async () => {
    try {
      const checkRes = await api.get<{ data: { hasWarning: boolean; affectedProducts: string[] } }>(`/purchases/${order.id}/void-check`);
      const { hasWarning, affectedProducts } = checkRes.data.data;
      const r = await confirm({
        title: `Anular compra ${order.orderNumber}`,
        description: hasWarning
          ? <>Ya se vendieron productos de esta compra: {affectedProducts.join(', ')}. Anularla podría no reflejar el inventario real. El stock y el costo vuelven a como estaban antes.</>
          : 'El stock y el costo de los productos vuelven a como estaban antes de esta compra.',
        confirmLabel: 'Anular compra',
        reason: { label: 'Motivo de la anulación' },
      });
      if (r.ok && r.reason) voidMutation.mutate(r.reason);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // Ya no hay paso de aprobación: lo pedido se puede recibir de inmediato.
  const canReceive = ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(order.status);
  const canCancel = !['RECEIVED', 'CANCELLED'].includes(order.status);
  const canVoid = order.status === 'RECEIVED';
  // Antes de recibir mercadería no hay stock/costo que revertir — se puede
  // corregir cantidad/costo directo en la línea, sin pasar por "corregir
  // línea recibida" (que sí revierte kardex).
  const canEditItems = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(order.status);

  const rowActions: RowAction[] = [
    ...(canReceive ? [{ label: 'Recibir mercadería', icon: Truck, onSelect: () => { setExpanded(true); setShowReceive(true); } }] : []),
    { label: expanded ? 'Ocultar detalle' : 'Ver detalle', icon: FileText, onSelect: () => setExpanded(v => !v) },
    ...(canCancel ? [{ label: 'Anular pedido', icon: XCircle, onSelect: handleCancel, danger: true, separated: true }] : []),
    ...(canVoid ? [{ label: 'Anular compra', icon: XCircle, onSelect: handleVoid, danger: true, separated: true }] : []),
  ];
  const isVoided = order.accountingState === 'ANULADO' || order.status === 'CANCELLED';
  const iconBtn = 'tap grid size-7 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink';
  const sub = 'text-meta font-medium uppercase tracking-wide text-ink-muted';

  return (
    <>
      <tr className={cn('cursor-pointer transition-colors hover:bg-ink/[0.025]', expanded && 'bg-ink/[0.025]')} onClick={() => setExpanded(v => !v)}>
        <td className={cn(tdCls, 'font-medium tabular-nums', isVoided && 'text-ink-muted line-through')}>{order.orderNumber}</td>
        <td className={cn(tdCls, 'max-w-[280px] truncate')}>{order.supplier.businessName}</td>
        <td className={tdCls}><StatusBadge tone={STATUS_TONE[order.status] ?? 'neutral'}>{STATUS_LABELS[order.status] ?? order.status}</StatusBadge></td>
        <td className={tdCls}>
          <StatusBadge tone={ACCOUNTING_STATE_TONE[order.accountingState] ?? 'neutral'}>
            {ACCOUNTING_STATE_LABELS[order.accountingState] ?? order.accountingState}
          </StatusBadge>
        </td>
        <td className={cn(tdCls, 'hidden whitespace-nowrap tabular-nums text-ink-muted md:table-cell')}>{formatDateTime(order.createdAt)}</td>
        <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(order.totalAmount)}</td>
        <td className={cn(tdCls, 'hidden text-right tabular-nums lg:table-cell')}>{order._count.items}</td>
        <td className={cn(tdCls, 'w-px whitespace-nowrap pr-2 text-right')} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            {canReceive && (
              <Btn size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => { setExpanded(true); setShowReceive(true); }}>
                <Truck />Recibir
              </Btn>
            )}
            <RowMenu actions={rowActions} label={`Acciones de ${order.orderNumber}`} />
            <button type="button" className={iconBtn} aria-label={expanded ? 'Ocultar detalle' : 'Ver detalle'} aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>
        </td>
      </tr>

      {expanded && !detail && (
        <tr><td colSpan={8} className={cn(tdCls, 'bg-surface-2 py-4 text-center text-ink-muted')}>Cargando detalle…</td></tr>
      )}

      {expanded && detail && (
        <tr>
          <td colSpan={8} className="border-b border-line bg-surface-2 p-3 sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>Producto</th>
                      <th className={cn(thCls, 'text-right')}>Pedido</th>
                      <th className={cn(thCls, 'text-right')}>Recibido</th>
                      <th className={cn(thCls, 'text-right')}>{detail.igvIncluded ? 'Costo con IGV' : 'Costo unit.'}</th>
                      <th className={cn(thCls, 'text-right')}>Subtotal</th>
                      {(!detail.voidedAt || canEditItems) && <th className={cn(thCls, 'w-px')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id}>
                        <td className={tdCls}>
                          <span className="mr-2">{item.product.name}</span>
                          {item.isBonus && <StatusBadge tone="ok">Bonificación</StatusBadge>}
                        </td>
                        <td className={cn(tdCls, 'text-right tabular-nums')}>{item.orderedQty}</td>
                        <td className={cn(tdCls, 'text-right tabular-nums', item.receivedQty >= item.orderedQty ? 'text-ok-ink' : item.receivedQty > 0 ? 'text-warn-ink' : '')}>
                          {item.receivedQty}
                        </td>
                        <td className={cn(tdCls, 'text-right tabular-nums')}>{item.isBonus ? 'Gratis' : formatCost(item.unitCost)}</td>
                        <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(item.subtotal)}</td>
                        {(!detail.voidedAt || canEditItems) && (
                          <td className={cn(tdCls, 'pr-2 text-right')}>
                            {canEditItems && (
                              <button type="button" className={iconBtn}
                                title="Editar cantidad o costo de esta línea" aria-label={`Editar ${item.product.name}`}
                                onClick={() => setEditingItem({
                                  id: item.id, name: item.product.name,
                                  orderedQty: Number(item.orderedQty), unitCost: Number(item.unitCost),
                                })}>
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                            {!canEditItems && !detail.voidedAt && item.receivedQty > 0 && (
                              <button type="button" className={iconBtn}
                                title="Corregir esta línea (producto, costo o bonificación)" aria-label={`Corregir ${item.product.name}`}
                                onClick={() => setCorrectingItem({
                                  productId: item.product.id, name: item.product.name,
                                  receivedQty: Number(item.receivedQty), unitCost: Number(item.unitCost), isBonus: item.isBonus,
                                })}>
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 px-3 py-2 text-table">
                  {Number(detail.taxAmount) > 0 && (
                    <span className="text-ink-muted">{detail.igvIncluded ? 'IGV incluido' : 'IGV sumado'} <span className="font-medium tabular-nums text-ink">{formatCurrency(detail.taxAmount)}</span></span>
                  )}
                  {Number(detail.perceptionAmount ?? 0) > 0 && (
                    <span className="text-ink-muted">Percepción <span className="font-medium tabular-nums text-ink">{formatCurrency(detail.perceptionAmount ?? 0)}</span></span>
                  )}
                  <span className="text-ink-muted">Total <span className="font-semibold tabular-nums text-ink">{formatCurrency(detail.totalAmount)}</span></span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex flex-col gap-1.5 rounded-srf bg-surface p-3 shadow-[0_0_0_1px_hsl(var(--line))]">
                  <span className={sub}>Comprobante</span>
                  <div className="flex flex-wrap items-center gap-x-2 text-table">
                    {detail.supplierInvoice || detail.docType ? (
                      <span className="font-medium text-ink">
                        {[detail.docType ? DOC_TYPE_LABELS[detail.docType] : null, detail.supplierInvoice].filter(Boolean).join(' ')}
                        {detail.docIssueDate && <span className="font-normal text-ink-muted"> · emitido {formatDate(detail.docIssueDate)}</span>}
                        {detail.supplier.taxId && <span className="font-normal text-ink-muted"> · RUC {detail.supplier.taxId}</span>}
                      </span>
                    ) : <span className="text-ink-muted">Sin registrar</span>}
                    {!detail.voidedAt && (
                      <button type="button" className="text-meta font-medium text-brand hover:underline" onClick={() => setEditingDoc(true)}>
                        {detail.supplierInvoice || detail.docType ? 'Corregir' : 'Agregar'}
                      </button>
                    )}
                  </div>
                  {detail.receivedDate && <span className="text-meta text-ink-muted">Mercadería recibida el {formatDate(detail.receivedDate)}</span>}
                  {detail.notes && <span className="text-meta text-ink-muted">Notas: {detail.notes}</span>}
                </div>

                {['RECEIVED', 'PARTIALLY_RECEIVED'].includes(detail.status) && (
                  <div className="flex flex-col gap-2 rounded-srf bg-surface p-3 shadow-[0_0_0_1px_hsl(var(--line))]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={sub}>Pagos al proveedor</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={PAYMENT_STATUS_TONE[detail.paymentStatus] ?? 'neutral'}>
                          {PAYMENT_STATUS_LABELS[detail.paymentStatus] ?? detail.paymentStatus}
                        </StatusBadge>
                        <span className="text-meta tabular-nums text-ink-muted">
                          Pagado {formatCurrency(detail.paidAmount)} de {formatCurrency(detail.totalAmount)}
                          {detail.dueDate && <> · vence {formatDate(detail.dueDate)}</>}
                        </span>
                      </div>
                    </div>
                    {detail.payerAmount > 0 && (
                      <p className="text-meta text-ink-muted">{formatCurrency(detail.payerAmount)} lo financió un pagador (no salió de Caja General).</p>
                    )}
                    {Number(detail.creditedAmount) > 0 && (
                      <p className="text-meta text-ink-muted">{formatCurrency(detail.creditedAmount)} descontado con notas de crédito del proveedor.</p>
                    )}
                    {detail.payments.length > 0 && (
                      <div className="flex flex-col divide-y divide-line">
                        {detail.payments.map(p => (
                          <div key={p.id} className={cn('py-1.5 text-meta', p.reversedAt ? 'text-bad-ink' : 'text-ink-muted')}>
                            <div className="flex justify-between gap-3">
                              <span className={cn(p.reversedAt && 'line-through')}>
                                {formatDateTime(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}
                              </span>
                              <span className={cn('font-medium tabular-nums', p.reversedAt ? 'line-through' : 'text-ink')}>{formatCurrency(p.amount)}</span>
                            </div>
                            {p.reversedAt && (
                              <p>
                                Revertido{p.reversedBy ? ` por ${p.reversedBy.firstName} ${p.reversedBy.lastName}` : ''}
                                {p.reversalReason ? `: "${p.reversalReason}"` : ''}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {detail.paymentStatus !== 'PAID' && (
                        <Btn size="sm" variant="primary" onClick={() => setShowPay(true)}>Registrar pago</Btn>
                      )}
                      {detail.paymentStatus !== 'CREDIT' && !detail.voidedAt && (
                        <Btn size="sm" onClick={handleRevertPayment} loading={revertPaymentMutation.isPending}>
                          <Undo2 />Revertir pago (era a crédito)
                        </Btn>
                      )}
                      {!detail.voidedAt && (
                        <Btn size="sm" onClick={() => handleDiscrepancy(!detail.hasDiscrepancy)} loading={discrepancyMutation.isPending}>
                          {detail.hasDiscrepancy ? 'Quitar observación' : 'Marcar como observada'}
                        </Btn>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {detail.hasDiscrepancy && (
                <div className="flex flex-col gap-0.5 rounded-srf bg-surface p-3 text-meta shadow-[inset_3px_0_0_hsl(var(--bad)),0_0_0_1px_hsl(var(--line))]">
                  <p className="font-medium text-ink">Observada: no entra a los pagos "por monto" hasta resolverse.</p>
                  {detail.discrepancyNotes && <p className="text-ink-muted">{detail.discrepancyNotes}</p>}
                </div>
              )}

              <SupplierReturnsList returns={detail.supplierReturns ?? []} orderId={detail.id} />

              {detail.voidedAt && (
                <div className="flex flex-col gap-0.5 rounded-srf bg-surface p-3 text-meta shadow-[inset_3px_0_0_hsl(var(--bad)),0_0_0_1px_hsl(var(--line))]">
                  <p className="font-medium text-ink">Anulada el {formatDateTime(detail.voidedAt)}{detail.voidedBy ? ` por ${detail.voidedBy.firstName} ${detail.voidedBy.lastName}` : ''}</p>
                  {detail.voidReason && <p className="text-ink-muted">Motivo: {detail.voidReason}</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Btn size="sm" onClick={() => printPurchaseReceipt(detail)}><Printer />Imprimir comprobante</Btn>
                {!detail.voidedAt && ['RECEIVED', 'PARTIALLY_RECEIVED'].includes(detail.status) && (
                  <Btn size="sm" onClick={() => setShowReturn(true)}><Undo2 />Devolver al proveedor</Btn>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {editingDoc && detail && <EditDocumentModal order={detail} onClose={() => setEditingDoc(false)} />}
      {showReturn && detail && (
        <SupplierReturnModal orderId={detail.id} supplierName={detail.supplier.businessName} onClose={() => setShowReturn(false)} />
      )}

      {showPay && detail && (
        <PayPurchaseModal order={detail} onClose={() => setShowPay(false)} onPaid={() => setShowPay(false)} />
      )}

      {showReceive && detail && (
        <ReceiveOrderModal
          order={detail}
          onClose={() => setShowReceive(false)}
          onReceived={() => setShowReceive(false)}
        />
      )}

      {correctingItem && (
        <CorrectItemModal
          order={order}
          item={correctingItem}
          onClose={() => setCorrectingItem(null)}
          onCorrected={() => setCorrectingItem(null)}
        />
      )}

      {editingItem && (
        <EditOrderItemModal
          order={order}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onEdited={() => setEditingItem(null)}
        />
      )}
    </>
  );
}

/* ─── Suppliers Tab ─────────────────────────────────────────────────────── */
