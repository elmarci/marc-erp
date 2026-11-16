import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Save, Trash2, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto para agregarlo…" className="pl-8" />
      {debounced.length >= 2 && results && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map(p => {
            const already = selected.includes(p.id);
            return (
              <button key={p.id} type="button" disabled={already}
                onClick={() => { names.set(p.id, p.name); onAdd(p); setQ(''); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50">
                <span className="truncate">{p.name}</span>
                {already ? <span className="text-xs text-muted-foreground">Ya está</span> : <Plus className="h-4 w-4 text-primary" />}
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
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium">Nombre de la opción</label>
            <Input value={group.name} maxLength={40} placeholder="Ej: Presa"
              onChange={e => onChange({ ...group, name: e.target.value })} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-7 text-muted-foreground" onClick={onDelete} aria-label="Eliminar opción">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Lo que puede elegir el cliente</label>
          <div className="flex flex-wrap items-center gap-2">
            {group.choices.map(c => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-primary">
                {c}
                <button type="button" aria-label={`Quitar ${c}`}
                  onClick={() => onChange({ ...group, choices: group.choices.filter(x => x !== c) })}
                  className="rounded-full p-0.5 hover:bg-primary/15"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Input value={choice} maxLength={40} placeholder="Agregar…" className="h-8 w-36"
                onChange={e => setChoice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChoice(); } }} />
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={addChoice}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-4 w-4 rounded border-input" checked={group.required}
            onChange={e => onChange({ ...group, required: e.target.checked })} />
          <span className="text-sm">Obligatorio <span className="text-muted-foreground">(el cliente no puede agregar el producto sin elegir)</span></span>
        </label>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Categorías completas</label>
          <p className="mb-2 text-xs text-muted-foreground">Al marcar una categoría, también aplica a sus subcategorías.</p>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex flex-wrap gap-1.5">
                {[{ id: cat.id, name: cat.name }, ...(cat.children ?? [])].map((c, i) => {
                  const on = group.categoryIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                      className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                        i === 0 ? 'font-semibold' : '',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Productos sueltos</label>
          <ProductPicker selected={group.productIds} names={names}
            onAdd={p => onChange({ ...group, productIds: [...group.productIds, p.id] })} />
          {group.productIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.productIds.map(id => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1.5 text-xs">
                  {names.get(id) ?? 'Producto'}
                  <button type="button" aria-label="Quitar producto"
                    onClick={() => onChange({ ...group, productIds: group.productIds.filter(x => x !== id) })}
                    className="rounded-full p-0.5 hover:bg-background"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ListChecks className="h-6 w-6" />Opciones en la tienda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que el cliente elige al pedir por la app (pierna o pecho, helada o sin helar). No cambia el precio:
            sale resaltado en Pedidos Online, en el ticket y en la app del repartidor.
          </p>
        </div>
        <Button onClick={handleSave} loading={save.isPending} disabled={!dirty}>
          <Save className="mr-2 h-4 w-4" />Guardar
        </Button>
      </div>

      {groups === null ? (
        <p className="py-8 text-center text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {groups.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
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
              <Button key={t.name} type="button" variant="outline"
                onClick={() => update([...groups, { ...t, id: newId(), categoryIds: [], productIds: [] }])}>
                <Plus className="mr-1.5 h-4 w-4" />{t.name} ({t.choices.join(' / ')})
              </Button>
            ))}
            <Button type="button" variant="outline"
              onClick={() => update([...groups, { id: newId(), name: '', choices: [], required: false, categoryIds: [], productIds: [] }])}>
              <Plus className="mr-1.5 h-4 w-4" />Opción nueva
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
