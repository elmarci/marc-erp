// Piezas del formulario "Registrar compra": línea de producto, catálogo del
// proveedor y manejo del foco con el lector de código de barras.
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Field, Segmented, StatusBadge, fieldCls, invalidCls } from '@/components/erp';
import { cn, formatCurrency } from '@/lib/utils';
import { SupplierCatalogItem } from './types';

export interface DirectLine {
  productId: string; name: string; isBulk: boolean; bulkUnit: string | null;
  isBonus: boolean; quantity: string; unitCost: string;
  useBulkEntry: boolean; sacks: string; weightPerSack: string; totalCost: string;
  trackExpiry: boolean; batchNumber: string; expiryDate: string;
}

/* ─── Catálogo del proveedor (opcional, colapsado) ─────────────────────── */
// Antes se mostraba completo encima del formulario y, con proveedores de
// 100+ productos, había que bajar mucho para llegar a "Agregar productos".
// Ahora es un acceso plegado: se abre solo si se quiere consultar.
export function SupplierCatalogPicker({ catalog, onPick }: {
  catalog: SupplierCatalogItem[];
  onPick: (item: SupplierCatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  if (catalog.length === 0) return null;
  const q = filter.trim().toLowerCase();
  const shown = q ? catalog.filter(c => c.product.name.toLowerCase().includes(q)) : catalog;
  return (
    <div className="rounded-srf border">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-body hover:bg-ink/[0.03] rounded-srf">
        <span className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4 text-ink-muted" />
          {open ? 'Ocultar catálogo del proveedor' : 'Ver catálogo del proveedor'}
          <span className="text-meta font-normal text-ink-muted">({catalog.length})</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
      </button>
      {open && (
        <div className="border-t p-3 space-y-2">
          {catalog.length > 12 && (
            <Input placeholder="Filtrar catálogo..." value={filter} onChange={e => setFilter(e.target.value)} className="h-8" />
          )}
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {shown.map(c => (
              <button key={c.productId} type="button" onClick={() => onPick(c)}
                className="rounded-full border px-3 py-1 text-meta hover:border-brand hover:bg-brand/5 transition-colors">
                {c.product.name} · S/ {c.price.toFixed(2)}
              </button>
            ))}
            {shown.length === 0 && <p className="text-meta text-ink-muted">Sin coincidencias.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Lleva el foco al campo "Cantidad" de la línea recién agregada (que queda
// arriba de la lista). Enter en Cantidad pasa a Costo y Enter en Costo
// vuelve al buscador, listo para escanear el siguiente producto.
export function useLineFocus() {
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const costRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusId, setFocusId] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const el = qtyRefs.current[focusId.id];
    if (el) { el.focus(); el.select(); }
  }, [focusId]);
  const focusLine = (id: string) => setFocusId({ id });
  const onQtyEnter = (id: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const cost = costRefs.current[id];
    if (cost && !cost.disabled) { cost.focus(); cost.select(); } else searchRef.current?.focus();
  };
  const onCostEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    searchRef.current?.focus();
  };
  return { searchRef, qtyRefs, costRefs, focusLine, onQtyEnter, onCostEnter };
}

export function DirectLineRow({ line: l, includeTax, qty, unitCost, onChange, onRemove, qtyRef, costRef, onQtyKeyDown, onCostKeyDown }: {
  line: DirectLine; includeTax: boolean; qty: number; unitCost: number;
  onChange: (patch: Partial<DirectLine>) => void; onRemove: () => void;
  qtyRef: (el: HTMLInputElement | null) => void; costRef: (el: HTMLInputElement | null) => void;
  onQtyKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void; onCostKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={cn('flex flex-col gap-2 px-3 py-2.5', l.isBonus && 'bg-ok/[0.06]')}>
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{l.name}</span>
      {l.isBulk && <StatusBadge tone="neutral">Granel · {l.bulkUnit}</StatusBadge>}
      <Segmented size="sm" ariaLabel={`Tipo de línea de ${l.name}`} value={l.isBonus ? 'bonus' : 'buy'}
        onChange={v => onChange({ isBonus: v === 'bonus' })}
        options={[['buy', 'Compra'], ['bonus', 'Bonificación']]} />
      <button type="button" aria-label={`Quitar ${l.name}`} onClick={onRemove}
        className="tap grid size-8 shrink-0 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink">
        <X className="size-4" />
      </button>
    </div>

    {l.isBulk && (
      <button type="button" onClick={() => onChange({ useBulkEntry: !l.useBulkEntry })}
        className="w-fit text-meta font-medium text-brand hover:underline">
        {l.useBulkEntry ? 'Escribir la cantidad directamente' : 'Escribir por número de sacos o bultos'}
      </button>
    )}

    {l.useBulkEntry ? (
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
        <Field label="N° de sacos">
          <input ref={qtyRef} type="number" min={0} className={fieldCls}
            value={l.sacks} onChange={e => onChange({ sacks: e.target.value })} />
        </Field>
        <Field label={`Peso por saco (${l.bulkUnit})`}>
          <input type="number" min={0} step={0.01} className={fieldCls}
            value={l.weightPerSack} onChange={e => onChange({ weightPerSack: e.target.value })} />
        </Field>
        <Field label={l.isBonus ? 'Costo del lote (no aplica)' : 'Costo total del lote'}>
          <MoneyInput size="sm" min={0} value={l.totalCost} disabled={l.isBonus}
            onChange={e => onChange({ totalCost: e.target.value })} />
        </Field>
        <div className="pb-2 text-meta tabular-nums text-ink-muted">
          = {qty.toLocaleString('es-PE', { maximumFractionDigits: 3 })} {l.bulkUnit} · S/ {unitCost.toFixed(4)} c/u
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[140px_160px_1fr]">
        <Field label={`Cantidad${l.isBulk ? ` (${l.bulkUnit})` : ''}`}>
          <input ref={qtyRef} type="number" min={0} step={l.isBulk ? 0.01 : 1}
            className={fieldCls} value={l.quantity}
            onKeyDown={onQtyKeyDown}
            onChange={e => onChange({ quantity: e.target.value })} />
        </Field>
        <Field label={includeTax ? 'Costo unitario con IGV' : 'Costo unitario'}>
          <MoneyInput ref={costRef} size="sm" min={0} value={l.isBonus ? '0' : l.unitCost} disabled={l.isBonus}
            onKeyDown={onCostKeyDown}
            onChange={e => onChange({ unitCost: e.target.value })} />
        </Field>
        <div className="pb-2 text-right text-body font-semibold tabular-nums text-ink">
          {l.isBonus ? <span className="text-ok-ink">Gratis</span> : formatCurrency(qty * unitCost)}
        </div>
      </div>
    )}

    {l.trackExpiry && (
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[180px_1fr]">
        <Field label="Vence" required error={!l.expiryDate ? 'Obligatorio' : undefined}>
          <input type="date" value={l.expiryDate} onChange={e => onChange({ expiryDate: e.target.value })}
            className={cn(fieldCls, !l.expiryDate && invalidCls)} />
        </Field>
        <Field label="N° de lote">
          <input value={l.batchNumber} placeholder="Opcional" className={fieldCls}
            onChange={e => onChange({ batchNumber: e.target.value })} />
        </Field>
      </div>
    )}
  </div>
  );
}
