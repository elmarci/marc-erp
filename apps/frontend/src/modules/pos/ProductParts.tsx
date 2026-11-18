// Piezas de la grilla del POS: ventana de granel (peso o monto), filtros,
// etiqueta de oferta, aviso de stock y botón "+".
import { useState } from 'react';
import { Scale, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BareDialog } from '@/components/erp';
import { formatCurrency, cn } from '@/lib/utils';
import type { PackInfo } from './packSale';

export interface Product extends PackInfo {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  currentStock: number;
  imageUrl: string | null;
  isBulk: boolean;
  bulkUnit: string | null;
  isFavorite?: boolean;
  bottleDeposit?: number;
  category: { name: string };
}

/* ─── Bulk weight modal ───────────────────────────────────────────────────── */
// Precisión de pesaje: 1 gramo (0.001 kg). Con pasos de 10g el peso
// calculado podía desviar el cobro varios céntimos del monto pedido por el
// cliente (ej. S/2 de un producto a S/24/kg terminaba en S/1.92) — a 1g el
// desvío queda por debajo del céntimo para la enorme mayoría de precios.
const BULK_WEIGHT_STEP = 0.001;

export function BulkModal({ product, onConfirm, onClose }: {
  product: Product;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  const isWeighable = product.bulkUnit === 'kg' || product.bulkUnit === 'g' || product.bulkUnit === 'L';
  const [mode, setMode] = useState<'peso' | 'monto'>('peso');
  const [qty, setQty] = useState('');
  const [amount, setAmount] = useState('');
  const unit = product.bulkUnit ?? 'unidad';
  const price = Number(product.salePrice);

  // Modo "por monto": el cliente pide "2 soles de X" — calculamos el peso
  // exacto que hay que poner en la balanza para llegar a ese monto, en vez
  // de que el cajero tenga que adivinar a ojo. El toFixed corta el error de
  // punto flotante que deja Math.round con pasos decimales (ej. 0.267000000004).
  const amountNum = parseFloat(amount);
  const computedQty = amountNum > 0 && price > 0
    ? Number((Math.round((amountNum / price) / BULK_WEIGHT_STEP) * BULK_WEIGHT_STEP).toFixed(3))
    : 0;

  const finalQty = mode === 'monto' ? computedQty : parseFloat(qty);
  const total = (finalQty > 0 ? finalQty : 0) * price;

  const weightPresets = [0.25, 0.5, 0.75, 1, 1.5, 2];
  const countPresets = [1, 2, 3, 5, 10];
  const amountPresets = [1, 2, 3, 5, 10];

  return (
    <BareDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={product.name} align="center" panelClassName="w-full max-w-sm rounded-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {product.name}
            </h3>
            <p className="text-xs text-muted-foreground">{formatCurrency(price)} / {unit}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-4">
          {isWeighable && (
            <div className="flex rounded-lg bg-muted p-1 text-sm font-medium">
              <button
                onClick={() => setMode('peso')}
                className={cn('flex-1 rounded-md py-1.5 transition-colors', mode === 'peso' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                Por peso
              </button>
              <button
                onClick={() => setMode('monto')}
                className={cn('flex-1 rounded-md py-1.5 transition-colors', mode === 'monto' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                Por monto (S/)
              </button>
            </div>
          )}

          {mode === 'peso' ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Cantidad ({unit})</label>
                <Input
                  type="number" min={0.01} step={0.01}
                  value={qty} onChange={e => setQty(e.target.value)}
                  placeholder={`Ej: 0.5 ${unit}`}
                  className="text-xl font-bold text-center" autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(isWeighable ? weightPresets : countPresets).map(p => (
                  <button key={p} onClick={() => setQty(String(p))}
                    className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-xs font-medium transition-colors">
                    {p} {unit}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">El cliente quiere pagar (S/)</label>
                <Input
                  type="number" min={0.01} step={0.5}
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="Ej: 2.00"
                  className="text-xl font-bold text-center" autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {amountPresets.map(p => (
                  <button key={p} onClick={() => setAmount(String(p))}
                    className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-xs font-medium transition-colors">
                    S/ {p}
                  </button>
                ))}
              </div>
              {computedQty > 0 && (
                <div className="rounded-lg border-2 border-primary bg-primary/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pon en la balanza</p>
                  <p className="text-2xl font-black text-primary">{computedQty} {unit}</p>
                </div>
              )}
            </>
          )}

          {finalQty > 0 && (
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total a cobrar</p>
              <p className="text-2xl font-black text-primary">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">{finalQty} {unit} × {formatCurrency(price)}</p>
            </div>
          )}
        </div>
        <div className="border-t p-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1"
            disabled={!(finalQty > 0)}
            onClick={() => { onConfirm(finalQty); onClose(); }}>
            Agregar al carrito
          </Button>
        </div>
    </BareDialog>
  );
}

/* ─── Piezas de la lista de productos ─────────────────────────────────────── */
export function Chip({ active, onClick, icon, children }: { active?: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors lg:h-8 lg:px-3',
        active ? 'bg-brand text-white shadow-sm' : 'bg-card text-foreground/80 ring-1 ring-border hover:bg-accent hover:text-accent-foreground')}>
      {icon}{children}
    </button>
  );
}

export function OfferBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-primary/10 px-1.5 text-[11px] font-semibold leading-5 text-primary">{children}</span>;
}

export function StockNote({ product, compact }: { product: Product; compact?: boolean }) {
  if (product.currentStock <= 0) return <span className="text-xs font-medium text-destructive">{compact ? 'Sin stock' : 'Sin stock · 2 toques vende igual'}</span>;
  if (product.currentStock <= 5) return <span className="text-xs font-medium text-warn-ink">{product.currentStock === 1 ? 'Última unidad' : `Quedan ${product.currentStock}`}</span>;
  return null;
}

/** Botón "+" de la fila; con productos en el carrito muestra cuántos van. */
export function AddButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.currentTarget.blur(); onClick(); }} aria-label="Agregar"
      className={cn('flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums transition-colors active:scale-95',
        count > 0 ? 'bg-lime text-white' : 'bg-primary/10 text-primary')}>
      {count > 0 ? Number(count.toFixed(2)) : <Plus className="h-5 w-5" />}
    </button>
  );
}
