// Ajustes: ventas hechas sin stock registrado (ajuste automático) y el
// historial de ajustes con su detalle por producto.
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ClipboardList, Plus } from 'lucide-react';
import { Btn, EmptyState, Pagination, Panel, Segmented, tableCls, tdCls, thCls } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatDateTime } from '@/lib/utils';
import { adjustmentReasonLabel } from './adjustmentReasons';
import { BulkAdjustModal } from './AdjustModals';
import { signedQty, type Adjustment } from './types';

const PAGE_SIZE = 20;

interface AutoAdjustData {
  days: number; totalTimes: number; totalUnits: number;
  byProduct: Array<{ productId: string; productName: string; times: number; units: number }>;
  entries: Array<{
    id: string; createdAt: string; productId: string; productName: string; barcode: string | null;
    quantity: number; stockBefore: number; unitCost: number | null; userName: string | null; saleNumber: string | null;
  }>;
}

// Ventas hechas con "vender aunque el sistema diga sin stock": cada una dejó un
// ajuste automático. Ver qué productos se repiten y quién lo hace ayuda a
// corregir el hábito de comprar sin registrar la compra.
function AutoAdjustPanel() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['inv-auto-adjust', Number(days)],
    queryFn: async () => (await api.get<{ data: AutoAdjustData }>(`/inventory/auto-adjustments?days=${days}`)).data.data,
    refetchInterval: 60000,
  });
  if (!data) return null;

  return (
    <Panel title="Ventas sin stock registrado"
      meta={data.totalTimes > 0 ? `${data.totalTimes} ajuste(s) · ${data.totalUnits} unidad(es) repuestas` : undefined}
      actions={<Segmented value={days} onChange={setDays} ariaLabel="Periodo"
        options={[['7', '7 días'], ['30', '30 días'], ['90', '90 días']]} />}
      bodyClassName="p-0">
      <p className="px-4 pt-3 text-table text-ink-muted">
        Se vendió mercadería que el sistema daba por agotada y el inventario se ajustó solo. Si un producto se repite,
        casi seguro falta registrar sus compras.
      </p>
      {data.totalTimes === 0 ? (
        <p className="px-4 py-6 text-center text-table text-ink-muted">Ninguna en los últimos {days} días.</p>
      ) : (
        <div className="flex flex-col gap-2 pb-2 pt-2">
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Producto</th>
                <th className={cn(thCls, 'text-right')}>Veces</th>
                <th className={cn(thCls, 'text-right')}>Unidades</th>
              </tr></thead>
              <tbody>
                {data.byProduct.slice(0, 10).map((r) => (
                  <tr key={r.productId}>
                    <td className={tdCls}>{r.productName}</td>
                    <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{r.times}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums')}>{r.units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3">
            <Btn size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp /> : <ChevronDown />}{open ? 'Ocultar detalle' : 'Ver detalle por venta y cajero'}
            </Btn>
          </div>
          {open && (
            <div className="overflow-x-auto border-t border-line">
              <table className={tableCls}>
                <thead><tr>
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Producto</th>
                  <th className={cn(thCls, 'text-right')}>Repuesto</th>
                  <th className={thCls}>Cajero</th>
                  <th className={thCls}>Venta</th>
                </tr></thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className={cn(tdCls, 'whitespace-nowrap text-meta text-ink-muted')}>{formatDateTime(e.createdAt)}</td>
                      <td className={tdCls}>{e.productName}</td>
                      <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>+{e.quantity}</td>
                      <td className={tdCls}>{e.userName ?? '—'}</td>
                      <td className={cn(tdCls, 'text-ink-muted')}>{e.saleNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function AdjustmentsTab() {
  const [page, setPage] = useState(1);
  const [showBulk, setShowBulk] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inv-adjustments', page],
    queryFn: async () => (await api.get<{ data: Adjustment[]; pagination: { total: number; totalPages: number } }>(`/inventory/adjustments?page=${page}&limit=${PAGE_SIZE}`)).data,
  });
  const rows = data?.data ?? [];
  const toggle = (id: string) => setExpanded(expanded === id ? null : id);

  return (
    <div className="flex flex-col gap-5">
      <AutoAdjustPanel />
      <Panel title="Ajustes registrados" meta={data ? `${data.pagination.total} en total` : undefined}
        actions={<Btn size="sm" variant="primary" onClick={() => setShowBulk(true)}><Plus />Nuevo ajuste masivo</Btn>}>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : rows.length === 0 ? <EmptyState icon={ClipboardList} title="No hay ajustes registrados" /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Motivo</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Realizado por</th>
                <th className={cn(thCls, 'text-right')}>Productos</th>
                <th className={cn(thCls, 'w-10')}><span className="sr-only">Detalle</span></th>
              </tr></thead>
              <tbody>
                {rows.map((adj) => (
                  <Fragment key={adj.id}>
                    <tr tabIndex={0} aria-expanded={expanded === adj.id} className="cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      onClick={() => toggle(adj.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(adj.id); } }}>
                      <td className={cn(tdCls, 'whitespace-nowrap text-meta text-ink-muted')}>{formatDateTime(adj.createdAt)}</td>
                      <td className={tdCls}>
                        <span className="font-medium">{adjustmentReasonLabel(adj.reasonCode)}</span>
                        {adj.reason && adj.reason !== adjustmentReasonLabel(adj.reasonCode) && <span className="text-ink-muted"> · {adj.reason}</span>}
                      </td>
                      <td className={cn(tdCls, 'hidden md:table-cell')}>{adj.user.firstName} {adj.user.lastName}</td>
                      <td className={cn(tdCls, 'text-right tabular-nums')}>{adj._count.items}</td>
                      <td className={cn(tdCls, 'text-ink-muted')}>{expanded === adj.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</td>
                    </tr>
                    {expanded === adj.id && (
                      <tr>
                        <td colSpan={5} className="border-b border-line bg-surface-2 px-4 py-3">
                          <table className="w-full text-table">
                            <thead><tr className="text-meta text-ink-muted">
                              <th className="py-1 text-left font-medium">Producto</th>
                              <th className="py-1 text-right font-medium">Sistema</th>
                              <th className="py-1 text-right font-medium">Físico</th>
                              <th className="py-1 text-right font-medium">Diferencia</th>
                            </tr></thead>
                            <tbody>
                              {adj.items.map((item) => (
                                <tr key={item.productId}>
                                  <td className="py-1">{item.productName}</td>
                                  <td className="py-1 text-right tabular-nums">{item.systemQuantity}</td>
                                  <td className="py-1 text-right tabular-nums">{item.physicalQuantity}</td>
                                  <td className={cn('py-1 text-right font-semibold tabular-nums',
                                    item.difference === 0 ? 'text-ink-muted' : item.difference < 0 && 'text-bad-ink')}>{signedQty(item.difference)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPage={setPage} />
        )}
      </Panel>
      {showBulk && <BulkAdjustModal onClose={() => setShowBulk(false)} />}
    </div>
  );
}
