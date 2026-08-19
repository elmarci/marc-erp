import { useRef, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, UserPlus, X, Tag, Search, Ticket, Star, PackagePlus, GlassWater } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency, cn } from '@/lib/utils';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface Customer { id: string; firstName: string; lastName: string | null; phone: string | null; taxId: string | null }
interface CustomerCoupon { id: string; code: string; discountPercent: number; expiresAt: string }

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' });
}

/* ─── Cupón de descuento del cliente asignado ────────────────────────────── */
function CouponBanner({ customerId }: { customerId: string }) {
  const { couponCode, pointsToRedeem, setCoupon } = usePosStore();

  const { data: coupons } = useQuery({
    queryKey: ['customer-coupons', customerId],
    queryFn: async () => (await api.get<{ data: CustomerCoupon[] }>(`/coupons?customerId=${customerId}`)).data.data,
  });

  const available = (coupons ?? []).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];

  if (couponCode) {
    return (
      <div className="flex items-center justify-between border-b bg-success/10 px-4 py-2">
        <span className="text-xs font-medium text-success flex items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5" />
          Cupón {couponCode} aplicado (-{usePosStore.getState().couponDiscountPercent}%)
        </span>
        <button onClick={() => setCoupon(null, 0)} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Excluyente con los puntos: si ya se están canjeando puntos, no ofrecer el cupón.
  if (!available || pointsToRedeem > 0) return null;

  return (
    <div className="flex items-center justify-between border-b bg-amber-500/10 px-4 py-2">
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
        <Ticket className="h-3.5 w-3.5" />
        Cupón {available.discountPercent}% disponible · vence {formatShortDate(available.expiresAt)}
      </span>
      <Button size="sm" variant="outline" className="h-6 text-xs px-2"
        onClick={() => setCoupon(available.code, available.discountPercent)}>
        Aplicar
      </Button>
    </div>
  );
}

/* ─── Puntos de fidelización del cliente asignado ────────────────────────── */
function LoyaltyPointsBanner({ customerId }: { customerId: string }) {
  const { couponCode, pointsToRedeem, subtotal, setPointsRedemption } = usePosStore();

  const { data: customer } = useQuery({
    queryKey: ['customer-loyalty', customerId],
    queryFn: async () => (await api.get<{ data: { loyaltyPoints: number } }>(`/customers/${customerId}`)).data.data,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Array<{ key: string; value: string }> }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const pointValue = Number(settings?.find(s => s.key === 'loyalty_point_value')?.value ?? 0.05);
  const points = customer?.loyaltyPoints ?? 0;

  if (pointsToRedeem > 0) {
    return (
      <div className="flex items-center justify-between border-b bg-success/10 px-4 py-2">
        <span className="text-xs font-medium text-success flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" />
          {pointsToRedeem} puntos canjeados (-{formatCurrency(pointsToRedeem * pointValue)})
        </span>
        <button onClick={() => setPointsRedemption(0, 0)} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Excluyente con el cupón, y no tiene sentido si no hay puntos o no alcanzan para nada.
  if (couponCode || points <= 0) return null;

  // No se puede canjear más de lo que cubre el subtotal actual.
  const usablePoints = Math.min(points, Math.floor(subtotal / pointValue));
  if (usablePoints <= 0) return null;

  return (
    <div className="flex items-center justify-between border-b bg-amber-500/10 px-4 py-2">
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" />
        {points} puntos disponibles (equivalen a {formatCurrency(points * pointValue)})
      </span>
      <Button size="sm" variant="outline" className="h-6 text-xs px-2"
        onClick={() => setPointsRedemption(usablePoints, usablePoints * pointValue)}>
        Canjear
      </Button>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" />Venta excepcional</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
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
      </div>
    </div>
  );
}

function CustomerSearchModal({ onSelect, onClose }: {
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
    updateQuantity, removeItem, clearCart, customerId, customerName, setCustomer,
    globalDiscountPercent, globalDiscountAmount, setGlobalDiscount,
    addItem, setBottleDepositChoice,
  } = usePosStore();

  const discountRef = useRef<HTMLInputElement>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showMiscItem, setShowMiscItem] = useState(false);
  // Cuando el cajero elige "Prestar" el envase sin cliente asignado, hay que
  // pedirle uno primero (si no, luego no hay a quién cobrarle) — este estado
  // recuerda para qué línea era, para aplicar la elección recién se asigne.
  const [pendingLoanProductId, setPendingLoanProductId] = useState<string | null>(null);

  const handleBottleDepositChoice = (productId: string, choice: 'CHARGE' | 'LOAN') => {
    if (choice === 'LOAN' && !customerId) {
      setPendingLoanProductId(productId);
      setShowCustomerSearch(true);
      return;
    }
    setBottleDepositChoice(productId, choice);
  };
  // Descuento global por % (del subtotal) o por monto fijo en soles —
  // mutuamente excluyentes, igual que ya soporta el store internamente.
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');

  const handleQuantityChange = (productId: string, value: string) => {
    const qty = parseFloat(value);
    if (isNaN(qty) || qty < 0) return;
    const item = items.find((i) => i.productId === productId);
    // Paquete/2x1: si escriben un número que no es múltiplo del tamaño del
    // paquete, se redondea al múltiplo más cercano — vender "media promo"
    // no tiene sentido comercial (el precio por unidad ya viene rebajado
    // asumiendo que se lleva el paquete completo).
    const step = item?.packSize ?? 1;
    const roundedQty = step > 1 ? Math.max(step, Math.round(qty / step) * step) : qty;
    const result = updateQuantity(productId, roundedQty);
    if (result.capped) {
      toast.error(`"${item?.name ?? 'Producto'}" — stock disponible: ${result.finalQuantity}.`);
    }
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
          {/* Venta excepcional (algo fuera de catálogo) */}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Vender algo que no está en el catálogo"
            className="text-muted-foreground"
            onClick={() => setShowMiscItem(true)}
          >
            <PackagePlus className="h-4 w-4" />
          </Button>
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

      {/* Cupón de descuento o puntos de fidelización del cliente (excluyentes) */}
      {customerId && items.length > 0 && (
        <>
          <CouponBanner customerId={customerId} />
          <LoyaltyPointsBanner customerId={customerId} />
        </>
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
                  {/* Control de cantidad — en paquetes se mueve de a packSize
                      unidades por clic, no de a 1, para no romper la promo */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.productId, item.quantity - (item.packSize ?? 1))}
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
                      onClick={() => updateQuantity(item.productId, item.quantity + (item.packSize ?? 1))}
                      disabled={item.quantity + (item.packSize ?? 1) > item.stock}
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

                {/* Envase retornable — cobrar garantía / prestar sin cobrar */}
                {!!item.bottleDepositUnit && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
                    <GlassWater className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      Envase {formatCurrency(item.bottleDepositUnit)} c/u:
                    </span>
                    <div className="flex gap-1 ml-auto">
                      <button type="button"
                        onClick={() => handleBottleDepositChoice(item.productId, 'CHARGE')}
                        className={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors',
                          item.bottleDepositChoice === 'CHARGE' ? 'bg-primary text-primary-foreground' : 'bg-background border text-muted-foreground hover:text-foreground')}>
                        Cobrar
                      </button>
                      <button type="button"
                        onClick={() => handleBottleDepositChoice(item.productId, 'LOAN')}
                        className={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors',
                          item.bottleDepositChoice === 'LOAN' ? 'bg-amber-500 text-white' : 'bg-background border text-muted-foreground hover:text-foreground')}>
                        Prestar
                      </button>
                      {item.bottleDepositChoice && (
                        <button type="button" onClick={() => setBottleDepositChoice(item.productId, null)}
                          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Descuento global — por % del subtotal o por monto fijo en soles */}
      {items.length > 0 && (
        <div className="border-t px-4 py-2">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground shrink-0">Descuento:</span>
            <div className="flex rounded-md border overflow-hidden shrink-0">
              <button
                type="button"
                className={cn('px-1.5 py-0.5 text-xs font-medium', discountMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => { setDiscountMode('percent'); setGlobalDiscount(0, 0); }}
              >
                %
              </button>
              <button
                type="button"
                className={cn('px-1.5 py-0.5 text-xs font-medium border-l', discountMode === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => { setDiscountMode('amount'); setGlobalDiscount(0, 0); }}
              >
                S/
              </button>
            </div>
            <Input
              key={discountMode}
              ref={discountRef}
              type="number"
              min={0}
              max={discountMode === 'percent' ? 100 : undefined}
              step={discountMode === 'amount' ? 0.01 : 1}
              defaultValue={(discountMode === 'percent' ? globalDiscountPercent : globalDiscountAmount) || ''}
              placeholder="0"
              className="h-7 w-20 text-center text-sm"
              onBlur={(e) => {
                const v = parseFloat(e.target.value) || 0;
                if (discountMode === 'percent') setGlobalDiscount(0, Math.min(100, v));
                else setGlobalDiscount(Math.max(0, v), 0);
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
        onSelect={(id, name) => {
          setCustomer(id, name);
          setShowCustomerSearch(false);
          if (pendingLoanProductId) {
            setBottleDepositChoice(pendingLoanProductId, 'LOAN');
            setPendingLoanProductId(null);
          }
        }}
        onClose={() => { setShowCustomerSearch(false); setPendingLoanProductId(null); }}
      />
    )}

    {showMiscItem && (
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
          setShowMiscItem(false);
        }}
        onClose={() => setShowMiscItem(false)}
      />
    )}
    </>
  );
}

