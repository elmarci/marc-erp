import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Check, Field, PageHeader, fieldCls, surfaceCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';

// Opciones que el cliente elige en la tienda online al agregar un producto
// (pollo: pierna/pecho; bebidas: helada/sin helar). No cambian el precio:
// llegan al pedido como dato de despacho para el personal.

interface OptionGroup {
  id: string; name: string; choices: string[]; required: boolean;
  categoryIds: string[]; productIds: string[];
}
interface CategoryNode { id: string; name: string; children?: { id: string; name: string }[] }
interface ProductLite { id: string; name: string }

const newId = () => Math.random().toString(36).slice(2, 10);

const TEMPLATES: Array<Omit<OptionGroup, 'id' | 'categoryIds' | 'productIds'>> = [
  { name: 'Presa', choices: ['Pierna', 'Pecho', 'Ala'], required: true },
  { name: 'Temperatura', choices: ['Helada', 'Sin helar'], required: true },
];

function ProductPicker({ selected, names, onAdd }: {
  selected: string[]; names: Map<string, string>; onAdd: (p: ProductLite) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data: results } = useQuery({
    queryKey: ['opt-product-search', debounced],
    queryFn: async () => (await api.get<{ data: ProductLite[] }>(`/products?q=${encodeURIComponent(debounced)}&limit=8`)).data.data,
    enabled: debounced.length >= 2,
  });
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input className={cn(fieldCls, 'pl-8')} aria-label="Buscar producto" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto para agregarlo…" />
      {debounced.length >= 2 && results && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
          {results.map(p => {
            const already = selected.includes(p.id);
            return (
              <button key={p.id} type="button" disabled={already}
                onClick={() => { names.set(p.id, p.name); onAdd(p); setQ(''); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-table hover:bg-surface-2 disabled:opacity-50">
                <span className="truncate">{p.name}</span>
                {already ? <span className="text-meta text-ink-muted">Ya está</span> : <Plus className="size-4 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupEditor({ group, categories, names, onChange, onDelete }: {
  group: OptionGroup; categories: CategoryNode[]; names: Map<string, string>;
  onChange: (g: OptionGroup) => void; onDelete: () => void;
}) {
  const [choice, setChoice] = useState('');
  const addChoice = () => {
    const c = choice.trim();
    if (!c || group.choices.includes(c)) { setChoice(''); return; }
    onChange({ ...group, choices: [...group.choices, c] });
    setChoice('');
  };
  const toggleCat = (id: string) => onChange({
    ...group,
    categoryIds: group.categoryIds.includes(id) ? group.categoryIds.filter(c => c !== id) : [...group.categoryIds, id],
  });

  return (
    <section className={cn('flex flex-col gap-5 p-4', surfaceCls)}>
        <div className="flex items-end gap-3">
          <Field label="Nombre de la opción" className="flex-1">
            <input className={fieldCls} value={group.name} maxLength={40} placeholder="Ej: Presa"
              onChange={e => onChange({ ...group, name: e.target.value })} />
          </Field>
          <Btn variant="ghost" onClick={onDelete} aria-label="Eliminar opción"><Trash2 /></Btn>
        </div>

        <div>
          <p className="mb-1.5 text-table font-medium text-ink">Lo que puede elegir el cliente</p>
          <div className="flex flex-wrap items-center gap-2">
            {group.choices.map(c => (
              <span key={c} className="inline-flex h-7 items-center gap-1 rounded-ctl bg-brand-soft pl-2.5 pr-1 text-table font-medium text-ink">
                {c}
                <button type="button" aria-label={`Quitar ${c}`}
                  onClick={() => onChange({ ...group, choices: group.choices.filter(x => x !== c) })}
                  className="rounded-[4px] p-0.5 text-ink-muted hover:bg-ink/[0.06] hover:text-ink"><X className="size-3.5" /></button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input className={cn(fieldCls, 'h-8 w-36')} aria-label="Nueva opción" value={choice} maxLength={40} placeholder="Agregar…"
                onChange={e => setChoice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChoice(); } }} />
              <Btn size="sm" onClick={addChoice} aria-label="Agregar opción"><Plus /></Btn>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <Check checked={group.required} label="Obligatorio" onChange={() => onChange({ ...group, required: !group.required })} />
          <span className="text-table text-ink">Obligatorio <span className="text-ink-muted">(el cliente no puede agregar el producto sin elegir)</span></span>
        </label>

        <div>
          <p className="text-table font-medium text-ink">Categorías completas</p>
          <p className="mb-2 text-meta text-ink-muted">Al marcar una categoría, también aplica a sus subcategorías.</p>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex flex-wrap gap-1.5">
                {[{ id: cat.id, name: cat.name }, ...(cat.children ?? [])].map((c, i) => {
                  const on = group.categoryIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleCat(c.id)}
                      className={cn('h-7 rounded-ctl px-2.5 text-meta transition-colors',
                        i === 0 ? 'font-semibold' : '',
                        on ? 'bg-brand text-white' : 'text-ink shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2')}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-table font-medium text-ink">Productos sueltos</p>
          <ProductPicker selected={group.productIds} names={names}
            onAdd={p => onChange({ ...group, productIds: [...group.productIds, p.id] })} />
          {group.productIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.productIds.map(id => (
                <span key={id} className="inline-flex h-7 items-center gap-1 rounded-ctl bg-surface-2 pl-2.5 pr-1 text-meta text-ink">
                  {names.get(id) ?? 'Producto'}
                  <button type="button" aria-label="Quitar producto"
                    onClick={() => onChange({ ...group, productIds: group.productIds.filter(x => x !== id) })}
                    className="rounded-[4px] p-0.5 text-ink-muted hover:bg-ink/[0.06] hover:text-ink"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
    </section>
  );
}

export function StoreOptionsPage() {
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<OptionGroup[] | null>(null);
  const [names] = useState(() => new Map<string, string>());
  const [dirty, setDirty] = useState(false);

  const { data } = useQuery({
    queryKey: ['store-options'],
    queryFn: async () => (await api.get<{ data: { groups: OptionGroup[]; products: ProductLite[] } }>('/store/admin/options')).data.data,
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ data: CategoryNode[] }>('/categories')).data.data,
  });

  useEffect(() => {
    if (data && groups === null) {
      data.products.forEach(p => names.set(p.id, p.name));
      setGroups(data.groups);
    }
  }, [data, groups, names]);

  const save = useMutation({
    mutationFn: (gs: OptionGroup[]) => api.put('/store/admin/options', { groups: gs }),
    onSuccess: () => { setDirty(false); queryClient.invalidateQueries({ queryKey: ['store-options'] }); toast.success('Opciones guardadas. Ya se ven en la tienda.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const update = (next: OptionGroup[]) => { setGroups(next); setDirty(true); };

  const handleSave = () => {
    if (!groups) return;
    const bad = groups.find(g => !g.name.trim() || g.choices.length < 2);
    if (bad) { toast.error(`"${bad.name || 'Sin nombre'}" necesita un nombre y al menos 2 opciones.`); return; }
    const empty = groups.find(g => g.categoryIds.length === 0 && g.productIds.length === 0);
    if (empty) { toast.error(`"${empty.name}" no está asignada a ninguna categoría ni producto.`); return; }
    save.mutate(groups.map(g => ({ ...g, name: g.name.trim() })));
  };

  return (
    <div className="erp flex max-w-3xl flex-col gap-5">
      <PageHeader title="Opciones en la tienda" actions={
        <Btn variant="primary" onClick={handleSave} loading={save.isPending} disabled={!dirty}><Save />Guardar</Btn>
      }>
        <p className="text-table text-ink-muted">
          Lo que el cliente elige al pedir por la app (pierna o pecho, helada o sin helar). No cambia el precio:
          sale resaltado en Pedidos Online, en el ticket y en la app del repartidor.
        </p>
      </PageHeader>

      {groups === null ? (
        <p className="py-8 text-center text-table text-ink-muted">Cargando…</p>
      ) : (
        <>
          {groups.length === 0 && (
            <p className="rounded-srf border border-dashed border-line-strong p-6 text-center text-table text-ink-muted">
              Todavía no hay opciones. Empieza con un modelo o crea una desde cero.
            </p>
          )}
          {groups.map((g, idx) => (
            <GroupEditor key={g.id} group={g} categories={categories ?? []} names={names}
              onChange={ng => update(groups.map((x, i) => i === idx ? ng : x))}
              onDelete={() => update(groups.filter((_, i) => i !== idx))} />
          ))}
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.filter(t => !groups.some(g => g.name === t.name)).map(t => (
              <Btn key={t.name} onClick={() => update([...groups, { ...t, id: newId(), categoryIds: [], productIds: [] }])}>
                <Plus />{t.name} ({t.choices.join(' / ')})
              </Btn>
            ))}
            <Btn onClick={() => update([...groups, { id: newId(), name: '', choices: [], required: false, categoryIds: [], productIds: [] }])}>
              <Plus />Opción nueva
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
