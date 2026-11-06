import { useRef, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, UserPlus, X, Tag, Search, Ticket, Star, PackagePlus, GlassWater, Tv, ChevronRight, ArrowLeft } from 'lucide-react';
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
import { ProductThumb } from './ProductThumb';

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
  /** Celular: el carrito es una pantalla aparte con flecha para volver a los productos. */
  onBack?: () => void;
}

export function PosCart({ onCheckout, className, onBack }: PosCartProps) {
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
  const productImages = useProductCacheStore((st) => st.products);

  const handleQuantityChange = (productId: string, value: string) => {
    const qty = parseFloat(value.replace(',', '.'));
    // Vacío o 0 al salir del campo = se deja como estaba (para quitar el
    // producto está la papelera; así no se borra por error).
    if (isNaN(qty) || qty <= 0) return;
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
    <div className={cn('flex flex-col bg-card lg:border-r lg:border-border/60', className)}>
      {/* Encabezado */}
      <div className="flex h-14 shrink-0 items-center gap-1 px-2 lg:h-12 lg:px-3">
        {onBack && (
          <button onClick={onBack} aria-label="Volver a productos"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className={cn('flex-1 text-lg font-semibold lg:text-base', !onBack && 'pl-2 lg:pl-1')}>
          Carrito
          {items.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length} producto{items.length !== 1 ? 's' : ''}</span>}
        </h2>
        <button title="Pantalla TV: mostrar la venta o una promo al cliente" aria-label="Pantalla TV"
          onClick={() => setShowTv(true)}
          className={cn('relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted lg:h-8 lg:w-8', tvOn ? 'text-primary' : 'text-muted-foreground')}>
          <Tv className="h-[18px] w-[18px] lg:h-4 lg:w-4" />
          {tvOn && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 lg:right-1 lg:top-1" />}
        </button>
        <button title="Vender algo que no está en el catálogo" aria-label="Producto manual"
          onClick={() => setShowMiscItem(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted lg:h-8 lg:w-8">
          <PackagePlus className="h-[18px] w-[18px] lg:h-4 lg:w-4" />
        </button>
        {items.length > 0 && (
          <button onClick={() => { if (items.length < 3 || window.confirm('¿Vaciar el carrito?')) clearCart(); }}
            className="h-10 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:h-8 lg:text-xs">
            Vaciar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Cliente */}
        <div className="px-4 pb-2 lg:px-3">
          <button onClick={() => setShowCustomerSearch(true)}
            className="flex h-12 w-full items-center gap-3 rounded-xl bg-muted/70 px-3.5 text-left transition-colors hover:bg-muted lg:h-10">
            <UserPlus className={cn('h-[18px] w-[18px] shrink-0', customerName ? 'text-primary' : 'text-muted-foreground')} />
            <span className={cn('min-w-0 flex-1 truncate text-sm', customerName ? 'font-semibold' : 'text-foreground/80')}>
              {customerName ?? 'Agregar cliente'}
            </span>
            {customerName ? (
              <span role="button" aria-label="Quitar cliente"
                onClick={(e) => { e.stopPropagation(); setCustomer(null, null); }}
                className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive">
                <X className="h-4 w-4" />
              </span>
            ) : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>

        {/* Cupón de descuento o puntos de fidelización del cliente (excluyentes) */}
        {customerId && items.length > 0 && (
          <div className="mx-4 mb-2 overflow-hidden rounded-xl empty:hidden lg:mx-3 [&>*:last-child]:border-b-0">
            <CouponBanner customerId={customerId} />
            <LoyaltyPointsBanner customerId={customerId} />
          </div>
        )}

        {/* Productos */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 opacity-25" />
            <p className="text-sm">Escanea un código o toca un producto para empezar la venta.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const imageUrl = productImages[item.productId.split('#')[0]]?.imageUrl;
              const step = item.packSize ?? 1;
              return (
              <li key={item.productId} className="cart-item-enter px-4 py-3 lg:px-3 lg:py-2.5">
                <div className="flex items-start gap-3">
                  <ProductThumb name={item.name} imageUrl={imageUrl} className="h-11 w-11 lg:h-9 lg:w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug lg:text-sm">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular-nums lg:text-xs">
                      {formatCurrency(item.unitPrice)} c/u
                      {item.discountAmount > 0 && <span className="ml-2 text-success">− {formatCurrency(item.discountAmount)}</span>}
                    </p>
                    {item.autoAdjust && (
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Sin stock en el sistema · se ajusta al cobrar</p>
                    )}
                  </div>
                  <button onClick={() => removeItem(item.productId)} aria-label="Eliminar producto"
                    className="-mr-2 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive lg:h-7 lg:w-7">
                    <Trash2 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between pl-14 lg:pl-12">
                  {/* Cantidad — en paquetes se mueve de a packSize unidades por toque */}
                  <div className="flex items-center rounded-full bg-muted/80">
                    <button onClick={() => updateQuantity(item.productId, item.quantity - step)} aria-label="Quitar uno"
                      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-background active:scale-90 lg:h-7 lg:w-7">
                      <Minus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                    </button>
                    <QtyInput value={item.quantity} onCommit={(v) => handleQuantityChange(item.productId, v)} />
                    <button onClick={() => updateQuantity(item.productId, item.quantity + step)} aria-label="Agregar uno"
                      disabled={!item.autoAdjust && item.quantity + step > item.stock}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-primary hover:bg-background active:scale-90 disabled:text-muted-foreground/40 lg:h-7 lg:w-7">
                      <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold tabular-nums lg:text-sm">{formatCurrency(item.subtotal)}</p>
                </div>

                {/* Envase retornable — de los 3 casos reales sólo 2 dejan algo
                    pendiente por hacer seguimiento; el tercero (trajo su
                    envase) es el default y no genera ningún movimiento. */}
                {!!item.bottleDepositUnit && (
                  <div className="ml-14 mt-2.5 lg:ml-12">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GlassWater className="h-3.5 w-3.5" />Envase {formatCurrency(item.bottleDepositUnit)} c/u
                    </p>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/70 p-1">
                      {([
                        [null, 'Trajo envase'],
                        ['CHARGE', 'Dejó garantía'],
                        ['LOAN', 'Sin garantía'],
                      ] as const).map(([choice, label]) => (
                        <button key={label} type="button"
                          onClick={() => choice ? handleBottleDepositChoice(item.productId, choice) : setBottleDepositChoice(item.productId, null)}
                          className={cn('min-h-[34px] rounded-md px-1 text-[11px] font-medium leading-tight transition-colors',
                            (item.bottleDepositChoice ?? null) === choice ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {item.bottleDepositChoice === 'CHARGE' && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Se cobra {formatCurrency(item.bottleDepositUnit * item.quantity)} a <strong className="text-foreground">{item.bottleDepositDebtorLabel || customerName || 'sin identificar'}</strong>; se le devuelve al traer el envase.
                      </p>
                    )}
                    {item.bottleDepositChoice === 'LOAN' && (
                      <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                        No se cobra. <strong>{item.bottleDepositDebtorLabel || customerName || 'sin identificar'}</strong> queda debiendo el envase.
                      </p>
                    )}
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}

      </div>

      {/* Totales + cobrar (con el descuento fijo: % del subtotal o monto en soles) */}
      <div className="shrink-0 border-t border-border/60 bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:px-3 lg:pb-3">
        {items.length > 0 && (
          <div className="mb-2.5 flex items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Descuento</span>
            <div className="flex shrink-0 rounded-lg bg-muted/80 p-0.5">
              {(['percent', 'amount'] as const).map((m) => (
                <button key={m} type="button"
                  className={cn('h-8 w-9 rounded-md text-sm font-semibold lg:h-7', discountMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                  onClick={() => { setDiscountMode(m); setGlobalDiscount(0, 0); }}>
                  {m === 'percent' ? '%' : 'S/'}
                </button>
              ))}
            </div>
            <input
              key={discountMode}
              ref={discountRef}
              type="number" inputMode="decimal"
              min={0} max={discountMode === 'percent' ? 100 : undefined}
              step={discountMode === 'amount' ? 0.01 : 1}
              defaultValue={(discountMode === 'percent' ? globalDiscountPercent : globalDiscountAmount) || ''}
              placeholder="0"
              className="h-9 w-20 rounded-lg bg-muted/80 text-center text-sm font-semibold tabular-nums outline-none focus:bg-card focus:ring-2 focus:ring-primary/40 lg:h-8"
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const v = parseFloat(e.target.value) || 0;
                if (discountMode === 'percent') setGlobalDiscount(0, Math.min(100, v));
                else setGlobalDiscount(Math.max(0, v), 0);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
            <span className="ml-auto text-sm font-semibold text-success tabular-nums">
              {discountAmount > 0 ? `− ${formatCurrency(discountAmount)}` : ''}
            </span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="mb-1 space-y-0.5 text-sm tabular-nums">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-success"><span>Descuento</span><span>− {formatCurrency(discountAmount)}</span></div>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total <span className="text-xs">(inc. impuestos)</span></span>
          <span className="text-2xl font-bold leading-tight tabular-nums">{formatCurrency(total)}</span>
        </div>
        <Button
          className="mt-3 h-14 w-full rounded-xl text-base font-semibold lg:h-12"
          onClick={onCheckout}
          disabled={items.length === 0}
        >
          Cobrar
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


/**
 * Cantidad editable: mientras se escribe se guarda un borrador local, así se
 * puede borrar el número y escribir otro (4 → 19) sin que el carrito lo
 * rechace a medio escribir. Se aplica al salir del campo o con Enter. Al
 * tocarlo se selecciona todo, para escribir encima directamente.
 */
function QtyInput({ value, onCommit }: { value: number; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && draft !== null && draft !== String(value)) onCommit(draft);
    cancelled.current = false;
    setDraft(null);
  };
  return (
    <input
      type="text" inputMode="decimal" aria-label="Cantidad"
      value={draft ?? String(value)}
      onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
      }}
      className="h-9 w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none focus:rounded-md focus:bg-background lg:h-7 lg:w-10 lg:text-sm"
    />
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
