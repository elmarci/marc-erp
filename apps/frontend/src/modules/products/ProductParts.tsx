// Piezas de la lista de productos: selector y navegación de categorías,
// ventana para imprimir etiquetas con código y barra de acciones masivas.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, Modal, StatusBadge, fieldCls, surfaceCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, looksLikeScannedCode } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { printBarcodeCatalog } from './productPrinting';

export interface Product {
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
  storeFeatured?: boolean;
  category: { id: string; name: string; parent?: { name: string } | null };
  brand: { name: string } | null;
}

export interface CategoryNode {
  id: string;
  name: string;
  children?: Array<{ id: string; name: string }>;
}

/* ─── Selector de categoría (árbol con subcategorías) ────────────────────── */
export function CategoryTreeSelect({ categories, value, onChange, allowEmpty = true, emptyLabel = 'Todas las categorías', className, ariaLabel }: {
  categories: CategoryNode[]; value: string; onChange: (id: string) => void;
  allowEmpty?: boolean; emptyLabel?: string; className?: string; ariaLabel?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel ?? emptyLabel}
      className={cn(fieldCls, 'h-8 w-auto min-w-[180px]', className)}>
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

/* ─── Navegación por categorías (generales + subcategorías) ──────────────── */
const chipCls = (active: boolean) => cn(
  'tap h-7 shrink-0 rounded-ctl px-2.5 text-table transition-colors',
  active ? 'bg-ink font-medium text-on-ink' : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
);

export function CategoryChipNav({ categories, categoryId, onSelect }: {
  categories: CategoryNode[]; categoryId: string; onSelect: (id: string) => void;
}) {
  if (categories.length === 0) return null;
  // El id activo puede ser una categoría general o una subcategoría suya:
  // en ambos casos se muestra la fila de subcategorías del padre.
  const activeParent = categories.find((c) => c.id === categoryId)
    ?? categories.find((c) => c.children?.some((ch) => ch.id === categoryId));
  const subcategories = activeParent?.children ?? [];

  return (
    <nav aria-label="Categorías" className={cn('flex flex-col gap-1 p-1.5', surfaceCls)}>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={chipCls(!categoryId)} onClick={() => onSelect('')}>Todas</button>
        {categories.map((cat) => (
          <button key={cat.id} type="button" className={chipCls(activeParent?.id === cat.id)} onClick={() => onSelect(cat.id)}>{cat.name}</button>
        ))}
      </div>
      {activeParent && subcategories.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-line pt-1">
          <button type="button" className={chipCls(categoryId === activeParent.id)} onClick={() => onSelect(activeParent.id)}>Todas en {activeParent.name}</button>
          {subcategories.map((sub) => (
            <button key={sub.id} type="button" className={chipCls(categoryId === sub.id)} onClick={() => onSelect(sub.id)}>{sub.name}</button>
          ))}
        </div>
      )}
    </nav>
  );
}

/* ─── Imprimir etiquetas con código de barras ───────────────────────────── */
export function BarcodeCatalogModal({ onClose, categories }: { onClose: () => void; categories: CategoryNode[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryId, setCategoryId] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Límite alto para traer todo el catálogo de una vez.
  const { data: allProducts, isLoading } = useQuery({
    queryKey: ['products-barcode-catalog'],
    queryFn: async () => (await api.get<{ data: Product[] }>('/products?limit=3000')).data.data,
  });

  // Una categoría general incluye sus subcategorías.
  const selectedCategoryIds = useMemo(() => {
    if (!categoryId) return null;
    const node = categories.find((c) => c.id === categoryId);
    return new Set([categoryId, ...(node?.children?.map((c) => c.id) ?? [])]);
  }, [categoryId, categories]);

  // "Sin código" incluye los que no tienen barcode y los que tienen un valor
  // inválido: ambos necesitan un código interno limpio tipo PROxxx.
  const filtered = (allProducts ?? []).filter((p) => {
    if (onlyMissing && looksLikeScannedCode(p.barcode ?? '')) return false;
    if (selectedCategoryIds && !selectedCategoryIds.has(p.category.id)) return false;
    if (debouncedSearch && !p.name.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => setSelected((v) => {
    const next = new Set(v);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = selected.size === filtered.length && filtered.length > 0;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((p) => p.id)));

  const generateMutation = useMutation({
    mutationFn: (productIds: string[]) => api.post<{ data: Array<{ id: string; barcode: string }> }>('/products/generate-barcodes-bulk', { productIds }),
  });

  // Precarga la fuente del precio al abrir la ventana, no al imprimir.
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap';
    document.head.appendChild(link);
    document.fonts?.load('64px "Bebas Neue"').catch(() => {});
    return () => { document.head.removeChild(link); };
  }, []);

  const handlePrint = async () => {
    const chosen = (allProducts ?? []).filter((p) => selected.has(p.id));
    const needCodes = chosen.filter((p) => !looksLikeScannedCode(p.barcode ?? '')).map((p) => p.id);

    // La ventana se abre aquí, dentro del clic, para que el navegador acepte
    // el print() posterior como gesto del usuario.
    const win = window.open('', '_blank', 'width=900,height=950');
    if (!win) {
      toast.error('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.');
      return;
    }
    win.document.write('<title>Generando etiquetas…</title><body style="font-family:Arial,sans-serif;padding:2rem;color:#555">Generando etiquetas…</body>');

    let generated: Array<{ id: string; barcode: string }> = [];
    if (needCodes.length > 0) {
      try {
        generated = (await generateMutation.mutateAsync(needCodes)).data.data;
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['products-barcode-catalog'] });
      } catch (err) {
        win.close();
        toast.error(getErrorMessage(err));
        return;
      }
    }
    const codeById = new Map(generated.map((g) => [g.id, g.barcode]));
    const toPrint = chosen.map((p) => ({
      name: p.name,
      salePrice: p.salePrice,
      barcode: (looksLikeScannedCode(p.barcode ?? '') ? p.barcode : null) ?? codeById.get(p.id) ?? '',
    })).filter((p) => p.barcode);

    if (toPrint.length === 0) {
      win.close();
      toast.error('No hay productos seleccionados con código.');
      return;
    }
    printBarcodeCatalog(toPrint, win);
    toast.success(`Catálogo generado con ${toPrint.length} producto(s).`);
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" title="Imprimir catálogo de códigos"
      description="Marca productos sin código real (a granel, o con un código inválido guardado antes). Se les asigna un código interno PROxxx al imprimir."
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={handlePrint} loading={generateMutation.isPending} disabled={selected.size === 0}>
          <Printer />Generar e imprimir ({selected.size})
        </Btn>
      </>}>
      <div className="-mx-5 -my-4 flex flex-col">
        <div className="flex flex-col gap-2 border-b border-line px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input className={cn(fieldCls, 'h-8 pl-8')} placeholder="Buscar producto…" aria-label="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <CategoryTreeSelect categories={categories} value={categoryId} onChange={setCategoryId} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-table">
            <label className="flex cursor-pointer items-center gap-2" title="Incluye productos sin código y los que tengan un código inválido">
              <Check checked={onlyMissing} onChange={() => setOnlyMissing((v) => !v)} label="Solo pendientes (sin código real)" />
              Solo pendientes (sin código real)
            </label>
            <Btn size="sm" variant="ghost" onClick={toggleAll}>
              {allSelected ? 'Deseleccionar todos' : `Seleccionar todos (${filtered.length})`}
            </Btn>
          </div>
        </div>
        <div className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-table text-ink-muted">Cargando productos…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-table text-ink-muted">
              No hay productos que coincidan.
              {onlyMissing && <span className="mt-1 block">Prueba desmarcar «Solo pendientes»: puede que ya todos tengan código en esta vista.</span>}
            </div>
          ) : filtered.map((p) => {
            const hasRealCode = looksLikeScannedCode(p.barcode ?? '');
            return (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-surface-2">
                <Check checked={selected.has(p.id)} onChange={() => toggle(p.id)} label={`Elegir ${p.name}`} />
                <span className="min-w-0 flex-1 text-table">
                  {p.name}
                  <span className="block text-meta text-ink-muted">
                    {p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name}
                  </span>
                </span>
                {p.isBulk && <StatusBadge tone="muted">Granel</StatusBadge>}
                {hasRealCode ? <span className="font-mono text-meta text-ink-muted">{p.barcode}</span>
                  : p.barcode ? <span className="text-meta text-bad-ink" title={`Valor guardado actualmente: "${p.barcode}"`}>Código inválido, se corregirá</span>
                  : <span className="text-meta text-warn-ink">Sin código, se generará</span>}
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ─── Barra de acciones masivas ──────────────────────────────────────────── */
export function BulkActionBar({ count, categories, onAssignCategory, onSetStatus, onClear, loading }: {
  count: number; categories: CategoryNode[];
  onAssignCategory: (categoryId: string) => void;
  onSetStatus: (status: string) => void;
  onClear: () => void;
  loading: boolean;
}) {
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-srf bg-brand px-3 py-2 text-white">
      <span className="text-table font-medium" title="La selección se mantiene aunque cambies de página">
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1.5">
        <CategoryTreeSelect categories={categories} value={bulkCategoryId} onChange={setBulkCategoryId} emptyLabel="Asignar categoría…" />
        <Btn size="sm" disabled={!bulkCategoryId || loading} loading={loading}
          onClick={() => { onAssignCategory(bulkCategoryId); setBulkCategoryId(''); }}>Aplicar</Btn>
      </div>
      <Btn size="sm" disabled={loading} onClick={() => onSetStatus('ACTIVE')}>Activar</Btn>
      <Btn size="sm" disabled={loading} onClick={() => onSetStatus('INACTIVE')}>Desactivar</Btn>
      <Btn size="sm" variant="ghost" className="ml-auto text-white/80 hover:bg-white/10 hover:text-white" onClick={onClear}><X />Cancelar selección</Btn>
    </div>
  );
}
