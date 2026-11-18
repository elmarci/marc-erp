// Categorías de gasto y gastos recurrentes (se abren desde la página Gastos).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { CategorySelect, EXPENSE_GROUP_LABELS, Sheet, moneyCls, useExpenseCategories, type ExpenseCategoryDef } from './ExpenseForms';

/* ─── Categorías ────────────────────────────────────────────────────────── */

export function ExpenseCategoriesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: categories } = useExpenseCategories(true);
  const [editing, setEditing] = useState<{ id: string | null; name: string; group: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  const save = useMutation({
    mutationFn: (c: { id: string | null; name: string; group: string }) => c.id
      ? api.patch(`/treasury/expense-categories/${c.id}`, { name: c.name.trim(), group: c.group })
      : api.post('/treasury/expense-categories', { name: c.name.trim(), group: c.group }),
    onSuccess: () => { refresh(); setEditing(null); toast.success('Categoría guardada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategoryDef) => api.patch(`/treasury/expense-categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Sheet title="Categorías de gasto" onClose={onClose} footer={
      editing ? (
        <div className="flex gap-2">
          <Btn onClick={() => setEditing(null)}>Cancelar</Btn>
          <Btn variant="primary" disabled={editing.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(editing)}>
            <Check />Guardar
          </Btn>
        </div>
      ) : (
        <Btn onClick={() => setEditing({ id: null, name: '', group: 'OTHER' })}>
          <Plus />Nueva categoría
        </Btn>
      )
    }>
      {editing ? (
        <>
          <Field label="Nombre"><input className={fieldCls} autoFocus value={editing.name} maxLength={60} placeholder="Ej: Mantenimiento" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="En el estado de resultados va como" hint="Agrupa los gastos para comparar mes a mes.">
            <select className={fieldCls} value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })}>
              {Object.entries(EXPENSE_GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </>
      ) : (
        <div className="divide-y divide-line">
          {(categories ?? []).map((c) => (
            <div key={c.id} className={cn('flex items-center gap-3 py-2.5', !c.isActive && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="text-table font-medium">{c.name}</p>
                <p className="text-meta text-ink-muted">
                  {EXPENSE_GROUP_LABELS[c.group] ?? c.group}{c._count ? ` · ${c._count.expenses} gasto${c._count.expenses === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <Btn size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, group: c.group })} aria-label="Editar">
                <Pencil />
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>
                {c.isActive ? 'Ocultar' : 'Mostrar'}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ─── Gasto recurrente ──────────────────────────────────────────────────── */

export function RecurringTemplateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');

  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/recurring-expenses', {
      categoryId, description: description.trim(), payeeName: payeeName.trim() || null,
      amount: parseFloat(amount), dayOfMonth: parseInt(dayOfMonth, 10),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] });
      toast.success('Listo. Cada mes aparecerá como gasto por pagar.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const day = parseInt(dayOfMonth, 10);

  return (
    <Sheet title="Nuevo gasto recurrente" onClose={onClose} footer={
      <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}
        disabled={!categoryId || !description.trim() || !(parseFloat(amount) > 0) || !(day >= 1 && day <= 28)}>
        Crear
      </Btn>
    }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría"><CategorySelect value={categoryId} onChange={setCategoryId} /></Field>
        <Field label="Monto aproximado"><input type="number" inputMode="decimal" className={moneyCls} min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><input className={fieldCls} placeholder="Ej: Alquiler del local" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="A quién se paga"><input className={fieldCls} placeholder="Opcional" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} /></Field>
        <Field label="Día del mes"><input className={fieldCls} type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></Field>
      </div>
      <p className="text-meta text-ink-muted">
        Ese día aparece solo como <span className="font-medium text-ink">por pagar</span>. El dinero sale recién cuando lo marcas como pagado, y ahí puedes corregir el monto si cambió.
      </p>
    </Sheet>
  );
}
