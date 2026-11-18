// Movimientos de inventario: filtro por tipo y rango de fechas (guardados en
// la dirección) con paginación.
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { EmptyState, FilterBar, Pagination, Panel, StatusBadge, fieldCls, tableCls, tdCls, thCls, useUrlFilters } from '@/components/erp';
import { api } from '@/services/api';
import { cn, formatCost, formatDateTime } from '@/lib/utils';
import { MOV_LABELS, isEntry, type Movement } from './types';

const FILTROS = { tipo: '', desde: '', hasta: '', p: '1' };
const PAGE_SIZE = 50;
const dateCls = cn(fieldCls, 'h-8 w-auto');

export function MovementsTab() {
  const [f, setF, clear] = useUrlFilters(FILTROS);
  const page = Math.max(1, Number(f.p) || 1);

  const { data, isLoading } = useQuery({
    queryKey: ['inv-movements', f.tipo, f.desde, f.hasta, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (f.tipo) params.set('type', f.tipo);
      if (f.desde) params.set('from', f.desde);
      if (f.hasta) params.set('to', f.hasta);
      return (await api.get<{ data: Movement[]; pagination: { total: number; totalPages: number } }>(`/inventory/movements?${params}`)).data;
    },
  });
  const rows = data?.data ?? [];

  return (
    <Panel title="Movimientos" meta={data ? `${data.pagination.total.toLocaleString('es-PE')} en total` : undefined}>
      <FilterBar
        quick={<>
          <select aria-label="Tipo de movimiento" className={cn(fieldCls, 'h-8 w-auto min-w-[170px]')} value={f.tipo} onChange={(e) => setF({ tipo: e.target.value, p: '1' })}>
            <option value="">Todos los tipos</option>
            {Object.entries(MOV_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-meta text-ink-muted">Desde
            <input type="date" aria-label="Desde" className={dateCls} value={f.desde} onChange={(e) => setF({ desde: e.target.value, p: '1' })} />
          </label>
          <label className="flex items-center gap-1.5 text-meta text-ink-muted">hasta
            <input type="date" aria-label="Hasta" className={dateCls} value={f.hasta} onChange={(e) => setF({ hasta: e.target.value, p: '1' })} />
          </label>
        </>}
        chips={[
          ...(f.tipo ? [{ key: 'tipo', label: 'Tipo', value: MOV_LABELS[f.tipo] ?? f.tipo, onRemove: () => setF({ tipo: '', p: '1' }) }] : []),
          ...(f.desde ? [{ key: 'desde', label: 'Desde', value: f.desde, onRemove: () => setF({ desde: '', p: '1' }) }] : []),
          ...(f.hasta ? [{ key: 'hasta', label: 'Hasta', value: f.hasta, onRemove: () => setF({ hasta: '', p: '1' }) }] : []),
        ]}
        onClear={clear}
      />

      {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
        : rows.length === 0 ? <EmptyState icon={History} title="No hay movimientos con estos filtros" /> : (
        <div className="mt-2 overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <th className={thCls}>Fecha</th>
              <th className={thCls}>Producto</th>
              <th className={thCls}>Tipo</th>
              <th className={cn(thCls, 'text-right')}>Cantidad</th>
              <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Antes</th>
              <th className={cn(thCls, 'text-right')}>Después</th>
              <th className={cn(thCls, 'hidden text-right md:table-cell')}>Costo unit.</th>
              <th className={cn(thCls, 'hidden lg:table-cell')}>Referencia</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => {
                const entry = isEntry(m.type);
                return (
                  <tr key={m.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'whitespace-nowrap text-meta text-ink-muted')}>{formatDateTime(m.createdAt)}</td>
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div className="font-medium">{m.product.name}</div>
                      {m.product.barcode && <div className="font-mono text-meta text-ink-muted">{m.product.barcode}</div>}
                    </td>
                    <td className={tdCls}><StatusBadge tone={entry ? 'ok' : 'neutral'}>{MOV_LABELS[m.type] ?? m.type}</StatusBadge></td>
                    <td className={cn(tdCls, 'text-right font-semibold tabular-nums', !entry && 'text-bad-ink')}>{entry ? '+' : '−'}{m.quantity}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums text-ink-muted sm:table-cell')}>{m.quantityBefore}</td>
                    <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{m.quantityAfter}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums md:table-cell')}>{m.unitCost ? formatCost(m.unitCost) : '—'}</td>
                    <td className={cn(tdCls, 'hidden max-w-[240px] truncate text-meta text-ink-muted lg:table-cell')} title={m.notes ?? undefined}>{m.notes ?? m.referenceType ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pagination.totalPages > 1 && (
        <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPage={(n) => setF({ p: String(n) })} />
      )}
    </Panel>
  );
}
