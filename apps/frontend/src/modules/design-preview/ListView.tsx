// Plantilla de lista armada con los componentes de @/components/erp.
import { useMemo } from 'react';
import {
  Download, FileText, Pencil, Plus, Printer, Send, Sparkles, Truck, Undo2, Wallet, XCircle,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Btn, ColumnsMenu, DataTable, FilterBar, PageHeader, PageTabs, Panel, Pagination, Segmented, StatCard, StatGrid,
  StatusBadge, fieldCls, useColumnVisibility, useUrlFilters, type Column, type Tone,
} from '@/components/erp';
import { compras, proveedores, serieCompras, seriePorPagar, type CompraDemo, type Estado } from './data';

export type TableState = 'datos' | 'cargando' | 'vacio' | 'error';

const estadoInfo: Record<Estado, [string, Tone]> = {
  pagada: ['Pagada', 'ok'], por_pagar: ['Por pagar', 'warn'], parcial: ['Pago parcial', 'warn'],
  vencida: ['Vencida', 'bad'], anulada: ['Anulada', 'muted'],
};

const FILTROS = { q: '', estado: 'todas', prov: '', mes: '2026-11', comp: 'con', tab: 'orders' };

const columns: Column<CompraDemo>[] = [
  { key: 'numero', header: 'Número', hideable: false, sortValue: (r) => r.numero,
    cell: (r) => <span className={r.estado === 'anulada' ? 'font-medium tabular-nums text-ink-muted line-through' : 'font-medium tabular-nums'}>{r.numero}</span> },
  { key: 'fecha', header: 'Fecha', hideBelow: 'md', sortValue: (r) => r.fecha,
    cell: (r) => <span className="tabular-nums">{formatDate(r.fecha + 'T12:00:00-05:00')}</span> },
  { key: 'proveedor', header: 'Proveedor', sortValue: (r) => r.proveedor, cell: (r) => r.proveedor, truncate: (r) => r.proveedor },
  { key: 'comprobante', header: 'Comprobante', hideBelow: 'md', cell: (r) => <span className="tabular-nums">{r.comprobante}</span> },
  { key: 'items', header: 'Productos', numeric: true, hideBelow: 'lg', sortValue: (r) => r.items, cell: (r) => r.items },
  { key: 'estado', header: 'Estado', sortValue: (r) => r.estado,
    cell: (r) => <StatusBadge tone={estadoInfo[r.estado][1]}>{estadoInfo[r.estado][0]}</StatusBadge> },
  { key: 'total', header: 'Total', numeric: true, sortValue: (r) => r.total, cell: (r) => formatCurrency(r.total) },
  { key: 'saldo', header: 'Saldo', numeric: true, hideBelow: 'md', sortValue: (r) => r.saldo,
    cell: (r) => r.saldo ? <span className="font-medium">{formatCurrency(r.saldo)}</span> : <span className="text-ink-muted">—</span> },
];

export function ListView({ tableState, onNew, onVoid }: {
  tableState: TableState; onNew: () => void; onVoid: (c: CompraDemo) => void;
}) {
  const [f, setF, clearF] = useUrlFilters(FILTROS);
  const [hidden, toggleCol] = useColumnVisibility('preview-compras');

  const rows = useMemo(() => compras.filter((c) =>
    (f.estado === 'todas' || c.estado === f.estado) &&
    (!f.prov || c.proveedor === f.prov) &&
    (!f.mes || c.fecha.startsWith(f.mes)) &&
    (!f.q || (c.proveedor + c.numero + c.comprobante).toLowerCase().includes(f.q.toLowerCase())),
  ), [f]);

  const chips = [
    f.prov && { key: 'prov', label: 'Proveedor', value: f.prov, onRemove: () => setF({ prov: '' }) },
    f.mes && { key: 'mes', label: 'Mes', value: f.mes === '2026-11' ? 'Noviembre 2026' : 'Octubre 2026', onRemove: () => setF({ mes: '' }) },
    f.comp && { key: 'comp', label: 'Comprobante', value: f.comp === 'con' ? 'Factura o boleta' : 'Sin comprobante', onRemove: () => setF({ comp: '' }) },
  ].filter(Boolean) as { key: string; label: string; value: string; onRemove: () => void }[];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Compras"
        actions={<>
          <Btn className="hidden sm:inline-flex"><Sparkles />Sugerir pedido</Btn>
          <Btn><Send />Nueva orden</Btn>
          <Btn variant="primary" onClick={onNew}><Plus />Registrar compra</Btn>
        </>}
      />
      <PageTabs value={f.tab} onChange={(tab) => setF({ tab })} tabs={[
        ['orders', 'Órdenes de compra'], ['payable', 'Cuentas por pagar', 'S/ 4,945'], ['settlements', 'Liquidaciones'], ['payers', 'Pagadores'], ['suppliers', 'Proveedores'],
      ]} />

      <StatGrid>
        <StatCard label="Comprado en noviembre" value="S/ 10,936.35" delta={12.4} compare="vs. octubre a la fecha" goodWhenUp={false} series={serieCompras} />
        <StatCard label="Por pagar" value="S/ 4,945.70" delta={8.1} compare="vs. hace 7 días" goodWhenUp={false} series={seriePorPagar} />
        <StatCard label="Vencido" value="S/ 2,310.50" delta={-22} compare="vs. hace 7 días" goodWhenUp={false} />
        <StatCard label="Compras registradas" value="38" delta={5.6} compare="vs. octubre a la fecha" />
      </StatGrid>

      <Panel title="Órdenes de compra" meta="38 en noviembre" actions={<Btn size="sm" variant="ghost"><Download />Exportar Excel</Btn>}>
        <FilterBar
          search={{ value: f.q, onChange: (q) => setF({ q }), placeholder: 'Proveedor, número o comprobante' }}
          quick={<Segmented ariaLabel="Estado" value={f.estado} onChange={(estado) => setF({ estado })}
            options={[['todas', 'Todas'], ['por_pagar', 'Por pagar'], ['vencida', 'Vencidas'], ['pagada', 'Pagadas'], ['anulada', 'Anuladas']]}
            className="sm:flex-none" />}
          advancedCount={[f.prov, f.mes, f.comp].filter(Boolean).length}
          advanced={<>
            <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Proveedor
              <select className={fieldCls} value={f.prov} onChange={(e) => setF({ prov: e.target.value })}>
                <option value="">Todos</option>{proveedores.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Mes
              <select className={fieldCls} value={f.mes} onChange={(e) => setF({ mes: e.target.value })}>
                <option value="">Todos</option><option value="2026-11">Noviembre 2026</option><option value="2026-10">Octubre 2026</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-table font-medium text-ink">Comprobante
              <select className={fieldCls} value={f.comp} onChange={(e) => setF({ comp: e.target.value })}>
                <option value="">Cualquiera</option><option value="con">Factura o boleta</option><option value="sin">Sin comprobante</option>
              </select>
            </label>
          </>}
          chips={chips}
          onClear={() => clearF(['tab'])}
          resultCount={tableState === 'datos' ? rows.length : null}
          trailing={<ColumnsMenu columns={columns} hidden={hidden} onToggle={toggleCol} />}
        />
        <DataTable
          rows={tableState === 'vacio' ? [] : tableState === 'cargando' ? undefined : rows}
          loading={tableState === 'cargando'}
          error={tableState === 'error' ? true : undefined}
          onRetry={() => {}}
          columns={columns}
          hiddenColumns={hidden}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.numero}
          defaultSort={{ key: 'fecha', dir: 'desc' }}
          selectable
          bulkActions={() => <>
            <Btn size="sm" variant="ghost" className="hover:bg-white/10"><Wallet />Registrar pago</Btn>
            <Btn size="sm" variant="ghost" className="hover:bg-white/10"><Download />Exportar</Btn>
          </>}
          rowActions={(r) => [
            { label: 'Ver detalle', icon: FileText, onSelect: () => {} },
            { label: 'Recibir mercadería', icon: Truck, onSelect: () => {} },
            { label: 'Registrar pago', icon: Wallet, onSelect: () => {}, disabled: !r.saldo },
            { label: 'Devolución al proveedor', icon: Undo2, onSelect: () => {} },
            { label: 'Editar comprobante', icon: Pencil, onSelect: () => {} },
            { label: 'Imprimir', icon: Printer, onSelect: () => {} },
            { label: 'Anular compra', icon: XCircle, onSelect: () => onVoid(r), danger: true, separated: true, disabled: r.estado === 'anulada' },
          ]}
          empty={{ title: 'No hay compras con estos filtros', action: <Btn size="sm" onClick={() => clearF(['tab'])}>Limpiar filtros</Btn> }}
          mobileRow={(r) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium text-ink">{r.proveedor}</div>
                <div className="text-meta tabular-nums text-ink-muted">{r.numero} · {formatDate(r.fecha + 'T12:00:00-05:00')}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-body font-medium tabular-nums text-ink">{formatCurrency(r.total)}</span>
                <StatusBadge tone={estadoInfo[r.estado][1]}>{estadoInfo[r.estado][0]}</StatusBadge>
              </div>
            </div>
          )}
          maxHeight={520}
          footer={<Pagination page={1} totalPages={4} total={38} pageSize={10} onPage={() => {}} />}
        />
      </Panel>
    </div>
  );
}
