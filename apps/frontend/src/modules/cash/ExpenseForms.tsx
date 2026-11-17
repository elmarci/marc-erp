import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ImageOff, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoneyInput } from '@/components/ui/money-input';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { DOC_TYPE_LABELS, isValidRuc } from '@/modules/purchases/SupplierDocuments';

/* ─── Datos ─────────────────────────────────────────────────────────────── */

// Grupo fijo de cada categoría: es lo que usa el estado de resultados.
export const EXPENSE_GROUP_LABELS: Record<string, string> = {
  PERSONNEL: 'Personal', BAGS: 'Bolsas y empaques', TRANSPORT: 'Transporte', SYSTEM: 'Sistemas y software',
  WATER: 'Agua', ELECTRICITY: 'Luz', RENT: 'Alquiler', TAXES: 'Impuestos', OTHER: 'Otros gastos',
};

export interface ExpenseCategoryDef {
  id: string; name: string; group: string; isActive: boolean; _count?: { expenses: number };
}

export interface ExpenseRow {
  id: string; category: string; categoryId: string | null; description: string; amount: number;
  method: string; expenseDate: string; period: string; isPending: boolean; templateId: string | null;
  payeeName: string | null; payeeTaxId: string | null;
  docType: string | null; docSeries: string | null; docNumber: string | null; receiptUrl: string | null;
  reference: string | null; notes: string | null;
  voidedAt: string | null; voidReason: string | null;
  categoryDef?: { id: string; name: string } | null;
}

export function useExpenseCategories(all = false) {
  return useQuery({
    queryKey: ['expense-categories', all],
    queryFn: async () => (await api.get<{ data: ExpenseCategoryDef[] }>(`/treasury/expense-categories${all ? '?all=true' : ''}`)).data.data,
    staleTime: 60_000,
  });
}

const EXPENSE_QUERY_KEYS = ['treasury-balance', 'treasury-movements', 'treasury-expenses', 'treasury-expenses-summary', 'cash-session'];

/** "2026-10" en hora de Lima. */
export function limaMonth(date = new Date()) {
  return new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 7);
}
const limaDay = (date = new Date()) => new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

export function formatPeriod(period: string) {
  const [y, m] = period.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' });
  return `${name} ${y}`;
}

export function expenseDocText(e: Pick<ExpenseRow, 'docType' | 'docSeries' | 'docNumber'>) {
  const number = [e.docSeries, e.docNumber].filter(Boolean).join('-');
  if (!e.docType && !number) return null;
  return [e.docType ? DOC_TYPE_LABELS[e.docType] : null, number].filter(Boolean).join(' ');
}

/* ─── Piezas ────────────────────────────────────────────────────────────── */

function Sheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">{children}</div>
        <div className="border-t p-4">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ReceiptPhoto({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      return (await api.post<{ data: { url: string } }>('/treasury/expenses/receipt-photo', form)).data.data.url;
    },
    onSuccess: (u) => onChange(u),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <div className="flex items-center gap-3">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" className="block h-14 w-14 overflow-hidden rounded-md bg-muted">
            <img src={url} alt="Comprobante" className="h-full w-full object-cover" />
          </a>
          <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()} loading={upload.isPending}>Cambiar</Button>
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onChange('')}>
            <ImageOff className="mr-1 h-3.5 w-3.5" />Quitar
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={upload.isPending}>
          <Camera className="mr-1.5 h-4 w-4" />Foto del comprobante
        </Button>
      )}
    </div>
  );
}

interface DocState { payeeName: string; payeeTaxId: string; docType: string; docSeries: string; docNumber: string; receiptUrl: string }

function ExpenseDocSection({ value, onChange }: { value: DocState; onChange: (v: DocState) => void }) {
  const set = (patch: Partial<DocState>) => onChange({ ...value, ...patch });
  const ruc = value.payeeTaxId.trim();
  const rucBad = ruc.length > 0 && !(/^\d{8}$/.test(ruc) || isValidRuc(ruc));
  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <div className="grid grid-cols-5 gap-2">
        <Field label="A quién se pagó" className="col-span-3">
          <Input value={value.payeeName} maxLength={120} placeholder="Luz del Sur, el gasfitero…" onChange={(e) => set({ payeeName: e.target.value })} />
        </Field>
        <Field label="RUC o DNI" className="col-span-2">
          <Input value={value.payeeTaxId} maxLength={11} inputMode="numeric" className={cn(rucBad && 'border-destructive')}
            onChange={(e) => set({ payeeTaxId: e.target.value.replace(/\D/g, '') })} />
        </Field>
      </div>
      {rucBad && <p className="-mt-2 text-xs text-destructive">Ese RUC no pasa la verificación. Revisa los dígitos.</p>}
      <div className="grid grid-cols-5 gap-2">
        <Field label="Comprobante" className="col-span-2">
          <Select value={value.docType} onChange={(e) => set({ docType: e.target.value })}>
            <option value="">Ninguno</option>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Serie" className="col-span-1">
          <Input value={value.docSeries} maxLength={10} placeholder="F001" onChange={(e) => set({ docSeries: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Número" className="col-span-2">
          <Input value={value.docNumber} maxLength={20} onChange={(e) => set({ docNumber: e.target.value })} />
        </Field>
      </div>
      <ReceiptPhoto url={value.receiptUrl} onChange={(receiptUrl) => set({ receiptUrl })} />
    </div>
  );
}

const docBody = (d: DocState) => ({
  payeeName: d.payeeName.trim() || null,
  payeeTaxId: d.payeeTaxId.trim() || null,
  docType: d.docType || null,
  docSeries: d.docSeries.trim() || null,
  docNumber: d.docNumber.trim() || null,
  receiptUrl: d.receiptUrl || null,
});
const docInvalid = (d: DocState) => {
  const ruc = d.payeeTaxId.trim();
  return ruc.length > 0 && !(/^\d{8}$/.test(ruc) || isValidRuc(ruc));
};

function CategorySelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: categories } = useExpenseCategories();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Elegir…</option>
      {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );
}

/* ─── Registrar gasto ───────────────────────────────────────────────────── */

export function ExpenseModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [method, setMethod] = useState('CASH');
  const [date, setDate] = useState(limaDay());
  const [period, setPeriod] = useState(limaMonth());
  const [showDoc, setShowDoc] = useState(false);
  const [doc, setDoc] = useState<DocState>({ payeeName: '', payeeTaxId: '', docType: '', docSeries: '', docNumber: '', receiptUrl: '' });

  const pending = status === 'pending';
  const otherMonth = period !== date.slice(0, 7);
  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/expenses', {
      categoryId, description: description.trim(), amount: parseFloat(amount),
      method: pending ? undefined : method,
      isPending: pending,
      expenseDate: date,
      period,
      ...docBody(doc),
    }),
    onSuccess: () => {
      EXPENSE_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success(pending ? 'Gasto registrado como por pagar. No salió dinero todavía.' : 'Gasto registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const valid = !!categoryId && !!description.trim() && parseFloat(amount) > 0 && !!period && !docInvalid(doc);

  return (
    <Sheet title="Registrar gasto" onClose={onClose} footer={
      <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
        {pending ? 'Guardar por pagar' : `Registrar gasto${parseFloat(amount) > 0 ? ` de ${formatCurrency(parseFloat(amount))}` : ''}`}
      </Button>
    }>
      <Segmented value={status} onChange={setStatus} options={[['paid', 'Ya lo pagué'], ['pending', 'Por pagar']]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría"><CategorySelect value={categoryId} onChange={setCategoryId} /></Field>
        <Field label="Monto">
          <MoneyInput min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field label="Descripción">
        <Input placeholder="Ej: Recibo de luz" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {!pending && (
          <Field label="Cómo se pagó">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        )}
        <Field label={pending ? 'Vence el' : 'Fecha de pago'}>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (!otherMonth) setPeriod(e.target.value.slice(0, 7)); }} />
        </Field>
        <Field label="Corresponde a" className={pending ? '' : 'col-span-2'}
          hint={otherMonth ? `Se cuenta en ${formatPeriod(period)}, aunque se pague en otro mes.` : undefined}>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </div>
      {showDoc ? <ExpenseDocSection value={doc} onChange={setDoc} /> : (
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setShowDoc(true)}>
          + Agregar proveedor, comprobante o foto
        </button>
      )}
    </Sheet>
  );
}

/* ─── Corregir, anular, pagar ───────────────────────────────────────────── */

export function ExpenseActionModal({ expense, mode, onClose }: { expense: ExpenseRow; mode: 'edit' | 'void' | 'pay'; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(expense.categoryId ?? '');
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(Number(expense.amount)));
  const [date, setDate] = useState(limaDay(new Date(expense.expenseDate)));
  const [period, setPeriod] = useState(expense.period);
  const [doc, setDoc] = useState<DocState>({
    payeeName: expense.payeeName ?? '', payeeTaxId: expense.payeeTaxId ?? '', docType: expense.docType ?? '',
    docSeries: expense.docSeries ?? '', docNumber: expense.docNumber ?? '', receiptUrl: expense.receiptUrl ?? '',
  });
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('CASH');
  const [paidAt, setPaidAt] = useState(limaDay());

  const mutation = useMutation({
    mutationFn: () => {
      if (mode === 'void') return api.post(`/treasury/expenses/${expense.id}/void`, { reason });
      if (mode === 'pay') return api.post(`/treasury/expenses/${expense.id}/pay`, { method, paidAt, amount: parseFloat(amount) });
      return api.patch(`/treasury/expenses/${expense.id}`, {
        ...(categoryId ? { categoryId } : {}),
        description: description.trim(), expenseDate: date, period,
        ...(expense.isPending ? { amount: parseFloat(amount) } : {}),
        ...docBody(doc),
      });
    },
    onSuccess: () => {
      EXPENSE_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success(mode === 'edit' ? 'Gasto corregido.'
        : mode === 'pay' ? 'Gasto pagado. El dinero salió de Caja General.'
          : expense.isPending ? 'Gasto anulado.' : 'Gasto anulado. El dinero volvió a su cuenta.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const title = mode === 'edit' ? 'Corregir gasto' : mode === 'pay' ? 'Pagar gasto' : 'Anular gasto';
  const disabled = mode === 'edit'
    ? !description.trim() || docInvalid(doc) || (expense.isPending && !(parseFloat(amount) > 0))
    : mode === 'void' ? reason.trim().length < 3 : !(parseFloat(amount) > 0);

  return (
    <Sheet title={title} onClose={onClose} footer={
      <Button className="w-full" variant={mode === 'void' ? 'destructive' : 'default'} onClick={() => mutation.mutate()}
        loading={mutation.isPending} disabled={disabled}>
        {mode === 'edit' ? 'Guardar cambios' : mode === 'pay' ? `Pagar ${formatCurrency(parseFloat(amount) || 0)}` : 'Anular gasto'}
      </Button>
    }>
      {mode === 'edit' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría"><CategorySelect value={categoryId} onChange={setCategoryId} /></Field>
            {expense.isPending ? (
              <Field label="Monto"><MoneyInput min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            ) : (
              <Field label="Monto" hint="Para cambiarlo, anula y registra de nuevo.">
                <p className="flex h-11 items-center text-base font-bold tabular-nums">{formatCurrency(expense.amount)}</p>
              </Field>
            )}
          </div>
          <Field label="Descripción"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={expense.isPending ? 'Vence el' : 'Fecha de pago'}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Corresponde a"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          </div>
          <ExpenseDocSection value={doc} onChange={setDoc} />
        </>
      )}
      {mode === 'pay' && (
        <>
          <p className="text-sm">
            <span className="font-semibold">{expense.description}</span>
            <span className="text-muted-foreground"> · corresponde a {formatPeriod(expense.period)}</span>
          </p>
          <Field label="Monto del recibo" hint="Corrígelo si el recibo llegó por otro monto.">
            <MoneyInput min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cómo se pagó">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Fecha de pago"><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">El dinero sale de Caja General, de la cuenta del método elegido.</p>
        </>
      )}
      {mode === 'void' && (
        <>
          <p className="text-sm">
            Se anulará <span className="font-semibold">{expense.description}</span> por {formatCurrency(expense.amount)}.
            {expense.isPending ? ' Estaba por pagar, así que no se mueve dinero.' : ' El dinero volverá a la cuenta de donde salió.'} Queda en el historial como anulado.
          </p>
          <Field label="Motivo">
            <Input placeholder="Ej: monto mal digitado" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </>
      )}
    </Sheet>
  );
}

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
          <Button variant="ghost" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button className="flex-1" disabled={editing.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(editing)}>
            <Check className="mr-1.5 h-4 w-4" />Guardar
          </Button>
        </div>
      ) : (
        <Button className="w-full" variant="outline" onClick={() => setEditing({ id: null, name: '', group: 'OTHER' })}>
          <Plus className="mr-1.5 h-4 w-4" />Nueva categoría
        </Button>
      )
    }>
      {editing ? (
        <>
          <Field label="Nombre"><Input autoFocus value={editing.name} maxLength={60} placeholder="Ej: Mantenimiento" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label="En el estado de resultados va como" hint="Agrupa los gastos para comparar mes a mes.">
            <Select value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })}>
              {Object.entries(EXPENSE_GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </>
      ) : (
        <div className="divide-y">
          {(categories ?? []).map((c) => (
            <div key={c.id} className={cn('flex items-center gap-3 py-2.5', !c.isActive && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {EXPENSE_GROUP_LABELS[c.group] ?? c.group}{c._count ? ` · ${c._count.expenses} gasto${c._count.expenses === 1 ? '' : 's'}` : ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, group: c.group })} aria-label="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => toggle.mutate(c)}>
                {c.isActive ? 'Ocultar' : 'Mostrar'}
              </Button>
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
      <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending}
        disabled={!categoryId || !description.trim() || !(parseFloat(amount) > 0) || !(day >= 1 && day <= 28)}>
        Crear
      </Button>
    }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría"><CategorySelect value={categoryId} onChange={setCategoryId} /></Field>
        <Field label="Monto aproximado"><MoneyInput min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><Input placeholder="Ej: Alquiler del local" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="A quién se paga"><Input placeholder="Opcional" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} /></Field>
        <Field label="Día del mes"><Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Ese día aparece solo como <span className="font-medium text-foreground">por pagar</span>. El dinero sale recién cuando lo marcas como pagado, y ahí puedes corregir el monto si cambió.
      </p>
    </Sheet>
  );
}
