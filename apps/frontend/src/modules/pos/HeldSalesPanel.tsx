import { useState } from 'react';
import { PauseCircle, PlayCircle, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import { usePosStore } from '@/stores/posStore';
import { useHeldSalesStore } from '@/stores/heldSalesStore';

/** Botón del encabezado del POS: ventas en espera, con contador. */
export function HeldSalesButton({ onClick }: { onClick: () => void }) {
  const count = useHeldSalesStore((s) => s.held.length);
  return (
    <button
      onClick={onClick}
      aria-label="Ventas en espera"
      title="Ventas en espera"
      className={cn(
        'relative flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
        count > 0 ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:bg-muted',
      )}>
      <PauseCircle className="h-4 w-4" />
      <span className="hidden sm:inline">En espera</span>
      {count > 0 && <span className="min-w-4 text-center">{count}</span>}
    </button>
  );
}

function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

export function HeldSalesPanel({ onClose, onResumed }: { onClose: () => void; onResumed?: () => void }) {
  const { held, holdCurrent, resume, remove } = useHeldSalesStore();
  const cartCount = usePosStore((s) => s.items.length);
  const cartTotal = usePosStore((s) => s.total);
  const customerName = usePosStore((s) => s.customerName);
  const [label, setLabel] = useState('');

  const hold = () => {
    const sale = holdCurrent(label);
    if (sale) {
      toast.success(`"${sale.label}" quedó en espera. Carrito libre para el siguiente cliente.`, { duration: 2500 });
      setLabel('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="flex items-center gap-2 font-bold"><PauseCircle className="h-5 w-5 text-amber-500" />Ventas en espera</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* Poner la venta actual en espera */}
          <div className="rounded-xl border p-3">
            {cartCount > 0 ? (
              <>
                <p className="mb-2 text-sm">
                  Venta actual: <span className="font-semibold">{cartCount} producto{cartCount !== 1 ? 's' : ''} · {formatCurrency(cartTotal)}</span>
                </p>
                <div className="flex gap-2">
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={customerName ?? 'Nombre o seña (opcional)'}
                    className="h-12"
                    onKeyDown={(e) => { if (e.key === 'Enter') hold(); }}
                  />
                  <Button className="h-12 shrink-0 gap-1.5 bg-amber-500 text-black hover:bg-amber-600" onClick={hold}>
                    <PauseCircle className="h-4 w-4" />Poner en espera
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Ej.: "señora de rojo", "Don Carlos". El carrito queda libre para atender al siguiente.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">El carrito está vacío. Cuando tengas productos podrás dejar la venta en espera desde aquí.</p>
            )}
          </div>

          {/* Lista */}
          {held.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay ventas en espera.</p>
          ) : (
            <div className="space-y-2">
              {held.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{h.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(h.itemCount.toFixed(2))} producto{h.itemCount !== 1 ? 's' : ''} · {timeAgo(h.heldAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold">{formatCurrency(h.total)}</span>
                  <Button
                    className="h-11 shrink-0 gap-1.5"
                    onClick={() => {
                      const swapping = usePosStore.getState().items.length > 0;
                      resume(h.id);
                      toast.success(swapping ? `Retomaste "${h.label}". La venta que tenías quedó en espera.` : `Retomaste "${h.label}".`, { duration: 2500 });
                      onResumed?.();
                      onClose();
                    }}>
                    <PlayCircle className="h-4 w-4" />Retomar
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Descartar ${h.label}`}
                    onClick={() => {
                      if (window.confirm(`¿Descartar la venta en espera "${h.label}"? Los productos no se cobran.`)) remove(h.id);
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
