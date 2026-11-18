// Ventanas del carrito: venta excepcional, a nombre de quién va el envase y
// buscar cliente.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackagePlus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BareDialog } from '@/components/erp';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency } from '@/lib/utils';
import { api } from '@/services/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface Customer { id: string; firstName: string; lastName: string | null; phone: string | null; taxId: string | null }

/* ─── Venta excepcional de algo fuera de catálogo ────────────────────────── */
function MiscItemModal({ onAdd, onClose }: {
  onAdd: (input: { productId: string; description: string; amount: number; quantity: number }) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');

  const { data: miscProductId, isLoading } = useQuery({
    queryKey: ['pos-misc-item'],
    queryFn: async () => (await api.get<{ data: { id: string } }>('/products/misc-item')).data.data.id,
    staleTime: Infinity,
  });

  const amountNum = parseFloat(amount);
  const qtyNum = parseInt(quantity, 10);
  const canSubmit = !!miscProductId && description.trim().length > 0 && amountNum > 0 && qtyNum > 0;

  return (
    <BareDialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Venta excepcional" align="center" panelClassName="w-full max-w-sm rounded-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" />Venta excepcional</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Para algo que vendiste y no está registrado en el catálogo — se anota en la venta pero no descuenta stock de ningún producto.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">¿Qué vendiste?</label>
            <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Candado chico" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.10} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cantidad</label>
              <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="border-t p-4 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            loading={isLoading}
            disabled={!canSubmit}
            onClick={() => onAdd({ productId: miscProductId!, description: description.trim(), amount: amountNum, quantity: qtyNum })}
          >
            Agregar
          </Button>
        </div>
    </BareDialog>
  );
}

/* ─── Identificador rápido para saber a quién devolverle el envase ──────── */
// No obliga a crear una ficha de cliente — sólo un nombre/apodo/teléfono
// libre. Quien quiera puede en cambio buscar un cliente ya registrado.
export function DebtorLabelModal({ choice, onConfirm, onSearchCustomer, onClose }: {
  choice: 'CHARGE' | 'LOAN';
  onConfirm: (label: string) => void;
  onSearchCustomer: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');

  return (
    <BareDialog open onOpenChange={(o) => { if (!o) onClose(); }} title="A nombre de quién" align="center" panelClassName="w-full max-w-sm rounded-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">¿A nombre de quién?</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {choice === 'CHARGE'
              ? 'Para saber a quién devolverle la plata cuando traiga el envase vacío.'
              : 'Para saber quién queda debiendo el envase.'}
            {' '}No hace falta que sea un cliente registrado — con un nombre, apodo o teléfono alcanza.
          </p>
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej: Juan, casa azul / 987654321"
            onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) onConfirm(label.trim()); }} />
          <button type="button" onClick={onSearchCustomer}
            className="text-xs text-primary hover:underline">
            Prefiero buscar un cliente registrado
          </button>
        </div>
        <div className="border-t p-4 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!label.trim()} onClick={() => onConfirm(label.trim())}>Confirmar</Button>
        </div>
    </BareDialog>
  );
}

export function CustomerSearchModal({ onSelect, onClose }: {
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data } = useQuery({
    queryKey: ['pos-customers', debouncedSearch],
    queryFn: async () => {
      const res = await api.get<{ data: Customer[] }>(`/customers?search=${debouncedSearch}&limit=10`);
      return res.data.data;
    },
    enabled: debouncedSearch.length >= 1,
  });

  return (
    <BareDialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Asignar cliente" align="center" panelClassName="w-full max-w-sm rounded-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Asignar cliente</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input autoFocus className="pl-9" placeholder="Buscar por nombre, DNI, teléfono..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="max-h-60 overflow-y-auto divide-y border rounded-lg">
            {search.length < 1 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Escribe para buscar...</p>
            )}
            {search.length >= 1 && (!data || data.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
            )}
            {(data ?? []).map(c => (
              <button key={c.id} onClick={() => onSelect(c.id, `${c.firstName} ${c.lastName ?? ''}`.trim())}
                className="w-full text-left px-4 py-3 hover:bg-muted transition-colors text-sm">
                <p className="font-medium">{c.firstName} {c.lastName}</p>
                <p className="text-xs text-muted-foreground">{c.taxId ? `DNI: ${c.taxId} · ` : ''}{c.phone ?? ''}</p>
              </button>
            ))}
          </div>
        </div>
    </BareDialog>
  );
}

/** "Producto manual" / venta excepcional: algo que no está en el catálogo. */
export function MiscItemSheet({ onClose }: { onClose: () => void }) {
  const addItem = usePosStore((s) => s.addItem);
  return (
    <MiscItemModal
      onAdd={({ productId, description, amount, quantity }) => {
        // Cada venta excepcional es su propia línea aunque comparta el
        // mismo producto comodín — un id único evita que dos "Otros" con
        // descripción/precio distintos se mezclen en una sola línea.
        addItem({
          productId: `${productId}#${crypto.randomUUID()}`, name: description, barcode: null, quantity,
          unitPrice: amount, originalPrice: amount, discountAmount: 0, discountPercent: 0,
          stock: quantity,
        });
        toast.success(`${description} agregado — ${formatCurrency(amount * quantity)}`);
        onClose();
      }}
      onClose={onClose}
    />
  );
}
