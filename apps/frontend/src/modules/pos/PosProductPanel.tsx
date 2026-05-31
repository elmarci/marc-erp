import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, AlertCircle } from 'lucide-react';
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

export function PosProductPanel({ onBarcodeSearch, className }: PosProductPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

  const debouncedSearch = useCallback(
    debounce((q: string) => setSearch(q), 300),
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

  const handleAddProduct = (product: Product) => {
    if (product.currentStock <= 0) {
      toast.error(`"${product.name}" no tiene stock disponible.`);
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: 1,
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
      {/* Barra de búsqueda */}
      <div className="border-b p-3">
        <Input
          ref={searchInputRef}
          startIcon={<Search className="h-4 w-4" />}
          placeholder="Buscar producto o escanear código de barras... (F1)"
          autoFocus
          onChange={(e) => debouncedSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="bg-background"
        />
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

                {/* Precio */}
                <p className="mt-1 text-sm font-bold text-primary">
                  {formatCurrency(product.salePrice)}
                </p>

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
          <span>{products.length} productos</span>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            <span>Enter en búsqueda para agregar por código</span>
          </div>
        </div>
      </div>
    </div>
  );
}
