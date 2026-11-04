import { useRef, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, UserPlus, X, Tag, Search, Ticket, Star, PackagePlus, GlassWater, Tv, ChevronRight, ArrowRight, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency, cn } from '@/lib/utils';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTvLiveStore } from '@/stores/tvLiveStore';
import { TvLiveModal } from './TvLiveModal';
import { useProductCacheStore } from '@/stores/productCacheStore';

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

/* ─── Identificador rápido para saber a quién devolverle el envase ──────── */
// No obliga a crear una ficha de cliente — sólo un nombre/apodo/teléfono
// libre. Quien quiera puede en cambio buscar un cliente ya registrado.
function DebtorLabelModal({ choice, onConfirm, onSearchCustomer, onClose }: {
  choice: 'CHARGE' | 'LOAN';
  onConfirm: (label: string) => void;
  onSearchCustomer: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">¿A nombre de quién?</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
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
  const [showTv, setShowTv] = useState(false);
  const tvOn = useTvLiveStore((s) => s.enabled);
  // Tanto "Dejó garantía" como "Sin garantía" dejan algo pendiente por
  // rastrear (a quién devolverle la plata en un caso, quién debe traer el
  // envase en el otro) — ambos necesitan quedar identificados con alguien,
  // salvo que la venta ya tenga un cliente asignado. Este estado recuerda
  // para qué línea y con qué elección, para aplicarla recién se identifique.
  const [pendingDeposit, setPendingDeposit] = useState<{ productId: string; choice: 'CHARGE' | 'LOAN' } | null>(null);

  const handleBottleDepositChoice = (productId: string, choice: 'CHARGE' | 'LOAN') => {
    const item = items.find((i) => i.productId === productId);
    // Ya identificado (con etiqueta libre o porque la venta ya tiene
    // cliente) — no hace falta volver a preguntar.
    if (!item?.bottleDepositDebtorLabel && !customerId) {
      setPendingDeposit({ productId, choice });
      return;
    }
    setBottleDepositChoice(productId, choice);
  };
  // Descuento global por % (del subtotal) o por monto fijo en soles —
  // mutuamente excluyentes, igual que ya soporta el store internamente.
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [showDiscount, setShowDiscount] = useState(false);
  const discountOpen = showDiscount || globalDiscountPercent > 0 || globalDiscountAmount > 0;
  const productImages = useProductCacheStore((st) => st.products);

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
    <div className={cn('flex flex-col bg-pos-cart lg:border-r', className)}>
      {/* Encabezado: cantidad + acciones secundarias */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4 lg:border-b lg:py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="hidden h-4 w-4 text-muted-foreground lg:block" />
          <span className="text-base font-bold lg:text-sm lg:font-semibold">
            {items.length > 0 ? `${items.length} producto${items.length !== 1 ? 's' : ''}` : 'Carrito'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Pantalla TV: mostrar la venta / una promo al cliente */}
          <Button
            variant="ghost"
            size="icon"
            title="Pantalla TV: mostrar la venta o una promo al cliente"
            className={cn('relative h-10 w-10 lg:h-8 lg:w-8', tvOn ? 'text-primary' : 'text-muted-foreground')}
            onClick={() => setShowTv(true)}
          >
            <Tv className="h-4 w-4" />
            {tvOn && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
          </Button>
          {/* Venta excepcional (algo fuera de catálogo) */}
          <Button
            variant="ghost"
            size="icon"
            title="Vender algo que no está en el catálogo"
            className="h-10 w-10 text-muted-foreground lg:h-8 lg:w-8"
            onClick={() => setShowMiscItem(true)}
          >
            <PackagePlus className="h-4 w-4" />
          </Button>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              title="Vaciar carrito"
              className="h-10 gap-1.5 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive lg:h-8"
              onClick={() => { if (items.length < 3 || window.confirm('¿Vaciar el carrito?')) clearCart(); }}
            >
              <Trash2 className="h-4 w-4" />Vaciar
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 pb-4 pt-2 lg:space-y-2 lg:px-3 lg:pt-3">
          {/* Cliente: fila tocable, o el cliente asignado con opción de quitar */}
          {customerName ? (
            <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 lg:min-h-0 lg:rounded-xl lg:px-3 lg:py-2">
              <UserPlus className="h-4 w-4 shrink-0 text-primary" />
              <button className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-primary" onClick={() => setShowCustomerSearch(true)}>
                {customerName}
              </button>
              <button onClick={() => setCustomer(null, null)} aria-label="Quitar cliente"
                className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowCustomerSearch(true)}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/50 lg:min-h-0 lg:rounded-xl lg:px-3 lg:py-2 lg:shadow-none">
              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Agregar cliente</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Cupón de descuento o puntos de fidelización del cliente (excluyentes) */}
          {customerId && items.length > 0 && (
            <div className="overflow-hidden rounded-2xl border empty:hidden lg:rounded-xl [&>*:last-child]:border-b-0">
              <CouponBanner customerId={customerId} />
              <LoyaltyPointsBanner customerId={customerId} />
            </div>
          )}

          {/* Lista de items */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 opacity-20" />
              <p className="text-center text-sm">
                Escanea un código de barras o busca un producto para comenzar
              </p>
            </div>
          ) : (
            items.map((item) => {
              const imageUrl = productImages[item.productId.split('#')[0]]?.imageUrl;
              return (
              <div key={item.productId} className="cart-item-enter rounded-2xl border bg-card p-3 shadow-sm lg:rounded-xl lg:shadow-none">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 lg:h-11 lg:w-11 lg:rounded-lg">
                    {imageUrl
                      ? <img src={imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                      : <Package className="h-6 w-6 text-muted-foreground/40" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} c/u</p>
                    {item.autoAdjust && (
                      <p className="mt-0.5 text-[11px] font-medium text-warning">Sin stock en el sistema · el inventario se ajusta al cobrar</p>
                    )}
                    {item.discountAmount > 0 && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <Tag className="h-3 w-3 text-success" />
                        <span className="text-xs text-success">Desc. S/ {item.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Eliminar producto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  {/* Control de cantidad — en paquetes se mueve de a packSize
                      unidades por toque, no de a 1, para no romper la promo */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl lg:h-8 lg:w-8 lg:rounded-lg"
                      aria-label="Quitar uno"
                      onClick={() => updateQuantity(item.productId, item.quantity - (item.packSize ?? 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                      className="h-10 w-16 rounded-xl p-1 text-center text-base font-bold lg:h-8 lg:w-14 lg:rounded-lg lg:text-sm"
                      min={1}
                      max={item.autoAdjust ? undefined : item.stock}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-primary/60 text-primary lg:h-8 lg:w-8 lg:rounded-lg"
                      aria-label="Agregar uno"
                      onClick={() => updateQuantity(item.productId, item.quantity + (item.packSize ?? 1))}
                      disabled={!item.autoAdjust && item.quantity + (item.packSize ?? 1) > item.stock}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-base font-extrabold">{formatCurrency(item.subtotal)}</p>
                </div>

                {/* Envase retornable — de los 3 casos reales sólo 2 dejan algo
                    pendiente por hacer seguimiento; el tercero (trajo su
                    envase) es el default y no genera ningún movimiento. */}
                {!!item.bottleDepositUnit && (
                  <div className="mt-3 rounded-xl bg-muted/50 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <GlassWater className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Envase {formatCurrency(item.bottleDepositUnit)} c/u:
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <button type="button"
                        onClick={() => setBottleDepositChoice(item.productId, null)}
                        className={cn('min-h-[36px] rounded-lg px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors',
                          !item.bottleDepositChoice ? 'bg-success text-success-foreground' : 'border bg-background text-muted-foreground hover:text-foreground')}>
                        Trajo su envase
                      </button>
                      <button type="button"
                        onClick={() => handleBottleDepositChoice(item.productId, 'CHARGE')}
                        className={cn('min-h-[36px] rounded-lg px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors',
                          item.bottleDepositChoice === 'CHARGE' ? 'bg-primary text-primary-foreground' : 'border bg-background text-muted-foreground hover:text-foreground')}>
                        Dejó garantía
                      </button>
                      <button type="button"
                        onClick={() => handleBottleDepositChoice(item.productId, 'LOAN')}
                        className={cn('min-h-[36px] rounded-lg px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors',
                          item.bottleDepositChoice === 'LOAN' ? 'bg-amber-500 text-white' : 'border bg-background text-muted-foreground hover:text-foreground')}>
                        Sin garantía
                      </button>
                    </div>
                    {item.bottleDepositChoice === 'CHARGE' && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Se cobra {formatCurrency(item.bottleDepositUnit * item.quantity)} a <strong>{item.bottleDepositDebtorLabel || customerName || 'sin identificar'}</strong> — se le devuelve esa plata cuando traiga el envase vacío.
                      </p>
                    )}
                    {item.bottleDepositChoice === 'LOAN' && (
                      <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                        No se cobra nada — <strong>{item.bottleDepositDebtorLabel || customerName || 'sin identificar'}</strong> queda debiendo el envase (nada que devolverle al traerlo).
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}

          {/* Descuento global — por % del subtotal o por monto fijo en soles */}
          {items.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm lg:rounded-xl lg:shadow-none">
              <button type="button" onClick={() => setShowDiscount((v) => !v)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left lg:min-h-0 lg:px-3 lg:py-2">
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{discountAmount > 0 ? 'Descuento' : 'Agregar descuento'}</span>
                {discountAmount > 0 && <span className="text-sm font-semibold text-success">-{formatCurrency(discountAmount)}</span>}
                <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', discountOpen && 'rotate-90')} />
              </button>
              {discountOpen && (
                <div className="flex items-center gap-2 border-t px-4 py-3 lg:px-3 lg:py-2">
                  <div className="flex shrink-0 overflow-hidden rounded-xl border lg:rounded-md">
                    <button
                      type="button"
                      className={cn('h-10 w-11 text-sm font-semibold lg:h-7 lg:w-8 lg:text-xs', discountMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                      onClick={() => { setDiscountMode('percent'); setGlobalDiscount(0, 0); }}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={cn('h-10 w-11 border-l text-sm font-semibold lg:h-7 lg:w-8 lg:text-xs', discountMode === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                      onClick={() => { setDiscountMode('amount'); setGlobalDiscount(0, 0); }}
                    >
                      S/
                    </button>
                  </div>
                  <Input
                    key={discountMode}
                    ref={discountRef}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={discountMode === 'percent' ? 100 : undefined}
                    step={discountMode === 'amount' ? 0.01 : 1}
                    defaultValue={(discountMode === 'percent' ? globalDiscountPercent : globalDiscountAmount) || ''}
                    placeholder="0"
                    className="h-10 w-24 rounded-xl text-center text-base lg:h-7 lg:w-20 lg:rounded-md lg:text-sm"
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      if (discountMode === 'percent') setGlobalDiscount(0, Math.min(100, v));
                      else setGlobalDiscount(Math.max(0, v), 0);
                    }}
                  />
                  <span className="ml-auto text-sm font-semibold text-success">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">Los precios incluyen impuestos.</p>
          )}
        </div>
      </div>

      {/* Totales */}
      <div className="border-t bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:pb-4">
        <div className="space-y-1.5">
          {discountAmount > 0 && (
            <>
              <div className="flex justify-between px-1 text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between px-1 text-sm text-success">
                <span>Descuento</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5 text-xl font-bold">
            <span className="text-base">Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        <Button
          className="mt-3 h-14 w-full gap-2 rounded-xl text-lg font-bold"
          size="xl"
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          Cobrar {items.length > 0 && formatCurrency(total)}
          {items.length > 0 && <ArrowRight className="h-5 w-5" />}
        </Button>
      </div>
    </div>

    {pendingDeposit && !showCustomerSearch && (
      <DebtorLabelModal
        choice={pendingDeposit.choice}
        onConfirm={(label) => {
          setBottleDepositChoice(pendingDeposit.productId, pendingDeposit.choice, label);
          setPendingDeposit(null);
        }}
        onSearchCustomer={() => setShowCustomerSearch(true)}
        onClose={() => setPendingDeposit(null)}
      />
    )}

    {showCustomerSearch && (
      <CustomerSearchModal
        onSelect={(id, name) => {
          setCustomer(id, name);
          setShowCustomerSearch(false);
          if (pendingDeposit) {
            setBottleDepositChoice(pendingDeposit.productId, pendingDeposit.choice);
            setPendingDeposit(null);
          }
        }}
        onClose={() => { setShowCustomerSearch(false); setPendingDeposit(null); }}
      />
    )}

    {showTv && <TvLiveModal onClose={() => setShowTv(false)} />}
    {showMiscItem && <MiscItemSheet onClose={() => setShowMiscItem(false)} />}
    </>
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
