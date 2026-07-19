import { useRef, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, UserPlus, X, Tag, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency, cn } from '@/lib/utils';
import { api } from '@/services/api';

interface Customer { id: string; firstName: string; lastName: string | null; phone: string | null; taxId: string | null }

function CustomerSearchModal({ onSelect, onClose }: {
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['pos-customers', search],
    queryFn: async () => {
      const res = await api.get<{ data: Customer[] }>(`/customers?search=${search}&limit=10`);
      return res.data.data;
    },
    enabled: search.length >= 1,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Asignar cliente</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
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
      </div>
    </div>
  );
}

interface PosCartProps {
  onCheckout: () => void;
  className?: string;
}

export function PosCart({ onCheckout, className }: PosCartProps) {
  const {
    items, subtotal, discountAmount, taxAmount, total,
    updateQuantity, removeItem, clearCart, customerName, setCustomer,
    globalDiscountPercent, setGlobalDiscount,
  } = usePosStore();

  const discountRef = useRef<HTMLInputElement>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  const handleQuantityChange = (productId: string, value: string) => {
    const qty = parseInt(value);
    if (!isNaN(qty) && qty >= 0) updateQuantity(productId, qty);
  };

  return (
    <>
    <div className={cn('flex flex-col border-r bg-pos-cart', className)}>
      {/* Header del carrito */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Carrito</span>
          {items.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground font-bold">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Cliente */}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Asignar cliente"
            className={customerName ? 'text-primary' : 'text-muted-foreground'}
            onClick={() => setShowCustomerSearch(true)}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Vaciar carrito"
              className="text-destructive"
              onClick={clearCart}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Cliente asignado */}
      {customerName && (
        <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-2">
          <span className="text-xs font-medium text-primary">Cliente: {customerName}</span>
          <button onClick={() => setCustomer(null, null)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Lista de items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-6">
            <ShoppingCart className="h-12 w-12 opacity-20" />
            <p className="text-sm text-center">
              Escanea un código de barras o busca un producto para comenzar
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.productId} className="px-4 py-3 cart-item-enter">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.name}</p>
                    {item.barcode && (
                      <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                    )}
                    {item.discountAmount > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Tag className="h-3 w-3 text-success" />
                        <span className="text-xs text-success">
                          Desc. S/ {item.discountAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                    aria-label="Eliminar producto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  {/* Control de cantidad */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                      className="h-7 w-14 text-center text-sm font-semibold p-1"
                      min={1}
                      max={item.stock}
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Precio */}
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatCurrency(item.subtotal)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice)} c/u
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Descuento global */}
      {items.length > 0 && (
        <div className="border-t px-4 py-2">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Descuento %:</span>
            <Input
              ref={discountRef}
              type="number"
              min={0}
              max={100}
              defaultValue={globalDiscountPercent || ''}
              placeholder="0"
              className="h-7 w-16 text-center text-sm"
              onBlur={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setGlobalDiscount(0, Math.min(100, v));
              }}
            />
            <span className="text-xs text-muted-foreground ml-auto">
              -{formatCurrency(discountAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Totales */}
      <div className="border-t bg-card p-4">
        <div className="space-y-1.5">
          {discountAmount > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-success">
                <span>Descuento</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t pt-2 text-xl font-bold">
            <span>TOTAL</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        <Button
          className="mt-4 w-full"
          size="xl"
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          Cobrar {items.length > 0 && formatCurrency(total)}
        </Button>
      </div>
    </div>

    {showCustomerSearch && (
      <CustomerSearchModal
        onSelect={(id, name) => { setCustomer(id, name); setShowCustomerSearch(false); }}
        onClose={() => setShowCustomerSearch(false)}
      />
    )}
    </>
  );
}

