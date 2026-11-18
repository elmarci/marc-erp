// Stock actual: búsqueda, estado y categoría (guardados en la dirección),
// imprimir, exportar y acciones por producto.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, History, Package, Printer, Scale } from 'lucide-react';
import { Btn, EmptyState, FilterBar, Pagination, Panel, RowMenu, Segmented, StatusBadge, fieldCls, tableCls, tdCls, thCls, useUrlFilters } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCost, formatCurrency, formatDateTime } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CostHistoryModal, PriceComparisonModal, QuickAdjustModal } from './ProductModals';
import { STATUS_LABEL, STATUS_TONE, type Category, type StockProduct } from './types';

const FILTROS = { q: '', est: 'all', cat: '', p: '1' };
const PAGE_SIZE = 50;

function printStock(rowsData: StockProduct[]) {
  const rows = rowsData.map((p) =>
    `<tr style="border-bottom:1px solid #eee">
      <td style="padding:6px 8px">${p.name}</td>
      <td style="padding:6px 8px">${p.barcode ?? '—'}</td>
      <td style="padding:6px 8px">${p.category}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:bold;color:${p.stockStatus === 'out' ? '#dc2626' : p.stockStatus === 'low' ? '#d97706' : '#16a34a'}">${p.current_stock}</td>
      <td style="padding:6px 8px;text-align:center">${p.min_stock}</td>
      <td style="padding:6px 8px;text-align:right">S/ ${p.cost_price.toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:right">S/ ${p.stockValue.toFixed(2)}</td>
    </tr>`).join('');
  const win = window.open('', '_blank', 'width=900,height=600');
  if (!win) return;
  win.document.write(`<html><head><title>Reporte de Stock</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px;text-align:left}
    .header{display:flex;justify-content:space-between;margin-bottom:16px}</style></head><body>
    <div class="header"><h2 style="margin:0">Reporte de Stock — MARC</h2><span>${new Date().toLocaleString('es-PE')}</span></div>
    <table><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th>Stock actual</th><th>Mín.</th><th>Costo unit.</th><th>Valor total</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
  win.document.close(); win.focus(); win.print();
}

export function StockTab() {
  const [f, setF, clear] = useUrlFilters(FILTROS);
  const [search, setSearch] = useState(f.q);
  const debounced = useDebouncedValue(search, 300);
  if (debounced !== f.q) queueMicrotask(() => setF({ q: debounced, p: '1' }));
  const page = Math.max(1, Number(f.p) || 1);
  const [adjust, setAdjust] = useState<StockProduct | null>(null);
  const [compare, setCompare] = useState<StockProduct | null>(null);
  const [history, setHistory] = useState<StockProduct | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ data: Category[] }>('/categories')).data.data,
  });
  const queryParams = () => {
    const params = new URLSearchParams();
    if (f.q) params.set('search', f.q);
    if (f.est !== 'all') params.set('status', f.est);
    if (f.cat) params.set('categoryId', f.cat);
    return params;
  };
  const { data, isLoading } = useQuery({
    queryKey: ['inv-stock', f.q, f.est, f.cat, page],
    queryFn: async () => {
      const params = queryParams(); params.set('page', String(page)); params.set('limit', String(PAGE_SIZE));
      return (await api.get<{ data: StockProduct[]; pagination: { total: number; totalPages: number } }>(`/inventory/stock?${params}`)).data;
    },
  });
  const rows = data?.data ?? [];
  const catName = categories?.find((c) => c.id === f.cat)?.name;

  return (
    <Panel title="Stock actual" meta={data ? `${data.pagination.total.toLocaleString('es-PE')} productos` : undefined}
      actions={<>
        <Btn size="sm" variant="ghost" onClick={() => printStock(rows)}><Printer />Imprimir</Btn>
        <Btn size="sm" variant="ghost" onClick={() => downloadExcel(`/inventory/stock/export?${queryParams()}`, 'inventario.xlsx')}><FileSpreadsheet />Exportar Excel</Btn>
      </>}>
      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar producto o código' }}
        quick={<>
          <Segmented value={f.est} onChange={(v) => setF({ est: v, p: '1' })} ariaLabel="Estado"
            options={[['all', 'Todo'], ['ok', 'Normal'], ['low', 'Stock bajo'], ['out', 'Sin stock']]} />
          <select aria-label="Categoría" className={cn(fieldCls, 'h-8 w-auto min-w-[180px]')} value={f.cat} onChange={(e) => setF({ cat: e.target.value, p: '1' })}>
            <option value="">Todas las categorías</option>
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>}
        chips={[
          ...(f.q ? [{ key: 'q', label: 'Búsqueda', value: f.q, onRemove: () => { setSearch(''); setF({ q: '', p: '1' }); } }] : []),
          ...(catName ? [{ key: 'cat', label: 'Categoría', value: catName, onRemove: () => setF({ cat: '', p: '1' }) }] : []),
        ]}
        onClear={() => { setSearch(''); clear(); }}
      />

      {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
        : rows.length === 0 ? <EmptyState icon={Package} title="No se encontraron productos" /> : (
        <div className="mt-2 overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={thCls}>Producto</th>
              <th className={cn(thCls, 'hidden lg:table-cell')}>Código</th>
              <th className={cn(thCls, 'hidden md:table-cell')}>Categoría</th>
              <th className={cn(thCls, 'text-right')}>Stock</th>
              <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Mín.</th>
              <th className={thCls}>Estado</th>
              <th className={cn(thCls, 'hidden text-right md:table-cell')}>Costo</th>
              <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Valor total</th>
              <th className={cn(thCls, 'hidden text-right xl:table-cell')}>Últ. movimiento</th>
              <th className={cn(thCls, 'w-24')}><span className="sr-only">Acciones</span></th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2">
                  <td className={cn(tdCls, 'py-1.5')}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-meta text-ink-muted md:hidden">{p.category}</div>
                  </td>
                  <td className={cn(tdCls, 'hidden font-mono text-meta text-ink-muted lg:table-cell')}>{p.barcode ?? p.sku ?? '—'}</td>
                  <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{p.category}</td>
                  <td className={cn(tdCls, 'text-right font-semibold tabular-nums', p.stockStatus === 'out' && 'text-bad-ink')}>{p.current_stock}</td>
                  <td className={cn(tdCls, 'hidden text-right tabular-nums text-ink-muted sm:table-cell')}>{p.min_stock}</td>
                  <td className={tdCls}><StatusBadge tone={STATUS_TONE[p.stockStatus]}>{STATUS_LABEL[p.stockStatus]}</StatusBadge></td>
                  <td className={cn(tdCls, 'hidden text-right tabular-nums md:table-cell')}>{formatCost(p.cost_price)}</td>
                  <td className={cn(tdCls, 'hidden text-right font-medium tabular-nums sm:table-cell')}>{formatCurrency(p.stockValue)}</td>
                  <td className={cn(tdCls, 'hidden whitespace-nowrap text-right text-meta text-ink-muted xl:table-cell')}>{p.last_movement ? formatDateTime(p.last_movement) : '—'}</td>
                  <td className={cn(tdCls, 'px-1 text-right')}>
                    <div className="flex items-center justify-end gap-1">
                      <Btn size="sm" onClick={() => setAdjust(p)}>Ajustar</Btn>
                      <RowMenu label={`Acciones de ${p.name}`} actions={[
                        { label: 'Comparar precios entre proveedores', icon: Scale, onSelect: () => setCompare(p) },
                        { label: 'Historial de costos', icon: History, onSelect: () => setHistory(p) },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pagination.totalPages > 1 && (
        <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPage={(n) => setF({ p: String(n) })} />
      )}

      {adjust && <QuickAdjustModal product={adjust} onClose={() => setAdjust(null)} />}
      {compare && <PriceComparisonModal product={compare} onClose={() => setCompare(null)} />}
      {history && <CostHistoryModal product={history} onClose={() => setHistory(null)} />}
    </Panel>
  );
}
