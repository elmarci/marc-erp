import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, AlertCircle, Scale, Tag, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePosStore } from '@/stores/posStore';
import { api } from '@/services/api';
import { formatCurrency, cn, debounce } from '@/lib/utils';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  currentStock: number;
  imageUrl: string | null;
  isBulk: boolean;
  bulkUnit: string | null;
  category: { name: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PosProductPanelProps {
  onBarcodeSearch: (barcode: string) => void;
  className?: string;
}

/* ─── Bulk weight modal ───────────────────────────────────────────────────── */
function BulkModal({ product, onConfirm, onClose }: {
  product: Product;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState('');
  const unit = product.bulkUnit ?? 'unidad';
  const price = Number(product.salePrice);
  const total = parseFloat(qty) * price;

  const presets = unit === 'kg' || unit === 'g' || unit === 'L'
    ? [0.25, 0.5, 0.75, 1, 1.5, 2]
    : [1, 2, 3, 5, 10];

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
            {presets.map(p => (
              <button key={p} onClick={() => setQty(String(p))}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-xs font-medium transition-colors">
                {p} {unit}
              </button>
            ))}
          </div>
          {qty && parseFloat(qty) > 0 && (
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total a cobrar</p>
              <p className="text-2xl font-black text-primary">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">{qty} {unit} × {formatCurrency(price)}</p>
            </div>
          )}
        </div>
        <div className="border-t p-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1"
            disabled={!qty || parseFloat(qty) <= 0}
            onClick={() => { onConfirm(parseFloat(qty)); onClose(); }}>
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
  isActive: boolean; storeBadge: string | null;
  products: Array<{ product: { id: string; name: string; salePrice: number; barcode: string | null; currentStock: number; imageUrl: string | null; isBulk: boolean; bulkUnit: string | null; category: { name: string } } }>;
}

function OffersPanel({ onClose }: { onClose: () => void }) {
  const addItem = usePosStore(s => s.addItem);

  const { data } = useQuery({
    queryKey: ['pos-offers'],
    queryFn: async () => (await api.get<{ data: Offer[] }>('/promotions?limit=50')).data.data,
    select: d => d.filter(o => o.isActive),
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
      const paidUnits = (offer as {buyQuantity?:number}).buyQuantity ?? 2;
      const totalUnits = (offer as {getQuantity?:number}).getQuantity ?? 3;
      if (offer.type === 'BUNDLE_PRICE') {
        // precio fijo del paquete
        finalPrice = Math.round((offer.value / totalUnits) * 100) / 100;
      } else {
        finalPrice = Math.round((originalPrice * paidUnits / totalUnits) * 100) / 100;
      }
      qty = totalUnits;
      label = `${offer.storeBadge ?? offer.name} (${totalUnits}×${paidUnits})`;
    }

    addItem({
      productId: product.id,
      name: `${product.name} (${label})`,
      barcode: product.barcode,
      quantity: qty,
      unitPrice: finalPrice,
      originalPrice,
      discountAmount: Math.round((originalPrice - finalPrice) * 100) / 100,
      discountPercent: 0,
      stock: product.currentStock,
    });
    const total = formatCurrency(finalPrice * qty);
    toast.success(`${product.name} con oferta agregado — ${total}`);
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
                     offer.type === 'BUY_X_GET_Y' ? `Lleva ${(offer as {getQuantity?:number}).getQuantity ?? 3}, paga ${(offer as {buyQuantity?:number}).buyQuantity ?? 2}` :
                     offer.type === 'BUNDLE_PRICE' ? `Pack a S/ ${offer.value}` : 'Precio especial'}
                  </p>
                </div>
                {offer.storeBadge && <Badge variant="success" className="text-xs">{offer.storeBadge}</Badge>}
              </div>
              {offer.products.length > 0 && (
                <div className="space-y-2">
                  {offer.products.map(({ product }) => {
                    const orig = Number(product.salePrice);
                    let finalPrice = orig;
                    let qty = 1;
                    let priceLabel = '';

                    if (offer.type === 'PERCENTAGE_DISCOUNT') {
                      finalPrice = Math.round(orig * (1 - offer.value / 100) * 100) / 100;
                      priceLabel = `c/u con ${offer.value}% OFF`;
                    } else if (offer.type === 'FIXED_DISCOUNT') {
                      finalPrice = Math.max(0, Math.round((orig - offer.value) * 100) / 100);
                      priceLabel = `c/u con S/${offer.value} OFF`;
                    } else if (offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE') {
                      const paidUnits = (offer as {buyQuantity?:number}).buyQuantity ?? 2;
                      const totalUnits = (offer as {getQuantity?:number}).getQuantity ?? 3;
                      finalPrice = offer.type === 'BUNDLE_PRICE'
                        ? Math.round((offer.value / totalUnits) * 100) / 100
                        : Math.round((orig * paidUnits / totalUnits) * 100) / 100;
                      qty = totalUnits;
                      priceLabel = `c/u · agrega ${totalUnits} uds · total ${formatCurrency(finalPrice * totalUnits)}`;
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
                        </div>
                        <Button size="sm" onClick={() => applyOffer(offer, product)}>
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

export function PosProductPanel({ onBarcodeSearch, className }: PosProductPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [bulkProduct, setBulkProduct] = useState<Product | null>(null);
  const [showOffers, setShowOffers] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addItem = usePosStore((s) => s.addItem);

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

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['pos-products', search, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '48',
        status: 'ACTIVE',
        ...(search ? { q: search } : {}),
        ...(selectedCategory ? { categoryId: selectedCategory } : {}),
      });
      const res = await api.get<{ data: Product[] }>(`/products?${params}`);
      return res.data.data;
    },
    staleTime: 30000,
  });

  const products = productsData ?? [];

  const handleAddProduct = (product: Product, forceQty?: number) => {
    if (product.currentStock <= 0) {
      toast.error(`"${product.name}" no tiene stock disponible.`);
      return;
    }
    // Producto a granel — pedir peso/cantidad libre
    if (product.isBulk && forceQty === undefined) {
      setBulkProduct(product);
      return;
    }
    const qty = forceQty ?? 1;
    addItem({
      productId: product.id,
      name: product.isBulk ? `${product.name} (${qty} ${product.bulkUnit ?? 'u'})` : product.name,
      barcode: product.barcode,
      quantity: qty,
      unitPrice: Number(product.salePrice),
      originalPrice: Number(product.salePrice),
      discountAmount: 0,
      discountPercent: 0,
      stock: product.currentStock,
    });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      // Si parece código de barras (solo números, longitud >= 8), buscar por barcode
      if (/^\d{8,}$/.test(search.trim())) {
        onBarcodeSearch(search.trim());
        setSearch('');
        if (searchInputRef.current) searchInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={cn('flex flex-col bg-pos-product', className)}>
      {/* Barra de búsqueda + botón ofertas */}
      <div className="border-b p-3 flex gap-2">
        <div className="flex-1">
          <Input
            ref={searchInputRef}
            startIcon={<Search className="h-4 w-4" />}
            placeholder="Buscar producto o escanear código... (F1)"
            autoFocus
            onChange={(e) => debouncedSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="bg-background"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowOffers(true)}
          className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
          <Tag className="h-4 w-4" />Ofertas
        </Button>
      </div>

      {/* Filtros de categoría */}
      {categories && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b px-3 py-2">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            className="shrink-0 h-7 text-xs"
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 h-7 text-xs"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      )}

      {/* Grid de productos */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Package className="h-12 w-12 opacity-20" />
            <p className="text-sm">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => handleAddProduct(product)}
                disabled={product.currentStock <= 0}
                className={cn(
                  'relative flex flex-col rounded-lg border p-3 text-left transition-all',
                  'hover:border-primary hover:shadow-md active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  product.currentStock <= 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer bg-pos-product',
                )}
              >
                {/* Imagen o placeholder */}
                <div className="mb-2 flex h-10 w-full items-center justify-center rounded bg-muted">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>

                {/* Nombre */}
                <p className="line-clamp-2 text-xs font-medium leading-tight">{product.name}</p>

                {/* Precio + bulk badge */}
                <div className="mt-1 flex items-center gap-1">
                  <p className="text-sm font-bold text-primary">
                    {formatCurrency(product.salePrice)}
                    {product.isBulk && <span className="text-[10px] font-normal text-muted-foreground">/{product.bulkUnit ?? 'u'}</span>}
                  </p>
                </div>
                {product.isBulk && (
                  <div className="absolute left-1 top-1">
                    <Scale className="h-3 w-3 text-primary/60" />
                  </div>
                )}

                {/* Stock badge */}
                {product.currentStock <= 5 && product.currentStock > 0 && (
                  <Badge variant="warning" className="absolute right-1 top-1 text-[10px] px-1 py-0">
                    {product.currentStock}
                  </Badge>
                )}
                {product.currentStock <= 0 && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60">
                    <span className="text-xs font-bold text-destructive">Sin stock</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer con atajos */}
      <div className="border-t px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{products.length} productos · <Scale className="inline h-3 w-3" /> = a granel</span>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            <span>Enter en búsqueda para agregar por código</span>
          </div>
        </div>
      </div>

      {/* Modales */}
      {bulkProduct && (
        <BulkModal
          product={bulkProduct}
          onConfirm={(qty) => handleAddProduct(bulkProduct, qty)}
          onClose={() => setBulkProduct(null)}
        />
      )}
      {showOffers && <OffersPanel onClose={() => setShowOffers(false)} />}
    </div>
  );
}
