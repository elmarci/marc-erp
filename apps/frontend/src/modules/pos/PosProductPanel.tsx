import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, AlertCircle, Tag, Mic, Star, ScanBarcode, Plus } from 'lucide-react';
import { usePosStore } from '@/stores/posStore';
import { api } from '@/services/api';
import { formatCurrency, cn, debounce, looksLikeScannedCode } from '@/lib/utils';
import { toast } from 'sonner';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { parseVoiceCommand } from './voiceCommands';
import { CameraScanner, isCameraScanSupported } from './CameraScanner';
import { MiscItemSheet } from './CartModals';
import { useAutoOffers } from './autoOffers';
import { OffersBrowser } from './OffersBrowser';
import { OfferSuggestions } from './OfferSuggestions';
import { addPackToCart, unitStockLeft, wouldExceedStock, packExceedsStock, AUTO_ADJUST_HINT } from './packSale';
import { BulkModal, Chip, type Product } from './ProductParts';
import { ProductResults } from './ProductResults';

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
  /** PC/tablet: muestra arriba de la grilla las ofertas que aplican a la venta. */
  suggestOffers?: boolean;
}


export function PosProductPanel({ onBarcodeSearch, onCheckout, className, suggestOffers }: PosProductPanelProps) {
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
  // Pantalla de ofertas (buscador + filtros), dentro del mismo punto de venta.
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

  // Descuentos automáticos (Hora feliz + ofertas de % o monto vigentes): se
  // aplican solos al tocar o escanear, sin que el cajero tenga que buscarlos.
  const { deals: happyHourByProductId, tags: offerTags, offers } = useAutoOffers();

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
                'h-11 w-full rounded-xl bg-muted pl-11 text-sm outline-none placeholder:text-muted-foreground/80',
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
          <Chip onClick={() => setShowOffers(true)}
            icon={<Tag className="h-3.5 w-3.5" />}>Ofertas{offers.length > 0 && <span className="tabular-nums opacity-70">{offers.length}</span>}</Chip>
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
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 text-sm h-scroll">
            {[{ id: null as string | null, name: 'Todas' }, ...subcategories].map((sub) => (
              <button key={sub.id ?? 'all'}
                onClick={() => { clearSearch(); setSelectedSubcategory(sub.id); }}
                className={cn('shrink-0 border-b-2 pb-1 font-medium transition-colors',
                  selectedSubcategory === sub.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
                {sub.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {suggestOffers && <OfferSuggestions onSeeAll={() => setShowOffers(true)} className="px-4 pt-3" />}

      {/* Productos: lista en celular, grilla en PC/tablet */}
      <ProductResults products={products} isLoading={isLoading} qtyInCart={qtyInCart}
        happyHourByProductId={happyHourByProductId} offerTags={offerTags} tapProduct={tapProduct} tapPack={tapPack} />

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
            {showOffers && <OffersBrowser onClose={() => setShowOffers(false)} />}
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
