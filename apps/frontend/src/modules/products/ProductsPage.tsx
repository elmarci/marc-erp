import { useState, useEffect, useMemo } from 'react';
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
import { formatCurrency, formatCost, cn, looksLikeScannedCode } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MARC_LOGO_DATA_URI } from '@/assets/marcLogo';

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
  { value: 'category', label: 'Categoría' },
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

/* ─── Navegación por categorías (chips generales + subcategorías) ────────── */
function CategoryChipNav({ categories, categoryId, onSelect }: {
  categories: CategoryNode[]; categoryId: string; onSelect: (id: string) => void;
}) {
  if (categories.length === 0) return null;

  // El id activo puede ser una categoría general o una subcategoría suya —
  // en ambos casos hay que mostrar expandida la fila de subcategorías del padre.
  const activeParent = categories.find((c) => c.id === categoryId)
    ?? categories.find((c) => c.children?.some((ch) => ch.id === categoryId));
  const subcategories = activeParent?.children ?? [];

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={!categoryId ? 'default' : 'outline'} size="sm" onClick={() => onSelect('')}>
          Todas
        </Button>
        {categories.map((cat) => (
          <Button key={cat.id} variant={activeParent?.id === cat.id ? 'default' : 'outline'} size="sm"
            onClick={() => onSelect(cat.id)}>
            {cat.name}
          </Button>
        ))}
      </div>
      {subcategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t pt-2">
          <Button variant={categoryId === activeParent!.id ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs"
            onClick={() => onSelect(activeParent!.id)}>
            Todas
          </Button>
          {subcategories.map((sub) => (
            <Button key={sub.id} variant={categoryId === sub.id ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs"
              onClick={() => onSelect(sub.id)}>
              {sub.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Impresión de etiquetas de precio (para pegar en los portaprecios) ───
 * Tarjeta de ~5.2cm de alto, siguiendo el modelo de etiqueta que ya usa la
 * tienda: logo grande a la izquierda, nombre en dos niveles (tipo de
 * producto arriba en grande, marca/variante abajo) y precio en una píldora
 * azul — con el código de barras como franja delgada al pie. */
function barcodeSvgMarkup(value: string): string {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: 'CODE128', width: 1.4, height: 22, displayValue: true,
      fontSize: 9, fontOptions: 'bold', margin: 0, textMargin: 2,
    });
    return svg.outerHTML;
  } catch {
    return `<p style="font-size:9px">${value}</p>`;
  }
}

// La mayoría de productos del catálogo se llaman "Tipo Marca Variante"
// (ej. "Leche Bonle Protección 390g", "Detergente Ariel 1kg") — separar la
// primera palabra como título grande y el resto como subtítulo reproduce
// el mismo efecto visual de "tipo de producto" + "presentación" de la
// etiqueta de referencia, sin necesitar un campo nuevo en el producto.
function splitProductName(name: string): { title: string; subtitle: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { title: name, subtitle: '' };
  return { title: parts[0], subtitle: parts.slice(1).join(' ') };
}

function printBarcodeCatalog(products: Array<{ name: string; barcode: string; salePrice: number }>) {
  const win = window.open('', '_blank', 'width=900,height=950');
  if (!win) return;
  const cards = products.map(p => {
    const { title, subtitle } = splitProductName(p.name);
    return `
    <div class="card">
      <div class="row">
        <div class="logo"><img src="${MARC_LOGO_DATA_URI}" /></div>
        <div class="name">
          <p class="title${title.length > 9 ? ' long' : ''}">${title}</p>
          ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
        </div>
        <div class="price"><span class="currency">S/</span><span class="amount">${Number(p.salePrice).toFixed(2)}</span></div>
      </div>
      <div class="barcode">${barcodeSvgMarkup(p.barcode)}</div>
    </div>`;
  }).join('');
  win.document.write(`<html><head><title>Etiquetas de precio</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
      @page { size: A4; margin: 8mm; }
      body { font-family: Arial, Helvetica, sans-serif; }
      .grid { display: flex; flex-wrap: wrap; gap: 3mm; }
      .card {
        width: 90mm; height: 52mm;
        border-radius: 4mm; overflow: hidden;
        border: 1.5px solid #b9c6e0; background: #fff;
        page-break-inside: avoid;
        display: flex; flex-direction: column;
      }
      .row {
        flex: 1; min-height: 0; display: flex; align-items: center; gap: 3mm;
        padding: 3mm 3mm 1mm;
      }
      .logo {
        width: 20mm; height: 20mm; border-radius: 50%; overflow: hidden;
        position: relative; flex-shrink: 0; background: #fff;
      }
      .logo img { position: absolute; top: 0; right: 0; height: 100%; width: auto; }
      .name { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
      .title {
        font-size: 16px; font-weight: 900; color: #14203c; text-transform: uppercase;
        line-height: 1.05; letter-spacing: .005em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .title.long { font-size: 13.5px; }
      .subtitle {
        font-size: 12px; font-weight: 700; color: #3d4a63; text-transform: uppercase;
        line-height: 1.2;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .price {
        flex-shrink: 0; background: linear-gradient(160deg, #2166cc, #184a98); color: #fff;
        border-radius: 4mm; padding: 1.8mm 3mm;
        display: flex; flex-direction: column; align-items: center; line-height: 1;
      }
      .price .currency { font-size: 9px; font-weight: 800; opacity: .85; }
      .price .amount { font-size: 22px; font-weight: 900; }
      .barcode { flex-shrink: 0; text-align: center; padding: 0 3mm 2mm; }
      .barcode svg { max-width: 100%; height: auto; max-height: 11mm; }
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

function BarcodeCatalogModal({ onClose, categories }: { onClose: () => void; categories: CategoryNode[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Límite alto para traer TODO el catálogo de una vez — con el tope
  // anterior (100) la mitad de los productos ni siquiera aparecían acá.
  const { data: allProducts, isLoading } = useQuery({
    queryKey: ['products-barcode-catalog'],
    queryFn: async () => (await api.get<{ data: Product[] }>('/products?limit=3000')).data.data,
  });

  // Si se elige una categoría general, incluye sus subcategorías (mismo
  // criterio que el resto del sistema) — si no, casi nunca hay productos
  // asignados directo a la categoría padre.
  const selectedCategoryIds = useMemo(() => {
    if (!categoryId) return null;
    const node = categories.find(c => c.id === categoryId);
    const ids = new Set([categoryId, ...(node?.children?.map(c => c.id) ?? [])]);
    return ids;
  }, [categoryId, categories]);

  // "Sin código" incluye tanto productos sin barcode como los que quedaron
  // con un valor inválido (ej. el nombre del producto guardado por error en
  // el pasado) — ambos casos necesitan que se les genere un código interno
  // limpio tipo PROxxx.
  const filtered = (allProducts ?? []).filter(p => {
    if (onlyMissing && looksLikeScannedCode(p.barcode ?? '')) return false;
    if (selectedCategoryIds && !selectedCategoryIds.has(p.category.id)) return false;
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
    const needCodes = chosen.filter(p => !looksLikeScannedCode(p.barcode ?? '')).map(p => p.id);

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
      barcode: (looksLikeScannedCode(p.barcode ?? '') ? p.barcode : null) ?? codeById.get(p.id) ?? '',
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
              Marca productos sin código real (a granel, o con un código inválido guardado antes) — se les asigna un código interno PROxxx al imprimir.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-3 border-b">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input startIcon={<Search className="h-4 w-4" />} placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <CategoryTreeSelect categories={categories} value={categoryId} onChange={setCategoryId} emptyLabel="Todas las categorías" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer" title="Incluye productos sin código y los que tengan un código inválido (ej. texto en vez de un código real)">
              <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Solo pendientes (sin código real)
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
            <div className="py-8 text-center text-muted-foreground text-sm">
              No hay productos que coincidan.
              {onlyMissing && <span className="block mt-1">Prueba desmarcar "Solo pendientes" — puede que ya todos tengan código en esta vista.</span>}
            </div>
          ) : filtered.map(p => {
            const hasRealCode = looksLikeScannedCode(p.barcode ?? '');
            return (
            <label key={p.id} className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-input" />
              <span className="flex-1 text-sm">
                {p.name}
                <span className="block text-xs text-muted-foreground">
                  {p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name}
                </span>
              </span>
              {p.isBulk && <Badge variant="secondary" className="text-xs">Granel</Badge>}
              {hasRealCode ? (
                <span className="text-xs font-mono text-muted-foreground">{p.barcode}</span>
              ) : p.barcode ? (
                <span className="text-xs text-destructive" title={`Valor guardado actualmente: "${p.barcode}"`}>Código inválido — se corregirá</span>
              ) : (
                <span className="text-xs text-amber-600">Sin código — se generará</span>
              )}
            </label>
            );
          })}
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

/* ─── Paginación (se repite arriba y abajo de la tabla para no obligar a
     bajar hasta el final cada vez que se quiere cambiar de página) ────────── */
function PaginationBar({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-2.5">
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
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
      <span className="text-sm font-semibold" title="La selección se mantiene aunque cambies de página">
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
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

      {showBarcodeCatalog && <BarcodeCatalogModal onClose={() => setShowBarcodeCatalog(false)} categories={categories ?? []} />}

      {/* Navegación por categorías: chips de categoría general + subcategorías,
          igual al patrón ya usado en el POS, para no obligar a leer un <select>. */}
      <CategoryChipNav categories={categories ?? []} categoryId={categoryId} onSelect={(v) => setParam('categoryId', v)} />

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

      {pagination && <PaginationBar page={page} totalPages={pagination.totalPages} onChange={goToPage} />}

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
                        {allOnPageSelected
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
                                {looksLikeScannedCode(product.barcode) ? (
                                  <span className="text-xs font-mono text-muted-foreground">{product.barcode}</span>
                                ) : (
                                  <span className="text-xs text-destructive" title={`Valor guardado actualmente: "${product.barcode}"`}>
                                    Código inválido
                                  </span>
                                )}
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
                            {!looksLikeScannedCode(product.barcode ?? '') && (
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

      {pagination && <PaginationBar page={page} totalPages={pagination.totalPages} onChange={goToPage} />}
    </div>
  );
}
