import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, PackageCheck, Printer, Sparkles, FileSpreadsheet } from 'lucide-react';
import { api } from '@/services/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';
import {
  Btn, Check, EmptyState, Field, FilterBar, Modal, Pagination, Panel, Segmented, fieldCls, tableCls, tdCls, thCls,
  useUrlFilters, type FilterChip,
} from '@/components/erp';
import { NewOrderModal } from './NewOrderModal';
import { OrderRow } from './OrderRow';
import { RegisterPurchaseModal } from './RegisterPurchaseModal';
import { SuggestOrderModal } from './SuggestOrderModal';
import { printPurchaseReceipt } from './printing';
import { OrderDetail, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PurchaseOrder, STATUS_LABELS } from './types';

export const METHOD_USED_LABELS: Record<string, string> = {
  ...PAYMENT_METHOD_LABELS,
  CREDITO_PAGADOR: 'Crédito de pagador', MIXTO: 'Mixto', SIN_PAGO: 'Sin pago',
};

// Filtros de la lista: viven en el enlace (se pueden compartir y sobreviven a recargar).
const FILTROS = {
  q: '', est: '', pago: '', metodo: '', pend: '', desde: '', hasta: '', vdesde: '', vhasta: '', orden: 'createdAt:desc', p: '1',
};

export function OrdersTab() {
  const [f, setF, clearF] = useUrlFilters(FILTROS);
  const [showNew, setShowNew] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [justRegistered, setJustRegistered] = useState<OrderDetail | null>(null);
  const page = Math.max(1, Number(f.p) || 1);
  const [sortBy, sortOrder] = f.orden.split(':');
  // Cambiar un filtro vuelve a la página 1.
  const setFilter = (patch: Partial<typeof FILTROS>) => setF({ ...patch, p: '' });

  const queryString = () => {
    const params = new URLSearchParams({ limit: '20' });
    if (f.est) params.set('status', f.est);
    if (f.pago) params.set('paymentStatus', f.pago);
    if (f.metodo) params.set('methodUsed', f.metodo);
    if (f.pend) params.set('onlyPending', 'true');
    if (f.q) params.set('search', f.q);
    if (f.desde) params.set('dateFrom', f.desde);
    // El input type="date" da solo la fecha (medianoche) — sumamos el resto
    // del día para que "Hasta" incluya las compras registradas ese mismo día.
    if (f.hasta) params.set('dateTo', `${f.hasta}T23:59:59.999`);
    if (f.vdesde) params.set('dueFrom', f.vdesde);
    if (f.vhasta) params.set('dueTo', `${f.vhasta}T23:59:59.999`);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
    return params;
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', f.est, f.pago, f.metodo, f.pend, f.q, f.desde, f.hasta, f.vdesde, f.vhasta, f.orden, page],
    queryFn: async () => {
      const params = queryString();
      params.set('page', String(page));
      return (await api.get<{
        data: PurchaseOrder[];
        pagination: { total: number; totalPages: number };
        totals: { totalAmount: number; paidAmount: number };
      }>(`/purchases?${params}`)).data;
    },
  });

  const statusOptions = Object.entries(STATUS_LABELS).filter(([k]) => !['PENDING_APPROVAL', 'APPROVED'].includes(k));
  const dateLabel = (d: string) => formatDate(`${d}T12:00:00-05:00`);
  const chips: FilterChip[] = [
    f.est && { key: 'est', label: 'Estado', value: STATUS_LABELS[f.est] ?? f.est, onRemove: () => setFilter({ est: '' }) },
    f.metodo && { key: 'metodo', label: 'Método', value: METHOD_USED_LABELS[f.metodo] ?? f.metodo, onRemove: () => setFilter({ metodo: '' }) },
    f.pend && { key: 'pend', label: 'Saldo', value: 'Solo con saldo pendiente', onRemove: () => setFilter({ pend: '' }) },
    f.desde && { key: 'desde', label: 'Desde', value: dateLabel(f.desde), onRemove: () => setFilter({ desde: '' }) },
    f.hasta && { key: 'hasta', label: 'Hasta', value: dateLabel(f.hasta), onRemove: () => setFilter({ hasta: '' }) },
    f.vdesde && { key: 'vdesde', label: 'Vence desde', value: dateLabel(f.vdesde), onRemove: () => setFilter({ vdesde: '' }) },
    f.vhasta && { key: 'vhasta', label: 'Vence hasta', value: dateLabel(f.vhasta), onRemove: () => setFilter({ vhasta: '' }) },
  ].filter(Boolean) as FilterChip[];
  const hasFilters = chips.length > 0 || !!f.q || !!f.pago;
  const rows = data?.data ?? [];

  return (
    <>
      <Panel
        title="Órdenes de compra"
        meta={data ? `${data.pagination.total.toLocaleString('es-PE')} ${data.pagination.total === 1 ? 'orden' : 'órdenes'}` : undefined}
        actions={<>
          <Btn size="sm" variant="ghost" onClick={() => downloadExcel(`/purchases/export?${queryString()}`, 'compras.xlsx')}>
            <FileSpreadsheet />Exportar Excel
          </Btn>
          <Btn size="sm" onClick={() => setShowSuggest(true)}><Sparkles />Sugerir pedido</Btn>
          <Btn size="sm" onClick={() => setShowNew(true)}><Plus />Nueva orden</Btn>
          <Btn size="sm" variant="primary" onClick={() => setShowRegister(true)}><PackageCheck />Registrar compra</Btn>
        </>}
      >
        <FilterBar
          search={{ value: f.q, onChange: (q) => setFilter({ q }), placeholder: 'Orden, comprobante o proveedor' }}
          quick={<Segmented ariaLabel="Pago" value={f.pago} onChange={(pago) => setFilter({ pago })} className="sm:flex-none"
            options={[['', 'Todas'], ...Object.entries(PAYMENT_STATUS_LABELS)] as [string, string][]} />}
          advancedCount={chips.length}
          advanced={<>
            <Field label="Estado">
              <select className={fieldCls} value={f.est} onChange={e => setFilter({ est: e.target.value })}>
                <option value="">Todos los estados</option>
                {statusOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Método usado">
              <select className={fieldCls} value={f.metodo} onChange={e => setFilter({ metodo: e.target.value })}>
                <option value="">Cualquier método</option>
                {Object.entries(METHOD_USED_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha desde"><input type="date" className={fieldCls} value={f.desde} onChange={e => setFilter({ desde: e.target.value })} /></Field>
              <Field label="Fecha hasta"><input type="date" className={fieldCls} value={f.hasta} onChange={e => setFilter({ hasta: e.target.value })} /></Field>
              <Field label="Vence desde"><input type="date" className={fieldCls} value={f.vdesde} onChange={e => setFilter({ vdesde: e.target.value })} /></Field>
              <Field label="Vence hasta"><input type="date" className={fieldCls} value={f.vhasta} onChange={e => setFilter({ vhasta: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-table text-ink">
              <Check checked={!!f.pend} onChange={() => setFilter({ pend: f.pend ? '' : '1' })} label="Solo con saldo pendiente" />
              Solo con saldo pendiente
            </label>
          </>}
          chips={chips}
          onClear={() => clearF(['orden'])}
          trailing={
            <select className={cn(fieldCls, 'h-8 w-auto')} aria-label="Ordenar" value={f.orden} onChange={e => setF({ orden: e.target.value })}>
              <option value="createdAt:desc">Más recientes</option>
              <option value="createdAt:asc">Más antiguas</option>
              <option value="totalAmount:desc">Mayor total</option>
              <option value="totalAmount:asc">Menor total</option>
              <option value="orderNumber:desc">N° de orden (mayor)</option>
              <option value="orderNumber:asc">N° de orden (menor)</option>
            </select>
          }
        />

        {data && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-table">
            <span className="text-ink-muted">Total <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.totalAmount)}</span></span>
            <span className="text-ink-muted">Pagado <span className="font-medium tabular-nums text-ink">{formatCurrency(data.totals.paidAmount)}</span></span>
            <span className="text-ink-muted">Pendiente <span className={cn('font-medium tabular-nums', data.totals.totalAmount - data.totals.paidAmount > 0.009 ? 'text-bad-ink' : 'text-ink')}>{formatCurrency(data.totals.totalAmount - data.totals.paidAmount)}</span></span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>N° de orden</th>
                <th className={thCls}>Proveedor</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Pago</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Fecha</th>
                <th className={cn(thCls, 'text-right')}>Total</th>
                <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Ítems</th>
                <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className={cn(tdCls, j === 4 && 'hidden md:table-cell', j === 6 && 'hidden lg:table-cell')}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded bg-ink/[0.07]" />
                  </td>
                ))}</tr>
              ))}
              {!isLoading && rows.map(order => <OrderRow key={order.id} order={order} />)}
            </tbody>
          </table>
          {isError && (
            <EmptyState title="No se pudo cargar la lista." action={<Btn size="sm" onClick={() => refetch()}>Reintentar</Btn>} />
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <EmptyState title={hasFilters ? 'No hay órdenes con estos filtros' : 'Todavía no hay órdenes de compra'}
              action={hasFilters
                ? <Btn size="sm" onClick={() => clearF(['orden'])}>Limpiar filtros</Btn>
                : <Btn size="sm" variant="primary" onClick={() => setShowRegister(true)}><PackageCheck />Registrar compra</Btn>} />
          )}
        </div>
        {data && data.pagination.totalPages > 1 && (
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={20}
            onPage={(n) => setF({ p: n === 1 ? '' : String(n) })} />
        )}
      </Panel>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={() => setShowNew(false)} />}
      {showSuggest && <SuggestOrderModal onClose={() => setShowSuggest(false)} onCreated={() => setShowSuggest(false)} />}
      {showRegister && (
        <RegisterPurchaseModal
          onClose={() => setShowRegister(false)}
          onCreated={(order) => { setShowRegister(false); setJustRegistered(order); }}
        />
      )}

      <Modal open={!!justRegistered} onOpenChange={(v) => { if (!v) setJustRegistered(null); }} size="sm"
        title="Compra registrada"
        description={justRegistered ? `${justRegistered.orderNumber} · ${formatCurrency(justRegistered.totalAmount)}` : undefined}
        footer={<>
          <Btn onClick={() => setJustRegistered(null)}>Cerrar</Btn>
          <Btn variant="primary" onClick={() => justRegistered && printPurchaseReceipt(justRegistered)}><Printer />Imprimir</Btn>
        </>}
      >
        <p className="text-body text-ink-muted">El stock y el costo promedio ya están actualizados.</p>
      </Modal>
    </>
  );
}
