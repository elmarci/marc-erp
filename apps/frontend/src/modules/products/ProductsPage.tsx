import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Package, Edit, AlertTriangle, Barcode, Trash2, Printer, X, ArrowUpDown, CheckSquare, Square, Star, FileText } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

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
  isBulk?: boolean;
  isFavorite?: boolean;
  category: { id: string; name: string; parent?: { name: string } | null };
  brand: { name: string } | null;
}

interface CategoryNode {
  id: string;
  name: string;
  children?: Array<{ id: string; name: string }>;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
  { value: 'DISCONTINUED', label: 'Descontinuado' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'Nombre' },
  { value: 'salePrice', label: 'Precio' },
  { value: 'currentStock', label: 'Stock' },
  { value: 'createdAt', label: 'Más reciente' },
];

/* ─── Selector de categoría (árbol con subcategorías) ────────────────────── */
function CategoryTreeSelect({ categories, value, onChange, allowEmpty = true, emptyLabel = 'Todas las categorías' }: {
  categories: CategoryNode[]; value: string; onChange: (id: string) => void;
  allowEmpty?: boolean; emptyLabel?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {categories.map((c) => (
        c.children && c.children.length > 0 ? (
          <optgroup key={c.id} label={c.name}>
            <option value={c.id}>{c.name} (general)</option>
            {c.children.map((ch) => <option key={ch.id} value={ch.id}>— {ch.name}</option>)}
          </optgroup>
        ) : (
          <option key={c.id} value={c.id}>{c.name}</option>
        )
      ))}
    </select>
  );
}

/* ─── Impresión de catálogo de códigos de barra ──────────────────────────── */
function barcodeSvgMarkup(value: string): string {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, { format: 'CODE128', width: 2, height: 45, displayValue: true, fontSize: 13, margin: 4 });
    return svg.outerHTML;
  } catch {
    return `<p style="font-size:11px">${value}</p>`;
  }
}

function printBarcodeCatalog(products: Array<{ name: string; barcode: string; salePrice: number }>) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;
  const cards = products.map(p => `
    <div class="card">
      <p class="name">${p.name}</p>
      ${barcodeSvgMarkup(p.barcode)}
      <p class="price">S/ ${Number(p.salePrice).toFixed(2)}</p>
    </div>`).join('');
  win.document.write(`<html><head><title>Catálogo de códigos de barra</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; padding: 12px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .card { border: 1px dashed #999; border-radius: 6px; padding: 8px; text-align: center; page-break-inside: avoid; }
      .name { font-size: 12px; font-weight: bold; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .price { font-size: 13px; font-weight: bold; margin-top: 2px; }
      svg { max-width: 100%; }
    </style></head><body>
    <div class="grid">${cards}</div>
    </body></html>`);
  win.document.close(); win.focus(); win.print();
}

/* ─── Impresión de lista de precios (A4, para dejar con los cajeros) ────── */
function printPriceList(products: Array<{
  name: string; internalCode: string | null; barcode: string | null; salePrice: number;
  currentStock: number; category: { name: string; parent?: { name: string } | null };
}>) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  const rows = products.map((p, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="code">${p.internalCode ?? p.barcode ?? '—'}</td>
      <td>${p.name}</td>
      <td class="muted">${p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name}</td>
      <td class="right price">S/ ${Number(p.salePrice).toFixed(2)}</td>
      <td class="right">${p.currentStock}</td>
    </tr>`).join('');
  const now = new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
  win.document.write(`<html><head><title>Lista de Precios</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A4; margin: 14mm 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color:#111; }
      header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:14px; }
      h1 { font-size:20px; letter-spacing:.02em; }
      .meta { font-size:11px; color:#555; text-align:right; line-height:1.5; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      thead th { text-align:left; background:#111; color:#fff; padding:7px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
      td { padding:5px 8px; border-bottom:1px solid #ddd; }
      tr.even td { background:#f4f4f4; }
      tbody tr { page-break-inside: avoid; }
      .code { font-family: 'Courier New', monospace; font-weight:bold; white-space:nowrap; }
      .right { text-align:right; }
      .price { font-weight:bold; }
      .muted { color:#666; }
      footer { margin-top:12px; font-size:10px; color:#888; text-align:right; }
    </style></head><body>
    <header>
      <h1>Lista de Precios</h1>
      <div class="meta">Generado: ${now}<br/>${products.length} producto(s)</div>
    </header>
    <table>
      <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="right">Precio</th><th class="right">Stock</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>ERP Minimarket</footer>
    </body></html>`);
  win.document.close(); win.focus(); win.print();
}

function BarcodeCatalogModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: allProducts, isLoading } = useQuery({
    queryKey: ['products-barcode-catalog'],
    queryFn: async () => (await api.get<{ data: Product[] }>('/products?limit=100')).data.data,
  });

  const filtered = (allProducts ?? []).filter(p => {
    if (onlyMissing && p.barcode) return false;
    if (debouncedSearch && !p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => setSelected(v => {
    const next = new Set(v);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected(v =>
    v.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));

  const generateMutation = useMutation({
    mutationFn: (productIds: string[]) => api.post<{ data: Array<{ id: string; barcode: string }> }>('/products/generate-barcodes-bulk', { productIds }),
  });

  const handlePrint = async () => {
    const chosen = (allProducts ?? []).filter(p => selected.has(p.id));
    const needCodes = chosen.filter(p => !p.barcode).map(p => p.id);

    let generated: Array<{ id: string; barcode: string }> = [];
    if (needCodes.length > 0) {
      try {
        generated = (await generateMutation.mutateAsync(needCodes)).data.data;
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['products-barcode-catalog'] });
      } catch (err) {
        toast.error(getErrorMessage(err));
        return;
      }
    }
    const codeById = new Map(generated.map(g => [g.id, g.barcode]));
    const toPrint = chosen.map(p => ({
      name: p.name,
      salePrice: p.salePrice,
      barcode: p.barcode ?? codeById.get(p.id) ?? '',
    })).filter(p => p.barcode);

    if (toPrint.length === 0) { toast.error('No hay productos seleccionados con código.'); return; }
    printBarcodeCatalog(toPrint);
    toast.success(`Catálogo generado con ${toPrint.length} producto(s).`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Barcode className="h-5 w-5 text-primary" />Imprimir catálogo de códigos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Elige productos sin código (por ejemplo, a granel) — se les asigna uno interno automáticamente al imprimir.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-3 border-b">
          <Input startIcon={<Search className="h-4 w-4" />} placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Solo productos sin código de barras
            </label>
            <button onClick={toggleAll} className="text-primary hover:underline">
              {selected.size === filtered.length && filtered.length > 0 ? 'Deseleccionar todos' : `Seleccionar todos (${filtered.length})`}
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando productos...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No hay productos que coincidan.</div>
          ) : filtered.map(p => (
            <label key={p.id} className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-input" />
              <span className="flex-1 text-sm">{p.name}</span>
              {p.isBulk && <Badge variant="secondary" className="text-xs">Granel</Badge>}
              {p.barcode ? (
                <span className="text-xs font-mono text-muted-foreground">{p.barcode}</span>
              ) : (
                <span className="text-xs text-amber-600">Sin código — se generará</span>
              )}
            </label>
          ))}
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handlePrint} loading={generateMutation.isPending} disabled={selected.size === 0}>
            <Printer className="mr-2 h-4 w-4" />Generar e imprimir ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Barra de acciones masivas ──────────────────────────────────────────── */
function BulkActionBar({ count, categories, onAssignCategory, onSetStatus, onClear, loading }: {
  count: number; categories: CategoryNode[];
  onAssignCategory: (categoryId: string) => void;
  onSetStatus: (status: string) => void;
  onClear: () => void;
  loading: boolean;
}) {
  const [bulkCategoryId, setBulkCategoryId] = useState('');

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3">
      <span className="text-sm font-semibold">{count} seleccionado{count !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <CategoryTreeSelect categories={categories} value={bulkCategoryId} onChange={setBulkCategoryId}
          emptyLabel="Asignar categoría..." />
        <Button size="sm" disabled={!bulkCategoryId || loading} loading={loading}
          onClick={() => { onAssignCategory(bulkCategoryId); setBulkCategoryId(''); }}>
          Aplicar
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={loading} onClick={() => onSetStatus('ACTIVE')}>Activar</Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => onSetStatus('INACTIVE')}>Desactivar</Button>
      </div>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X className="mr-1.5 h-3.5 w-3.5" />Cancelar selección
      </Button>
    </div>
  );
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { hasMinRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const page = parseInt(searchParams.get('page') ?? '1');
  const lowStock = searchParams.get('lowStock') === 'true';
  const favorite = searchParams.get('favorite') === 'true';
  const categoryId = searchParams.get('categoryId') ?? '';
  const status = searchParams.get('status') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'name';
  const sortOrder = searchParams.get('sortOrder') ?? 'asc';
  const limit = searchParams.get('limit') ?? '25';
  const [showBarcodeCatalog, setShowBarcodeCatalog] = useState(false);
  const [printingList, setPrintingList] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ data: CategoryNode[] }>('/products/categories')).data.data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch, page, lowStock, favorite, categoryId, status, sortBy, sortOrder, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit,
        sortBy, sortOrder,
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(lowStock ? { lowStock: 'true' } : {}),
        ...(favorite ? { favorite: 'true' } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(status ? { status } : {}),
      });
      const res = await api.get<{ data: Product[]; pagination: { total: number; totalPages: number } }>(
        `/products?${params}`,
      );
      return res.data;
    },
  });

  const products = data?.data ?? [];
  const pagination = data?.pagination;

  // La selección se limpia cada vez que cambian los filtros o la página —
  // evita aplicar una acción masiva a productos que ya no están a la vista.
  useEffect(() => { setSelected(new Set()); }, [debouncedSearch, page, lowStock, favorite, categoryId, status, sortBy, sortOrder, limit]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ data: { deleted?: boolean; discontinued?: boolean } }>(`/products/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(res.data.data.discontinued
        ? 'El producto tiene ventas registradas, así que se marcó como descontinuado en vez de eliminarse.'
        : 'Producto eliminado.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const generateBarcodeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/products/${id}/generate-barcode`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Código de barras interno generado.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api.patch(`/products/${id}`, { isFavorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const bulkMutation = useMutation({
    mutationFn: (payload: { categoryId?: string; status?: string }) =>
      api.patch<{ data: { updated: number } }>('/products/bulk', { productIds: [...selected], ...payload }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${res.data.data.updated} producto(s) actualizado(s).`);
      setSelected(new Set());
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Usa los mismos filtros que la lista, sin paginar, para que "lo que ves
  // es lo que imprimes" (igual que el export de Ventas).
  const handlePrintPriceList = async () => {
    setPrintingList(true);
    try {
      const params = new URLSearchParams({
        page: '1', limit: '5000', sortBy, sortOrder,
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(lowStock ? { lowStock: 'true' } : {}),
        ...(favorite ? { favorite: 'true' } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(status ? { status } : {}),
      });
      const res = await api.get<{ data: Product[] }>(`/products?${params}`);
      if (res.data.data.length === 0) {
        toast.error('No hay productos para imprimir con estos filtros.');
        return;
      }
      printPriceList(res.data.data.map(p => ({
        name: p.name, internalCode: p.internalCode, barcode: p.barcode,
        salePrice: p.salePrice, currentStock: p.currentStock, category: p.category,
      })));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPrintingList(false);
    }
  };

  const setParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      next.set('page', '1');
      return next;
    });
  };

  const toggleSelectAll = () => setSelected((v) =>
    v.size === products.length ? new Set() : new Set(products.map((p) => p.id)));

  const toggleSelect = (id: string) => setSelected((v) => {
    const next = new Set(v);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintPriceList} loading={printingList}
              title="Lista con código, precio y stock actual — para dejar impresa con los cajeros">
              <FileText className="mr-2 h-4 w-4" />
              Imprimir lista de precios
            </Button>
            <Button variant="outline" onClick={() => setShowBarcodeCatalog(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir catálogo de códigos
            </Button>
            <Link to="/products/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Producto
              </Button>
            </Link>
          </div>
        )}
      </div>

      {showBarcodeCatalog && <BarcodeCatalogModal onClose={() => setShowBarcodeCatalog(false)} />}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input
            startIcon={<Search className="h-4 w-4" />}
            placeholder="Buscar por nombre, código de barras o código interno..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <CategoryTreeSelect categories={categories ?? []} value={categoryId} onChange={(v) => setParam('categoryId', v)} />
        <select value={status} onChange={(e) => setParam('status', e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <select value={sortBy} onChange={(e) => setParam('sortBy', e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button variant="outline" size="icon" title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
            onClick={() => setParam('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')}>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant={lowStock ? 'default' : 'outline'}
          onClick={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (lowStock) next.delete('lowStock');
              else next.set('lowStock', 'true');
              next.set('page', '1');
              return next;
            });
          }}
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Stock Bajo
        </Button>
        <Button
          variant={favorite ? 'default' : 'outline'}
          className={cn(favorite && 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-black')}
          onClick={() => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (favorite) next.delete('favorite');
              else next.set('favorite', 'true');
              next.set('page', '1');
              return next;
            });
          }}
          title="Productos marcados como favoritos para acceso rápido en el POS"
        >
          <Star className="mr-2 h-4 w-4" />
          Favoritos
        </Button>
        {(categoryId || status || lowStock || favorite || search) && (
          <Button variant="ghost" onClick={() => { setSearch(''); setSearchParams({}); }}>
            <X className="mr-1.5 h-3.5 w-3.5" />Limpiar filtros
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          categories={categories ?? []}
          loading={bulkMutation.isPending}
          onAssignCategory={(catId) => bulkMutation.mutate({ categoryId: catId })}
          onSetStatus={(s) => bulkMutation.mutate({ status: s })}
          onClear={() => setSelected(new Set())}
        />
      )}

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
                    <th className="px-4 py-3 text-left font-medium w-8">
                      <button onClick={toggleSelectAll} title="Seleccionar todos en esta página">
                        {selected.size === products.length && products.length > 0
                          ? <CheckSquare className="h-4 w-4 text-primary" />
                          : <Square className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </th>
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
                    <tr key={product.id}
                      className={cn('hover:bg-muted/30 transition-colors', selected.has(product.id) && 'bg-primary/5')}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(product.id)}>
                          {selected.has(product.id)
                            ? <CheckSquare className="h-4 w-4 text-primary" />
                            : <Square className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </td>
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
                            <p className="font-medium flex items-center gap-1.5">
                              {product.name}
                              {product.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                            </p>
                            {product.barcode && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Barcode className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-mono text-muted-foreground">{product.barcode}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Categoría" className="px-4 py-3 text-muted-foreground col-md">
                        {product.category.parent ? (
                          <span className="flex items-center gap-1">
                            <span className="text-xs opacity-60">{product.category.parent.name} ›</span>
                            {product.category.name}
                          </span>
                        ) : product.category.name}
                      </td>
                      <td data-label="Costo" className="px-4 py-3 text-right col-lg">{formatCost(product.costPrice)}</td>
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
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="icon-sm"
                              title={product.isFavorite ? 'Quitar de favoritos (POS)' : 'Marcar como favorito (acceso rápido en POS)'}
                              onClick={() => toggleFavoriteMutation.mutate({ id: product.id, isFavorite: !product.isFavorite })}
                              loading={toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables?.id === product.id}>
                              <Star className={cn('h-4 w-4', product.isFavorite && 'fill-amber-400 text-amber-500')} />
                            </Button>
                            {!product.barcode && (
                              <Button variant="ghost" size="icon-sm" title="Generar código de barras interno"
                                onClick={() => generateBarcodeMutation.mutate(product.id)}
                                loading={generateBarcodeMutation.isPending && generateBarcodeMutation.variables === product.id}>
                                <Barcode className="h-4 w-4" />
                              </Button>
                            )}
                            <Link to={`/products/${product.id}/edit`}>
                              <Button variant="ghost" size="icon-sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="icon-sm" className="text-destructive"
                              onClick={() => { if (confirm(`¿Eliminar "${product.name}"?`)) deleteMutation.mutate(product.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
