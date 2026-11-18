import { useRef, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, UserPlus, X, Tag, PackagePlus, GlassWater, Tv, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/erp';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTvLiveStore } from '@/stores/tvLiveStore';
import { TvLiveModal } from './TvLiveModal';
import { useProductCacheStore } from '@/stores/productCacheStore';
import { ProductThumb } from './ProductThumb';
import { OfferSuggestions } from './OfferSuggestions';
import { OffersBrowser } from './OffersBrowser';
import { CouponBanner, LoyaltyPointsBanner } from './CartBanners';
import { CustomerSearchModal, DebtorLabelModal, MiscItemSheet } from './CartModals';

interface PosCartProps {
  onCheckout: () => void;
  className?: string;
  /** Celular: el carrito es una pantalla aparte con flecha para volver a los productos. */
  onBack?: () => void;
}

export function PosCart({ onCheckout, className, onBack }: PosCartProps) {
  const {
    items, subtotal, discountAmount, total,
    updateQuantity, removeItem, clearCart, customerId, customerName, setCustomer,
    globalDiscountPercent, globalDiscountAmount, setGlobalDiscount,
    setBottleDepositChoice,
  } = usePosStore();

  const discountRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showMiscItem, setShowMiscItem] = useState(false);
  const [showTv, setShowTv] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
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
          {tvOn && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-bad lg:right-1 lg:top-1" />}
        </button>
        <button title="Vender algo que no está en el catálogo" aria-label="Producto manual"
          onClick={() => setShowMiscItem(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted lg:h-8 lg:w-8">
          <PackagePlus className="h-[18px] w-[18px] lg:h-4 lg:w-4" />
        </button>
        {items.length > 0 && (
          <button onClick={async () => { if (items.length < 3 || (await confirm({ title: 'Vaciar el carrito', description: `Se quitan los ${items.length} productos de esta venta.`, confirmLabel: 'Vaciar' })).ok) clearCart(); }}
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
                      {item.discountAmount > 0 && <span className="ml-2 text-ok-ink">− {formatCurrency(item.discountAmount)}</span>}
                    </p>
                    {item.autoAdjust && (
                      <p className="mt-0.5 text-xs text-warn-ink">Sin stock en el sistema · se ajusta al cobrar</p>
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
                      <p className="mt-1.5 text-xs text-warn-ink">
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

      {/* En celular las ofertas para esta venta van en una fila fija sobre
          los totales; en PC salen arriba de la grilla de productos. */}
      {onBack && <OfferSuggestions onSeeAll={() => setShowOffers(true)} className="border-t border-border/60 px-4 pb-2 pt-2.5" />}

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
            <span className="ml-auto text-sm font-semibold text-ok-ink tabular-nums">
              {discountAmount > 0 ? `− ${formatCurrency(discountAmount)}` : ''}
            </span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="mb-1 space-y-0.5 text-sm tabular-nums">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-ok-ink"><span>Descuento</span><span>− {formatCurrency(discountAmount)}</span></div>
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
    {showOffers && <OffersBrowser onClose={() => setShowOffers(false)} />}
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
