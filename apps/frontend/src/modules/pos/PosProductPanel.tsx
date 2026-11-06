import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, AlertCircle, Scale, Tag, X, Mic, Star, ScanBarcode, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePosStore } from '@/stores/posStore';
import { api } from '@/services/api';
import { formatCurrency, cn, debounce, looksLikeScannedCode } from '@/lib/utils';
import { toast } from 'sonner';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { parseVoiceCommand } from './voiceCommands';
import { CameraScanner, isCameraScanSupported } from './CameraScanner';
import { MiscItemSheet } from './PosCart';
import { ProductThumb } from './ProductThumb';
import { addPackToCart, hasPack, unitStockLeft, presentForOffer, packLineFields, wouldExceedStock, packExceedsStock, AUTO_ADJUST_HINT, type PackInfo } from './packSale';

interface Product extends PackInfo {
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

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

interface PosProductPanelProps {
  onBarcodeSearch: (barcode: string) => Promise<boolean> | void;
  onCheckout?: () => void;
  className?: string;
  onProductAdded?: () => void;
}


/* ─── Bulk weight modal ───────────────────────────────────────────────────── */
// Precisión de pesaje: 1 gramo (0.001 kg). Con pasos de 10g el peso
// calculado podía desviar el cobro varios céntimos del monto pedido por el
// cliente (ej. S/2 de un producto a S/24/kg terminaba en S/1.92) — a 1g el
// desvío queda por debajo del céntimo para la enorme mayoría de precios.
const BULK_WEIGHT_STEP = 0.001;

function BulkModal({ product, onConfirm, onClose }: {
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {product.name}
            </h3>
            <p className="text-xs text-muted-foreground">{formatCurrency(price)} / {unit}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
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
      </div>
    </div>
  );
}

/* ─── Offers panel ────────────────────────────────────────────────────────── */
interface Offer {
  id: string; name: string; type: string; value: number;
  valueType: 'PERCENTAGE' | 'FIXED' | null;
  buyQuantity: number | null; getQuantity: number | null;
  isActive: boolean; storeBadge: string | null;
  products: Array<{ quantity?: number; asPack?: boolean; product: { id: string; name: string; salePrice: number; barcode: string | null; currentStock: number; imageUrl: string | null; isBulk: boolean; bulkUnit: string | null; isPack?: boolean; category: { name: string } } & PackInfo }>;
}

interface HappyHourPromo {
  id: string; name: string; value: number; valueType: 'PERCENTAGE' | 'FIXED' | null;
  priority: number;
  products: Array<{ product: { id: string; salePrice: number } }>;
}

function OffersPanel({ onClose }: { onClose: () => void }) {
  const addItem = usePosStore(s => s.addItem);

  const { data } = useQuery({
    queryKey: ['pos-offers'],
    queryFn: async () => (await api.get<{ data: Offer[] }>('/promotions?limit=50')).data.data,
    // Las promos sobre paquete/caja se presentan ya con el precio y el stock del
    // paquete (ver presentForOffer), así el resto del panel no distingue.
    select: d => d.filter(o => o.isActive).map(o => ({
      ...o,
      products: o.products.map(e => ({ ...e, product: presentForOffer(e.product, e.asPack) })),
    })),
  });

  const applyOffer = (offer: Offer, product: Offer['products'][0]['product']) => {
    const originalPrice = Number(product.salePrice);
    let finalPrice = originalPrice;
    let qty = 1;
    let label = offer.storeBadge ?? offer.name;

    if (offer.type === 'PERCENTAGE_DISCOUNT') {
      finalPrice = Math.round(originalPrice * (1 - offer.value / 100) * 100) / 100;
    } else if (offer.type === 'FIXED_DISCOUNT') {
      finalPrice = Math.max(0, Math.round((originalPrice - offer.value) * 100) / 100);
    } else if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
      const paidUnits = offer.buyQuantity ?? 2;
      const totalUnits = offer.getQuantity ?? 3;
      // Precio total del pack — sin dividir entre unidades para evitar redondeo
      const packPrice = offer.type === 'BUNDLE_PRICE'
        ? Number(offer.value)
        : Math.round(originalPrice * paidUnits * 100) / 100; // 2×5.20 = 10.40 exacto
      const packLabel = `${offer.storeBadge ?? offer.name} — pack de ${totalUnits}`;
      // Clave: la cantidad real que se agrega al carrito son las unidades
      // FÍSICAS del pack (totalUnits), no "1 pack" — si no, el stock queda
      // mal descontado (se resta 1 en vez de las 2-3 unidades reales que se
      // lleva el cliente) y el tope de stock disponible pierde sentido.
      if (product.currentStock < totalUnits) {
        toast.error(`No hay stock suficiente de "${product.name}" para esta oferta (necesita ${totalUnits}, disponible: ${product.currentStock}).`);
        return;
      }
      const unitEffectivePrice = Math.round((packPrice / totalUnits) * 100) / 100;
      const perUnitDiscount = Math.round((originalPrice - unitEffectivePrice) * 100) / 100;
      const packResult = addItem({
        ...packLineFields(product),
        name: `${product.name} (${packLabel})`,
        barcode: product.barcode,
        quantity: totalUnits,
        unitPrice: originalPrice,
        originalPrice,
        discountAmount: perUnitDiscount,
        discountPercent: 0,
        stock: product.currentStock,
        packSize: totalUnits,
      });
      if (packResult.addedQuantity <= 0) {
        toast.error(`No hay stock suficiente de "${product.name}" para otro paquete de ${totalUnits}.`);
        return;
      }
      if (packResult.capped) {
        toast.warning(`Solo se pudieron agregar ${packResult.addedQuantity} unidad(es) más de "${product.name}" — stock limitado.`);
      } else {
        toast.success(`${packLabel} agregado — ${formatCurrency(packPrice)}`);
      }
      return;
    }

    // Descuento simple (% o monto fijo): unitPrice = original, discountAmount = descuento
    const discountPerUnit = Math.round((originalPrice - finalPrice) * 100) / 100;
    const discountResult = addItem({
      ...packLineFields(product),
      name: `${product.name} (${label})`,
      barcode: product.barcode,
      quantity: 1,
      unitPrice: originalPrice,
      originalPrice,
      discountAmount: discountPerUnit,
      discountPercent: 0,
      stock: product.currentStock,
    });
    if (discountResult.addedQuantity <= 0) {
      toast.error(`"${product.name}" ya tiene todo el stock disponible en el carrito (${product.currentStock}).`);
      return;
    }
    toast.success(`${product.name} con oferta — ${formatCurrency(finalPrice)}`);
  };

  // Combo de productos DISTINTOS a un precio total fijo — a diferencia de
  // applyOffer(), aquí se agregan TODOS los componentes de una sola vez (el
  // combo no existe si falta uno), y el descuento se reparte entre ellos en
  // proporción a su precio normal para que la suma de subtotales dé
  // exactamente el precio del combo.
  const applyCombo = (offer: Offer) => {
    const comboTotal = Number(offer.value);
    const items = offer.products;
    for (const { quantity, product } of items) {
      const need = quantity ?? 1;
      if (product.currentStock < need) {
        toast.error(`No hay stock suficiente de "${product.name}" para este combo (necesita ${need}, disponible: ${product.currentStock}).`);
        return;
      }
    }
    const sumPrice = items.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
    if (sumPrice <= 0) return;
    const totalDiscount = Math.max(0, Math.round((sumPrice - comboTotal) * 100) / 100);

    let assignedDiscount = 0;
    let anyCapped = false;
    items.forEach(({ quantity, product }, idx) => {
      const qty = quantity ?? 1;
      const orig = Number(product.salePrice);
      const lineOriginal = orig * qty;
      const lineDiscount = idx === items.length - 1
        ? Math.round((totalDiscount - assignedDiscount) * 100) / 100
        : Math.round((totalDiscount * (lineOriginal / sumPrice)) * 100) / 100;
      assignedDiscount += lineDiscount;
      const perUnitDiscount = Math.round((lineDiscount / qty) * 100) / 100;

      const result = addItem({
        ...packLineFields(product),
        name: `${product.name} (${offer.storeBadge ?? offer.name})`,
        barcode: product.barcode,
        quantity: qty,
        unitPrice: orig,
        originalPrice: orig,
        discountAmount: perUnitDiscount,
        discountPercent: 0,
        stock: product.currentStock,
      });
      if (result.capped) anyCapped = true;
    });

    if (anyCapped) {
      toast.warning('Stock limitado en algún producto del combo — se agregó lo disponible.');
    } else {
      toast.success(`${offer.name} agregado — ${formatCurrency(comboTotal)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-bold flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />Ofertas activas
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {!data || data.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay ofertas activas</p>
          ) : data.map(offer => (
            <div key={offer.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{offer.name}</p>
                  <p className="text-xs text-success font-medium">
                    {offer.type === 'PERCENTAGE_DISCOUNT' ? `${offer.value}% OFF` :
                     offer.type === 'FIXED_DISCOUNT' ? `S/ ${offer.value} OFF` :
                     offer.type === 'BUY_X_GET_Y' ? `Lleva ${offer.getQuantity ?? 3}, paga ${offer.buyQuantity ?? 2}` :
                     offer.type === 'BUNDLE_PRICE' ? `${offer.getQuantity ?? '?'} x S/ ${offer.value}` :
                     offer.type === 'COMBO' ? `Combo por ${formatCurrency(offer.value)}` : 'Precio especial'}
                  </p>
                </div>
                {offer.storeBadge && <Badge variant="success" className="text-xs">{offer.storeBadge}</Badge>}
              </div>
              {offer.type === 'COMBO' && offer.products.length > 0 && (() => {
                const sumPrice = offer.products.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
                const missing = offer.products.filter(({ quantity, product }) => product.currentStock < (quantity ?? 1));
                return (
                  <div className="space-y-2">
                    <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-1">
                      {offer.products.map(({ quantity, product }) => (
                        <div key={product.id} className="flex items-center justify-between text-sm">
                          <span>{product.name}{(quantity ?? 1) > 1 ? ` x${quantity}` : ''}</span>
                          <span className="text-muted-foreground">{formatCurrency(Number(product.salePrice) * (quantity ?? 1))}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-sm font-bold border-t pt-1 mt-1">
                        <span className="line-through text-muted-foreground font-normal">{formatCurrency(sumPrice)}</span>
                        <span className="text-success">{formatCurrency(Number(offer.value))}</span>
                      </div>
                    </div>
                    {missing.length > 0 && (
                      <p className="text-xs text-destructive">Sin stock suficiente: {missing.map(m => m.product.name).join(', ')}</p>
                    )}
                    <Button size="sm" className="w-full" onClick={() => applyCombo(offer)} disabled={missing.length > 0}>
                      Agregar combo
                    </Button>
                  </div>
                );
              })()}
              {offer.type !== 'COMBO' && offer.products.length > 0 && (
                <div className="space-y-2">
                  {offer.products.map(({ product }) => {
                    const orig = Number(product.salePrice);
                    let finalPrice = orig;
                    let qty = 1;
                    let priceLabel = '';
                    let packsAvailable: number | null = null;

                    if (offer.type === 'PERCENTAGE_DISCOUNT') {
                      finalPrice = Math.round(orig * (1 - offer.value / 100) * 100) / 100;
                      priceLabel = `c/u con ${offer.value}% OFF`;
                    } else if (offer.type === 'FIXED_DISCOUNT') {
                      finalPrice = Math.max(0, Math.round((orig - offer.value) * 100) / 100);
                      priceLabel = `c/u con S/${offer.value} OFF`;
                    } else if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
                      const paidUnits = offer.buyQuantity ?? 2;
                      const totalUnits = offer.getQuantity ?? 3;
                      finalPrice = offer.type === 'BUNDLE_PRICE'
                        ? Math.round((offer.value / totalUnits) * 100) / 100
                        : Math.round((orig * paidUnits / totalUnits) * 100) / 100;
                      qty = totalUnits;
                      priceLabel = `c/u · agrega ${totalUnits} uds · total ${formatCurrency(finalPrice * totalUnits)}`;
                      // Cuántos paquetes completos alcanza el stock actual —
                      // esto es lo que antes el sistema no calculaba.
                      packsAvailable = Math.floor(product.currentStock / totalUnits);
                    }

                    return (
                      <div key={product.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{product.name}</p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="line-through text-muted-foreground">{formatCurrency(orig)}</span>
                            <span className="text-success font-bold">{formatCurrency(finalPrice)}</span>
                            {priceLabel && <span className="text-muted-foreground">{priceLabel}</span>}
                          </div>
                          {packsAvailable !== null && (
                            <p className={cn('text-xs mt-0.5', packsAvailable <= 0 ? 'text-destructive' : 'text-muted-foreground')}>
                              {packsAvailable <= 0 ? 'Sin stock para armar un paquete' : `Alcanza para ${packsAvailable} paquete${packsAvailable === 1 ? '' : 's'} (stock: ${product.currentStock})`}
                            </p>
                          )}
                        </div>
                        <Button size="sm" onClick={() => applyOffer(offer, product)} disabled={packsAvailable !== null && packsAvailable <= 0}>
                          Agregar {qty > 1 ? `(${qty}u)` : ''}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Piezas de la lista de productos ─────────────────────────────────────── */
function Chip({ active, onClick, icon, children }: { active?: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors lg:h-8 lg:px-3',
        active ? 'bg-foreground text-background' : 'bg-muted text-foreground/80 hover:bg-muted/70')}>
      {icon}{children}
    </button>
  );
}

function StockNote({ product, compact }: { product: Product; compact?: boolean }) {
  if (product.currentStock <= 0) return <span className="text-[12px] font-medium text-destructive">{compact ? 'Sin stock' : 'Sin stock · 2 toques vende igual'}</span>;
  if (product.currentStock <= 5) return <span className="text-[12px] font-medium text-amber-600 dark:text-amber-400">{product.currentStock === 1 ? 'Última unidad' : `Quedan ${product.currentStock}`}</span>;
  return null;
}

/** Botón "+" de la fila; con productos en el carrito muestra cuántos van. */
function AddButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.currentTarget.blur(); onClick(); }} aria-label="Agregar"
      className={cn('flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums transition-colors active:scale-95',
        count > 0 ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
      {count > 0 ? Number(count.toFixed(2)) : <Plus className="h-5 w-5" />}
    </button>
  );
}

export function PosProductPanel({ onBarcodeSearch, onCheckout, className }: PosProductPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  // Los productos a granel no tienen código de barras — el cajero no puede
  // simplemente escanearlos, así que este atajo les da acceso rápido sin
  // tener que buscarlos por nombre uno por uno (menestras, pan, fruta, etc.).
  const [bulkOnly, setBulkOnly] = useState(false);
  // Acceso rápido a los productos marcados como favoritos (típicamente los
  // que no traen código de fábrica en su empaque) — evita tener que buscarlos
  // por nombre uno por uno mientras el cliente espera.
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [bulkProduct, setBulkProduct] = useState<Product | null>(null);
  // El producto a granel se abrió con "vender aunque el sistema diga sin stock".
  const [bulkForce, setBulkForce] = useState(false);
  // Último toque en un producto sin stock en el sistema: el segundo toque
  // seguido lo vende igual (ver onTapNoStock).
  const lastTap = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const [showOffers, setShowOffers] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showMisc, setShowMisc] = useState(false);
  const hasFinePointer = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches, []);
  // Cuántas unidades de cada producto ya están en el carrito: se muestra en
  // la tarjeta para confirmar el toque sin tener que ir al carrito.
  const cartItems = usePosStore(s => s.items);
  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of cartItems) {
      if (i.sellAsPack) continue; // el paquete tiene su propio botón
      const id = i.productId.split('#')[0];
      m.set(id, (m.get(id) ?? 0) + i.quantity);
    }
    return m;
  }, [cartItems]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addItem = usePosStore((s) => s.addItem);
  const renameItem = usePosStore((s) => s.renameItem);

  const { data: categories } = useQuery({
    queryKey: ['pos-categories'],
    queryFn: async () => {
      const res = await api.get<{ data: Category[] }>('/products/categories');
      return res.data.data;
    },
    staleTime: Infinity,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: unknown) => setSearch(q as string), 300),
    [],
  );

  // La subcategoría manda si está elegida; si no, se filtra por la general
  // (el backend ya expande la general a todas sus subcategorías).
  const activeCategoryId = selectedSubcategory ?? selectedCategory;

  const activeCategoryNode = categories?.find((c) => c.id === selectedCategory);
  const subcategories = activeCategoryNode?.children ?? [];

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['pos-products', search, activeCategoryId, bulkOnly, favoriteOnly],
    queryFn: async () => {
      const params = new URLSearchParams({
        // A granel puede tener más de 48 productos en el catálogo — sin este
        // límite ampliado, el filtro se quedaba solo con los primeros 48
        // productos (orden alfabético) y "perdía" los que caían después.
        limit: bulkOnly || favoriteOnly ? '500' : '48',
        status: 'ACTIVE',
        ...(search ? { q: search } : {}),
        ...(activeCategoryId ? { categoryId: activeCategoryId } : {}),
        ...(bulkOnly ? { isBulk: 'true' } : {}),
        ...(favoriteOnly ? { favorite: 'true' } : {}),
      });
      const res = await api.get<{ data: Product[] }>(`/products?${params}`);
      return res.data.data;
    },
    staleTime: 30000,
  });

  const products = productsData ?? [];

  // Hora Feliz automática — se recalcula solo cada minuto para que el
  // descuento entre y salga sin que el cajero tenga que hacer nada.
  const { data: happyHours } = useQuery({
    queryKey: ['pos-happy-hours'],
    queryFn: async () => (await api.get<{ data: HappyHourPromo[] }>('/promotions/active-now')).data.data,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const happyHourByProductId = useMemo(() => {
    const map = new Map<string, { name: string; effectivePrice: number }>();
    for (const promo of happyHours ?? []) {
      for (const { product } of promo.products) {
        if (map.has(product.id)) continue; // ya asignado por una promo de mayor prioridad
        const orig = Number(product.salePrice);
        const effectivePrice = promo.valueType === 'FIXED'
          ? Math.max(0, Math.round((orig - promo.value) * 100) / 100)
          : Math.round(orig * (1 - promo.value / 100) * 100) / 100;
        map.set(product.id, { name: promo.name, effectivePrice });
      }
    }
    return map;
  }, [happyHours]);

  // force = vender aunque el sistema diga que no hay (doble toque): lo que
  // falte se marca para ajuste automático de inventario al cobrar.
  const handleAddProduct = (product: Product, forceQty?: number, force = false) => {
    const qty = forceQty ?? 1;
    const exceeds = wouldExceedStock(product.id, product.currentStock, product.packSize, qty);
    if (exceeds && !force) {
      toast.warning(`"${product.name}" figura sin stock en el sistema. ${AUTO_ADJUST_HINT}`, { duration: 3500 });
      return;
    }
    // Producto a granel — pedir peso/cantidad libre
    if (product.isBulk && forceQty === undefined) {
      setBulkForce(force);
      setBulkProduct(product);
      return;
    }
    const unit = product.isBulk ? (product.bulkUnit ?? 'u') : 'unidades';
    const originalPrice = Number(product.salePrice);
    const hh = happyHourByProductId.get(product.id);
    // unitPrice va siempre en precio de lista — calcItemSubtotal ya resta
    // discountAmount por su cuenta. Poner aquí el precio ya rebajado
    // duplicaría el descuento (se restaría dos veces).
    const discountAmount = hh ? Math.round((originalPrice - hh.effectivePrice) * 100) / 100 : 0;
    const result = addItem({
      productId: product.id,
      name: product.isBulk ? `${product.name} (${qty} ${unit})` : product.name,
      barcode: product.barcode,
      quantity: qty,
      unitPrice: originalPrice,
      originalPrice,
      discountAmount,
      discountPercent: 0,
      // Si ya hay paquetes de este producto en el carrito, esas unidades no están disponibles.
      stock: unitStockLeft(product.id, product.currentStock, product.packSize),
      bottleDepositUnit: Number(product.bottleDeposit ?? 0) || undefined,
      unit: product.isBulk ? (product.bulkUnit ?? 'kg') : undefined,
      autoAdjust: exceeds || undefined,
    });
    if (exceeds) {
      toast.warning(`${product.name}: sin stock en el sistema. Se vende igual y el inventario se ajusta al cobrar.`, { duration: 2500 });
    }
    // El nombre mostrado en el carrito incluye el peso para productos a
    // granel — si la cantidad terminó topada por el stock (o ya había algo
    // de este producto en el carrito), hay que corregirlo para que no quede
    // desfasado de la cantidad real cobrada.
    if (product.isBulk && result.finalQuantity !== qty) {
      renameItem(product.id, `${product.name} (${result.finalQuantity} ${unit})`);
    }
    if (result.capped) {
      if (result.addedQuantity <= 0) {
        toast.error(`No hay más stock de "${product.name}" disponible (máximo ${product.currentStock} ${unit}).`);
      } else {
        toast.warning(`Solo se agregaron ${result.finalQuantity} ${unit} de "${product.name}" — stock disponible: ${product.currentStock} ${unit}.`);
      }
    }
  };

  // Comandos de voz: "agregar dos gaseosas" agrega al carrito, "precio del
  // aceite" solo consulta sin agregar. Usa el mismo endpoint de búsqueda que
  // la grilla y toma la primera coincidencia — no hay desambiguación por voz.
  const handleVoiceResult = useCallback(async (transcript: string) => {
    const command = parseVoiceCommand(transcript);

    if (command.type === 'ADD_PRODUCT' || command.type === 'QUERY_PRICE') {
      if (!command.query) {
        toast.error('No entendí qué producto — intenta de nuevo.');
        return;
      }
      try {
        const res = await api.get<{ data: Product[] }>(
          `/products?limit=5&status=ACTIVE&q=${encodeURIComponent(command.query)}`,
        );
        const match = res.data.data[0];
        if (!match) {
          toast.error(`No encontré ningún producto para "${command.query}".`);
          return;
        }
        if (command.type === 'QUERY_PRICE') {
          toast.info(
            `${match.name}: ${formatCurrency(match.salePrice)}${match.currentStock <= 0 ? ' — sin stock' : ''}`,
            { duration: 4000 },
          );
        } else {
          handleAddProduct(match, match.isBulk ? undefined : command.quantity);
        }
      } catch {
        toast.error('No se pudo buscar el producto por voz.');
      }
      return;
    }

    if (command.type === 'REMOVE_PRODUCT') {
      if (!command.query) { toast.error('No entendí qué producto quitar.'); return; }
      const cartItems = usePosStore.getState().items;
      const q = command.query.toLowerCase();
      const found = cartItems.find((i) => i.name.toLowerCase().includes(q));
      if (!found) { toast.error(`No hay ningún "${command.query}" en el carrito.`); return; }
      usePosStore.getState().removeItem(found.productId);
      toast.success(`${found.name} quitado del carrito.`);
      return;
    }

    if (command.type === 'CLEAR_CART') {
      usePosStore.getState().clearCart();
      toast.success('Carrito vaciado.');
      return;
    }

    if (command.type === 'SET_PAYMENT_METHOD') {
      toast('Para cobrar, dilo dentro del carrito.', { duration: 3000 });
      return;
    }

    if (command.type === 'PRINT') {
      toast('Para imprimir, dilo cuando se muestre el ticket.', { duration: 3000 });
      return;
    }

    toast.error('No entendí el comando. Intenta: "agregar dos gaseosas", "precio del aceite" o "quitar la coca cola".');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isListening, toggle: toggleListening, isSupported: voiceSupported } = useVoiceRecognition({
    onResult: handleVoiceResult,
  });

  // Al usar un filtro (categoría, subcategoría, a granel, favoritos) se borra
  // la búsqueda por texto — si no, una búsqueda vieja ("limón") se sigue
  // combinando con el filtro nuevo y puede no devolver ningún resultado
  // aunque el filtro en sí sea correcto.
  const clearSearch = () => {
    setSearch('');
    if (searchInputRef.current) searchInputRef.current.value = '';
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Usar el valor actual del input, no el estado debounced (que puede ir
    // 300ms atrás y no reflejar el código recién escaneado).
    const value = e.currentTarget.value.trim();
    if (!value) return;
    // Si parece un código escaneado (de fábrica o interno PROxxx), agregarlo directo a la venta
    if (looksLikeScannedCode(value)) {
      onBarcodeSearch(value);
      setSearch('');
      e.currentTarget.value = '';
    }
  };

  const resetFilters = () => { clearSearch(); setSelectedCategory(null); setSelectedSubcategory(null); setBulkOnly(false); setFavoriteOnly(false); };
  const allActive = selectedCategory === null && !bulkOnly && !favoriteOnly;

  // Toque en un producto: si el sistema no tiene stock, el primer toque avisa
  // y el segundo seguido lo vende igual.
  const tapProduct = (product: Product) => {
    if (!wouldExceedStock(product.id, product.currentStock, product.packSize)) { handleAddProduct(product); return; }
    const now = Date.now();
    const second = lastTap.current.key === product.id && now - lastTap.current.at < 900;
    lastTap.current = second ? { key: '', at: 0 } : { key: product.id, at: now };
    handleAddProduct(product, undefined, second);
  };
  const tapPack = (product: Product) => {
    if (!packExceedsStock(product)) { addPackToCart(product); return; }
    const key = product.id + '#pack';
    const now = Date.now();
    const second = lastTap.current.key === key && now - lastTap.current.at < 900;
    lastTap.current = second ? { key: '', at: 0 } : { key, at: now };
    addPackToCart(product, { force: second });
  };

  return (
    <div className={cn('flex flex-col bg-card lg:bg-pos-bg', className)}>
      {/* Buscador + filtros */}
      <div className="space-y-3 bg-card px-4 pb-3 pt-3 lg:border-b lg:border-border/60">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Buscar producto o código"
              // En celular el foco automático abre el teclado y tapa la mitad
              // de la pantalla: solo se enfoca solo en equipos con mouse.
              autoFocus={hasFinePointer}
              enterKeyHint="search"
              onChange={(e) => debouncedSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={cn(
                'h-11 w-full rounded-xl bg-muted pl-11 text-[15px] outline-none placeholder:text-muted-foreground/80',
                'focus:bg-card focus:ring-2 focus:ring-primary/40 lg:h-10 lg:bg-muted/70 lg:text-sm',
                voiceSupported ? 'pr-11' : 'pr-3',
              )}
            />
            {voiceSupported && (
              <button
                type="button" onClick={toggleListening}
                title={isListening ? 'Toca para apagar el micrófono' : 'Decir "agregar dos gaseosas", "precio del aceite", "quitar la coca cola"...'}
                aria-label="Comando de voz"
                className={cn('absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground',
                  isListening && 'animate-pulse text-destructive')}>
                <Mic className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
          {isCameraScanSupported() && (
            <button
              onClick={() => setShowCamera(true)}
              title="Escanear códigos de barra con la cámara"
              aria-label="Escanear con la cámara"
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95 lg:h-10 lg:w-auto lg:px-4 lg:text-sm lg:font-medium">
              <ScanBarcode className="h-5 w-5" /><span className="hidden lg:inline">Cámara</span>
            </button>
          )}
        </div>

        {/* Filtros: píldoras sin borde; la activa en tinta oscura */}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 h-scroll">
          <Chip active={allActive} onClick={resetFilters}>Todos</Chip>
          <Chip onClick={() => setShowOffers(true)} icon={<Tag className="h-3.5 w-3.5 text-[#d6006c]" />}>Ofertas</Chip>
          <Chip active={favoriteOnly} onClick={() => { clearSearch(); setFavoriteOnly((v) => !v); }} icon={<Star className="h-3.5 w-3.5" />}>Favoritos</Chip>
          <Chip active={bulkOnly} onClick={() => { clearSearch(); setBulkOnly((v) => !v); }}>A granel</Chip>
          <Chip onClick={() => setShowMisc(true)} icon={<Plus className="h-3.5 w-3.5" />}>Manual</Chip>
          <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-border" />
          {categories?.map((cat) => (
            <Chip key={cat.id} active={selectedCategory === cat.id}
              onClick={() => { clearSearch(); setSelectedCategory(cat.id); setSelectedSubcategory(null); }}>
              {cat.name}
            </Chip>
          ))}
        </div>
        {/* Subcategorías de la categoría general seleccionada */}
        {subcategories.length > 0 && (
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 text-[13px] h-scroll">
            {[{ id: null as string | null, name: 'Todas' }, ...subcategories].map((sub) => (
              <button key={sub.id ?? 'all'}
                onClick={() => { clearSearch(); setSelectedSubcategory(sub.id); }}
                className={cn('shrink-0 border-b-2 pb-1 font-medium transition-colors',
                  selectedSubcategory === sub.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground')}>
                {sub.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Productos: lista en celular, grilla en PC/tablet */}
      <div className="flex-1 overflow-y-auto pb-4 sm:pt-3 lg:p-4">
        {isLoading ? (
          <div className="space-y-px px-4 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0 md:grid-cols-4 lg:px-0 xl:grid-cols-5">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/70 sm:h-36" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Package className="h-10 w-10 opacity-25" />
            <p className="text-sm">No se encontraron productos</p>
          </div>
        ) : (
          <>
            {/* Celular: filas */}
            <ul className="divide-y divide-border/60 sm:hidden">
              {products.map((product) => {
                const hh = happyHourByProductId.get(product.id);
                const inCart = qtyInCart.get(product.id) ?? 0;
                const packOn = hasPack(product) && !product.isBulk;
                return (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                      onClick={(e) => { e.currentTarget.blur(); tapProduct(product); }}>
                      <ProductThumb name={product.name} imageUrl={product.imageUrl} className="h-12 w-12" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] font-medium leading-snug">{product.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <span className="font-semibold tabular-nums">{formatCurrency(hh ? hh.effectivePrice : product.salePrice)}</span>
                          {product.isBulk && <span className="text-muted-foreground">por {product.bulkUnit ?? 'kg'}</span>}
                          {hh && <span className="text-muted-foreground line-through tabular-nums">{formatCurrency(product.salePrice)}</span>}
                          <StockNote product={product} />
                        </span>
                      </span>
                    </button>
                    {packOn && (
                      <button onClick={(e) => { e.currentTarget.blur(); tapPack(product); }}
                        title={`Agregar ${(product.packLabel || 'paquete').toLowerCase()} de ${product.packSize} unidades`}
                        className="shrink-0 rounded-lg bg-muted px-2 py-1.5 text-center text-[11px] font-medium leading-tight active:scale-95">
                        {product.packLabel || 'Paq'} x{product.packSize}<br />
                        <span className="font-semibold tabular-nums">{formatCurrency(Number(product.packPrice))}</span>
                      </button>
                    )}
                    <AddButton count={inCart} onClick={() => tapProduct(product)} />
                  </li>
                );
              })}
            </ul>

            {/* Tablet / PC: grilla compacta */}
            <div className="hidden gap-3 px-4 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:px-0 xl:grid-cols-5 2xl:grid-cols-6">
              {products.map((product) => {
                const hh = happyHourByProductId.get(product.id);
                const inCart = qtyInCart.get(product.id) ?? 0;
                const packOn = hasPack(product) && !product.isBulk;
                const packOk = packOn && product.currentStock >= (product.packSize ?? 0);
                return (
                  <div key={product.id} className={cn(
                    'group flex flex-col rounded-xl bg-card p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:ring-white/5',
                    inCart > 0 && 'ring-2 ring-primary/50',
                  )}>
                    <button className="flex flex-1 flex-col text-left focus-visible:outline-none"
                      onClick={(e) => { e.currentTarget.blur(); tapProduct(product); }}>
                      {product.imageUrl && <ProductThumb name={product.name} imageUrl={product.imageUrl} className="mb-2 h-20 w-full lg:h-16" />}
                      <span className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-tight">{product.name}</span>
                      <span className="mt-1.5 flex items-center justify-between gap-1">
                        <span className="min-w-0 truncate text-sm font-semibold tabular-nums">
                          {formatCurrency(hh ? hh.effectivePrice : product.salePrice)}
                          {product.isBulk && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{product.bulkUnit ?? 'kg'}</span>}
                        </span>
                        {inCart > 0
                          ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">{Number(inCart.toFixed(2))}</span>
                          : <StockNote product={product} compact />}
                      </span>
                      {hh && <span className="mt-0.5 text-[11px] text-primary">Hora feliz · antes <span className="line-through">{formatCurrency(product.salePrice)}</span></span>}
                    </button>
                    {packOn && (
                      <button onClick={(e) => { e.currentTarget.blur(); tapPack(product); }}
                        title={`Agregar ${(product.packLabel || 'paquete').toLowerCase()} de ${product.packSize} unidades`}
                        className={cn('mt-2 flex items-center justify-between rounded-lg bg-muted/70 px-2 py-1 text-[11px] font-medium hover:bg-muted', !packOk && 'opacity-50')}>
                        <span className="truncate">{product.packLabel || 'Paq'} x{product.packSize}</span>
                        <span className="font-semibold tabular-nums">{formatCurrency(Number(product.packPrice))}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pie con atajos (solo PC) */}
      <div className="hidden items-center justify-between border-t border-border/60 bg-card px-4 py-2 text-xs text-muted-foreground lg:flex">
        <span>{products.length} productos</span>
        <span className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3" />Enter en la búsqueda agrega por código</span>
      </div>

      {/* Modales */}
      {bulkProduct && (
        <BulkModal
          product={bulkProduct}
          onConfirm={(qty) => handleAddProduct(bulkProduct, qty, bulkForce)}
          onClose={() => setBulkProduct(null)}
        />
      )}
      {showOffers && <OffersPanel onClose={() => setShowOffers(false)} />}
      {showMisc && <MiscItemSheet onClose={() => setShowMisc(false)} />}
      {showCamera && (
        <CameraScanner
          onDetected={async (code) => (await onBarcodeSearch(code)) !== false}
          onClose={() => setShowCamera(false)}
          onCheckout={onCheckout ? () => { setShowCamera(false); onCheckout(); } : undefined}
        />
      )}
    </div>
  );
}
