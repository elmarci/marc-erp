// Productos: lista con categorías, filtros guardados en la dirección,
// selección para acciones masivas e impresión de lista y etiquetas.
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Barcode, FileText, Package, Pencil, Plus, Printer, Rocket, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, Check, EmptyState, FilterBar, PageHeader, Pagination, RowMenu, StatusBadge, fieldCls, surfaceCls,
  tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatCost, cn, looksLikeScannedCode } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { printPriceList } from './productPrinting';
import { BarcodeCatalogModal, BulkActionBar, CategoryChipNav, type CategoryNode, type Product } from './ProductParts';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
  { value: 'DISCONTINUED', label: 'Descontinuado' },
];
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', DISCONTINUED: 'Descontinuado' };

const SORT_OPTIONS = [
  { value: 'category', label: 'Categoría' },
  { value: 'name', label: 'Nombre' },
  { value: 'salePrice', label: 'Precio' },
  { value: 'currentStock', label: 'Stock' },
  { value: 'createdAt', label: 'Más reciente' },
];

const toggleCls = (on: boolean) => cn(
  'tap inline-flex h-8 items-center gap-1.5 rounded-ctl px-2.5 text-table font-medium transition-colors [&_svg]:size-4',
  on ? 'bg-ink text-on-ink' : 'text-ink-muted shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2 hover:text-ink',
);

export function ProductsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasMinRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const page = parseInt(searchParams.get('page') ?? '1');
  const lowStock = searchParams.get('lowStock') === 'true';
  const favorite = searchParams.get('favorite') === 'true';
  const categoryId = searchParams.get('categoryId') ?? '';
  const status = searchParams.get('status') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'category';
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

  // La selección se limpia cuando cambian los filtros/orden (el conjunto de
  // productos visibles cambia por completo), pero NO al cambiar de página —
  // así se puede seleccionar productos de varias páginas para una acción masiva.
  useEffect(() => { setSelected(new Set()); }, [debouncedSearch, lowStock, favorite, categoryId, status, sortBy, sortOrder, limit]);

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

  const toggleStoreFeaturedMutation = useMutation({
    mutationFn: ({ id, storeFeatured }: { id: string; storeFeatured: boolean }) =>
      api.patch(`/products/${id}`, { storeFeatured }),
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

  // Selecciona/deselecciona solo los productos de la página actual, sin
  // tocar los que ya estaban marcados en otras páginas.
  const allOnPageSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleSelectAll = () => setSelected((v) => {
    const next = new Set(v);
    if (allOnPageSelected) products.forEach((p) => next.delete(p.id));
    else products.forEach((p) => next.add(p.id));
    return next;
  });

  const toggleSelect = (id: string) => setSelected((v) => {
    const next = new Set(v);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const goToPage = (p: number) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('page', String(p)); return next; });

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

  const toggleParam = (key: string, on: boolean) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (on) next.delete(key); else next.set(key, 'true');
    next.set('page', '1');
    return next;
  });
  const pageSize = Number(limit) || 25;
  const catName = (() => {
    for (const c of categories ?? []) {
      if (c.id === categoryId) return c.name;
      const ch = c.children?.find((x) => x.id === categoryId);
      if (ch) return `${c.name} › ${ch.name}`;
    }
    return '';
  })();
  const canEdit = hasMinRole('WAREHOUSE');

  const removeProduct = async (product: Product) => {
    const r = await confirm({
      title: `Eliminar "${product.name}"`,
      description: 'Si el producto ya tiene ventas registradas, se marcará como descontinuado en vez de eliminarse.',
      confirmLabel: 'Eliminar', tone: 'danger',
    });
    if (r.ok) deleteMutation.mutate(product.id);
  };

  const pager = pagination && pagination.totalPages > 1 && (
    <div className={surfaceCls}>
      <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pageSize} onPage={goToPage} />
    </div>
  );

  return (
    <div className="erp flex flex-col gap-4">
      <PageHeader title="Productos" actions={canEdit && <>
        <Btn onClick={handlePrintPriceList} loading={printingList} className="hidden sm:inline-flex"
          title="Lista con código, precio y stock actual, para dejar impresa con los cajeros"><FileText />Imprimir lista de precios</Btn>
        <Btn onClick={() => setShowBarcodeCatalog(true)} className="hidden sm:inline-flex"><Printer />Imprimir catálogo de códigos</Btn>
        <Btn variant="primary" onClick={() => navigate('/products/new')}><Plus />Nuevo producto</Btn>
      </>}>
        <p className="text-table text-ink-muted">{pagination ? `${pagination.total.toLocaleString('es-PE')} productos en total` : 'Catálogo de productos'}</p>
      </PageHeader>

      {showBarcodeCatalog && <BarcodeCatalogModal onClose={() => setShowBarcodeCatalog(false)} categories={categories ?? []} />}

      {/* Categorías generales y sus subcategorías, igual que en el POS. */}
      <CategoryChipNav categories={categories ?? []} categoryId={categoryId} onSelect={(v) => setParam('categoryId', v)} />

      <div className={surfaceCls}>
        <FilterBar
          search={{ value: search, onChange: handleSearch, placeholder: 'Buscar por nombre, código de barras o código interno' }}
          quick={<>
            <select aria-label="Estado" value={status} onChange={(e) => setParam('status', e.target.value)} className={cn(fieldCls, 'h-8 w-auto')}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <span className="pl-1 text-meta text-ink-muted">Ordenar por</span>
              <select aria-label="Ordenar por" value={sortBy} onChange={(e) => setParam('sortBy', e.target.value)} className={cn(fieldCls, 'h-8 w-auto')}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Btn size="sm" variant="ghost" aria-label={sortOrder === 'asc' ? 'Orden ascendente' : 'Orden descendente'} title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
                onClick={() => setParam('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')}>
                {sortOrder === 'asc' ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
              </Btn>
            </div>
            <button type="button" aria-pressed={lowStock} className={toggleCls(lowStock)} onClick={() => toggleParam('lowStock', lowStock)}><AlertTriangle />Stock bajo</button>
            <button type="button" aria-pressed={favorite} className={toggleCls(favorite)} onClick={() => toggleParam('favorite', favorite)}
              title="Productos marcados como favoritos para acceso rápido en el POS"><Star />Favoritos</button>
          </>}
          chips={[
            ...(search ? [{ key: 'q', label: 'Búsqueda', value: search, onRemove: () => handleSearch('') }] : []),
            ...(catName ? [{ key: 'cat', label: 'Categoría', value: catName, onRemove: () => setParam('categoryId', '') }] : []),
            ...(status ? [{ key: 'st', label: 'Estado', value: STATUS_LABEL[status] ?? status, onRemove: () => setParam('status', '') }] : []),
            ...(lowStock ? [{ key: 'low', label: 'Stock', value: 'Bajo', onRemove: () => toggleParam('lowStock', true) }] : []),
            ...(favorite ? [{ key: 'fav', label: 'Solo', value: 'Favoritos', onRemove: () => toggleParam('favorite', true) }] : []),
          ]}
          onClear={() => { setSearch(''); setSearchParams({}); }}
        />
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

      {pager}

      <div className={cn('overflow-hidden', surfaceCls)}>
        {isLoading ? (
          <div className="py-12 text-center text-table text-ink-muted">Cargando productos…</div>
        ) : products.length === 0 ? (
          <EmptyState icon={Package} title="No se encontraron productos"
            action={canEdit && <Btn size="sm" variant="primary" onClick={() => navigate('/products/new')}>Crear producto</Btn>} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={cn(thCls, 'w-8 pr-0')}>
                  <Check checked={allOnPageSelected} indeterminate={!allOnPageSelected && products.some((p) => selected.has(p.id))}
                    onChange={toggleSelectAll} label="Seleccionar todos en esta página" />
                </th>
                <th className={thCls}>Producto</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Categoría</th>
                <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Costo</th>
                <th className={cn(thCls, 'text-right')}>Precio</th>
                <th className={cn(thCls, 'text-right')}>Stock</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Estado</th>
                {canEdit && <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>}
              </tr></thead>
              <tbody>
                {products.map((product) => {
                  const realCode = looksLikeScannedCode(product.barcode ?? '');
                  return (
                    <tr key={product.id} className={cn('hover:bg-surface-2', selected.has(product.id) && 'bg-brand-soft')}>
                      <td className={cn(tdCls, 'pr-0')}><Check checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} label={`Seleccionar ${product.name}`} /></td>
                      <td className={cn(tdCls, 'py-1.5')}>
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-ctl bg-ink/[0.05]">
                            {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4 text-ink-muted/50" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="truncate">{product.name}</span>
                              {product.isFavorite && <Star className="size-3.5 shrink-0 fill-warn text-warn" aria-label="Favorito" />}
                              {product.storeFeatured && <Rocket className="size-3.5 shrink-0 text-brand" aria-label="Destacado en la tienda" />}
                            </div>
                            {product.barcode && (realCode
                              ? <div className="font-mono text-meta text-ink-muted">{product.barcode}</div>
                              : <div className="text-meta text-bad-ink" title={`Valor guardado actualmente: "${product.barcode}"`}>Código inválido</div>)}
                            <div className="text-meta text-ink-muted md:hidden">{product.category.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>
                        {product.category.parent ? <><span className="text-meta">{product.category.parent.name} › </span>{product.category.name}</> : product.category.name}
                      </td>
                      <td className={cn(tdCls, 'hidden text-right tabular-nums lg:table-cell')}>{formatCost(product.costPrice)}</td>
                      <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{formatCurrency(product.salePrice)}</td>
                      <td className={cn(tdCls, 'whitespace-nowrap text-right tabular-nums')}>
                        <span className={cn('font-semibold', product.currentStock <= 0 ? 'text-bad-ink' : product.currentStock <= product.minStock && 'text-warn-ink')}>{product.currentStock}</span>
                        {product.currentStock <= product.minStock && product.currentStock > 0 && <AlertTriangle className="ml-1 inline size-3.5 text-warn" aria-label="Stock bajo" />}
                      </td>
                      <td className={cn(tdCls, 'hidden md:table-cell')}>
                        <StatusBadge tone={product.status === 'ACTIVE' ? 'ok' : 'muted'}>{product.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</StatusBadge>
                      </td>
                      {canEdit && (
                        <td className={cn(tdCls, 'px-1')}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Btn size="sm" variant="ghost" className="hidden px-2 sm:inline-flex"
                              aria-label={product.isFavorite ? 'Quitar de favoritos (POS)' : 'Marcar como favorito (POS)'}
                              title={product.isFavorite ? 'Quitar de favoritos (POS)' : 'Marcar como favorito (acceso rápido en POS)'}
                              onClick={() => toggleFavoriteMutation.mutate({ id: product.id, isFavorite: !product.isFavorite })}
                              loading={toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables?.id === product.id}>
                              <Star className={cn(product.isFavorite && 'fill-warn text-warn')} />
                            </Btn>
                            <Btn size="sm" variant="ghost" className="hidden px-2 sm:inline-flex"
                              aria-label={product.storeFeatured ? 'Quitar destacado de la tienda online' : 'Destacar en la tienda online'}
                              title={product.storeFeatured ? 'Quitar destacado de la tienda online' : 'Destacar en la tienda online (aparece primero en su categoría)'}
                              onClick={() => toggleStoreFeaturedMutation.mutate({ id: product.id, storeFeatured: !product.storeFeatured })}
                              loading={toggleStoreFeaturedMutation.isPending && toggleStoreFeaturedMutation.variables?.id === product.id}>
                              <Rocket className={cn(product.storeFeatured && 'text-brand')} />
                            </Btn>
                            <Btn size="sm" onClick={() => navigate(`/products/${product.id}/edit`)}><Pencil />Editar</Btn>
                            <RowMenu label={`Acciones de ${product.name}`} actions={[
                              { label: product.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito', icon: Star,
                                onSelect: () => toggleFavoriteMutation.mutate({ id: product.id, isFavorite: !product.isFavorite }) },
                              { label: product.storeFeatured ? 'Quitar destacado de la tienda' : 'Destacar en la tienda online', icon: Rocket,
                                onSelect: () => toggleStoreFeaturedMutation.mutate({ id: product.id, storeFeatured: !product.storeFeatured }) },
                              ...(!realCode ? [{ label: 'Generar código de barras interno', icon: Barcode, onSelect: () => generateBarcodeMutation.mutate(product.id) }] : []),
                              { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => removeProduct(product) },
                            ]} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pager}
    </div>
  );
}
