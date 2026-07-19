import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Package, Edit, MoreVertical, AlertTriangle, Barcode } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  internalCode: string | null;
  salePrice: number;
  costPrice: number;
  currentStock: number;
  minStock: number;
  status: string;
  imageUrl: string | null;
  category: { name: string };
  brand: { name: string } | null;
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { hasMinRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const page = parseInt(searchParams.get('page') ?? '1');
  const lowStock = searchParams.get('lowStock') === 'true';

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page, lowStock],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(search ? { q: search } : {}),
        ...(lowStock ? { lowStock: 'true' } : {}),
      });
      const res = await api.get<{ data: Product[]; pagination: { total: number; totalPages: number } }>(
        `/products?${params}`,
      );
      return res.data;
    },
  });

  const products = data?.data ?? [];
  const pagination = data?.pagination;

  const handleSearch = (q: string) => {
    setSearch(q);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('q', q);
      else next.delete('q');
      next.set('page', '1');
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {pagination ? `${pagination.total} productos en total` : 'Gestión de inventario'}
          </p>
        </div>
        {hasMinRole('WAREHOUSE') && (
          <Link to="/products/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Producto
            </Button>
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            startIcon={<Search className="h-4 w-4" />}
            placeholder="Buscar por nombre, código de barras o código interno..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <Button
          variant={lowStock ? 'default' : 'outline'}
          onClick={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (lowStock) next.delete('lowStock');
              else next.set('lowStock', 'true');
              return next;
            });
          }}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Stock Bajo
        </Button>
      </div>

      {/* Tabla de productos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando productos...</div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <Package className="h-12 w-12 opacity-20" />
              <p>No se encontraron productos</p>
              {hasMinRole('WAREHOUSE') && (
                <Link to="/products/new">
                  <Button size="sm">Crear primer producto</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Producto</th>
                    <th className="px-4 py-3 text-left font-medium col-md">Categoría</th>
                    <th className="px-4 py-3 text-right font-medium col-lg">Costo</th>
                    <th className="px-4 py-3 text-right font-medium">Precio</th>
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3 text-center font-medium col-md">Estado</th>
                    <th className="px-4 py-3 text-center font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      <td data-label="Producto" className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted overflow-hidden">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.barcode && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Barcode className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-mono text-muted-foreground">{product.barcode}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Categoría" className="px-4 py-3 text-muted-foreground col-md">{product.category.name}</td>
                      <td data-label="Costo" className="px-4 py-3 text-right col-lg">{formatCurrency(product.costPrice)}</td>
                      <td data-label="Precio" className="px-4 py-3 text-right font-semibold">{formatCurrency(product.salePrice)}</td>
                      <td data-label="Stock" className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-semibold',
                          product.currentStock <= 0 ? 'text-destructive' :
                          product.currentStock <= product.minStock ? 'text-warning' : 'text-foreground',
                        )}>
                          {product.currentStock}
                        </span>
                        {product.currentStock <= product.minStock && product.currentStock > 0 && (
                          <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-warning" />
                        )}
                      </td>
                      <td data-label="Estado" className="px-4 py-3 text-center col-md">
                        <Badge variant={product.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {product.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td data-label="Acciones" className="px-4 py-3 text-center">
                        {hasMinRole('WAREHOUSE') && (
                          <Link to={`/products/${product.id}/edit`}>
                            <Button variant="ghost" size="icon-sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginación */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n; })}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages}
              onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n; })}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
