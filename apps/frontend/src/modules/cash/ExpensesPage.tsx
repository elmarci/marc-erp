// Gastos: página propia (antes era una pestaña dentro de Caja General). Mismos
// datos y acciones: registrar, pagar los "por pagar", corregir, anular,
// categorías y gastos recurrentes.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Repeat, Tags } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, EmptyState, PageHeader, PageTabs, Panel, RowMenu, Segmented, StatCard, StatGrid, StatusBadge, tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDateTime, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { ExpenseActionModal, ExpenseModal, expenseDocText, formatPeriod, limaMonth, type ExpenseRow } from './ExpenseForms';
import { ExpenseCategoriesModal, RecurringTemplateModal } from './ExpenseSettings';
import { EXPENSE_CATEGORY_LABELS, type RecurringTemplate } from './types';

type Tab = 'gastos' | 'recurrentes';
type Show = 'all' | 'pending' | 'voided';

function ExpensesList({ onAction }: { onAction: (a: { expense: ExpenseRow; mode: 'edit' | 'void' | 'pay' }) => void }) {
  const [show, setShow] = useState<Show>('all');
  const { data: expenses, isLoading } = useQuery({
    queryKey: ['treasury-expenses'],
    queryFn: async () => (await api.get<{ data: ExpenseRow[] }>('/treasury/expenses?limit=50&includeVoided=true')).data.data,
  });
  const all = expenses ?? [];
  const pending = all.filter((e) => e.isPending && !e.voidedAt);
  const thisMonth = limaMonth();
  const monthPaid = all.filter((e) => !e.voidedAt && !e.isPending && e.period === thisMonth).reduce((a, e) => a + Number(e.amount), 0);
  const shown = show === 'pending' ? pending : show === 'voided' ? all.filter((e) => e.voidedAt) : all;

  return (
    <div className="flex flex-col gap-5">
      <StatGrid cols={3}>
        <StatCard label="Por pagar" value={<span className={cn(pending.length > 0 && 'text-bad-ink')}>{formatCurrency(pending.reduce((a, e) => a + Number(e.amount), 0))}</span>}
          hint={`${pending.length} gasto${pending.length === 1 ? '' : 's'}`} />
        <StatCard label={`Pagado de ${formatPeriod(thisMonth)}`} value={formatCurrency(monthPaid)} hint="Entre los últimos 50 registrados" />
        <StatCard label="Registrados" value={String(all.length)} hint="Últimos 50, con anulados" />
      </StatGrid>

      <Panel title="Gastos" meta="Últimos 50"
        actions={<Segmented value={show} onChange={setShow} ariaLabel="Mostrar"
          options={[['all', 'Todos'], ['pending', `Por pagar${pending.length ? ` (${pending.length})` : ''}`], ['voided', 'Anulados']]} />}>
        {isLoading ? <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando…</div>
          : shown.length === 0 ? <EmptyState icon={Receipt} title={show === 'pending' ? 'No hay gastos por pagar' : show === 'voided' ? 'No hay gastos anulados' : 'Sin gastos registrados'} /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Gasto</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Categoría</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Fecha</th>
                <th className={cn(thCls, 'hidden lg:table-cell')}>Estado</th>
                <th className={cn(thCls, 'text-right')}>Monto</th>
                <th className={cn(thCls, 'w-10')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const docText = expenseDocText(e);
                  const otherMonth = e.period !== limaMonth(new Date(e.expenseDate));
                  const sub = [e.payeeName, e.payeeTaxId ? `RUC ${e.payeeTaxId}` : null, docText].filter(Boolean).join(' · ');
                  const voided = !!e.voidedAt;
                  return (
                    <tr key={e.id} className={cn('hover:bg-surface-2', voided && 'text-ink-muted')}>
                      <td className={cn(tdCls, 'py-2')}>
                        <div className={cn('font-medium', voided && 'line-through')}>
                          {e.description}
                          {e.templateId && <span className="ml-2 text-meta font-normal text-ink-muted">recurrente</span>}
                        </div>
                        {(sub || e.receiptUrl) && (
                          <div className="text-meta text-ink-muted">
                            {sub}
                            {e.receiptUrl && <>{sub && ' · '}<a href={e.receiptUrl} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">ver foto</a></>}
                          </div>
                        )}
                        {voided && <div className="text-meta">Anulado: {e.voidReason}</div>}
                        <div className="text-meta text-ink-muted md:hidden">{e.categoryDef?.name ?? EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden md:table-cell')}>{e.categoryDef?.name ?? EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</td>
                      <td className={cn(tdCls, 'hidden whitespace-nowrap text-ink-muted sm:table-cell')}>
                        <div className="tabular-nums">{e.isPending ? `vence ${formatDateTime(e.expenseDate).slice(0, 10)}` : formatDateTime(e.expenseDate)}</div>
                        <div className="text-meta">{e.isPending ? '' : PAYMENT_METHOD_LABELS[e.method] ?? e.method}{otherMonth && `${e.isPending ? '' : ' · '}de ${formatPeriod(e.period)}`}</div>
                      </td>
                      <td className={cn(tdCls, 'hidden lg:table-cell')}>
                        {voided ? <StatusBadge tone="muted">Anulado</StatusBadge>
                          : e.isPending ? <StatusBadge tone="warn">Por pagar</StatusBadge> : <StatusBadge tone="ok">Pagado</StatusBadge>}
                      </td>
                      <td className={cn(tdCls, 'text-right font-medium tabular-nums', voided && 'line-through')}>
                        {formatCurrency(e.amount)}
                        {e.isPending && !voided && <div className="text-meta font-normal text-bad-ink lg:hidden">Por pagar</div>}
                      </td>
                      <td className={cn(tdCls, 'px-1 text-right')}>
                        {!voided && (
                          <div className="flex items-center justify-end gap-1">
                            {e.isPending && <Btn size="sm" variant="primary" onClick={() => onAction({ expense: e, mode: 'pay' })}>Pagar</Btn>}
                            <RowMenu label={`Acciones de ${e.description}`} actions={[
                              { label: 'Corregir', onSelect: () => onAction({ expense: e, mode: 'edit' }) },
                              { label: 'Anular', danger: true, onSelect: () => onAction({ expense: e, mode: 'void' }) },
                            ]} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RecurringList({ onNew }: { onNew: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: templates, isLoading } = useQuery({
    queryKey: ['treasury-recurring'],
    queryFn: async () => (await api.get<{ data: RecurringTemplate[] }>('/treasury/recurring-expenses')).data.data,
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/treasury/recurring-expenses/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/treasury/recurring-expenses/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] }); toast.success('Plantilla eliminada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const askRemove = async (t: RecurringTemplate) => {
    const ok = await confirm({
      title: `Eliminar "${t.description}"`,
      description: 'Ya no aparecerá cada mes como gasto por pagar. Los gastos que ya generó no se borran.',
      confirmLabel: 'Eliminar', tone: 'danger',
    });
    if (ok) remove.mutate(t.id);
  };

  return (
    <Panel title="Gastos recurrentes" meta="Cada mes aparecen solos como por pagar">
      {isLoading ? <div className="px-4 py-10 text-center text-table text-ink-muted">Cargando…</div>
        : !templates || templates.length === 0 ? (
          <EmptyState icon={Repeat} title="Sin gastos recurrentes configurados" action={<Btn size="sm" onClick={onNew}><Plus />Nuevo gasto recurrente</Btn>} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Gasto</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Cuándo</th>
                <th className={cn(thCls, 'text-right')}>Monto</th>
                <th className={thCls}>Estado</th>
                <th className={cn(thCls, 'w-10')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'py-2')}>
                      <div className="font-medium">{t.description}</div>
                      <div className="text-meta text-ink-muted">
                        {t.categoryDef?.name ?? EXPENSE_CATEGORY_LABELS[t.category] ?? t.category}{t.payeeName ? ` · ${t.payeeName}` : ''}
                      </div>
                    </td>
                    <td className={cn(tdCls, 'hidden text-ink-muted sm:table-cell')}>
                      Cada mes el día {t.dayOfMonth}, por pagar
                      {t.lastGeneratedPeriod && <div className="text-meta">Último generado: {t.lastGeneratedPeriod}</div>}
                    </td>
                    <td className={cn(tdCls, 'text-right font-medium tabular-nums')}>{formatCurrency(t.amount)}</td>
                    <td className={tdCls}><StatusBadge tone={t.isActive ? 'ok' : 'muted'}>{t.isActive ? 'Activo' : 'Pausado'}</StatusBadge></td>
                    <td className={cn(tdCls, 'px-1 text-right')}>
                      <RowMenu label={`Acciones de ${t.description}`} actions={[
                        { label: t.isActive ? 'Pausar' : 'Activar', onSelect: () => toggle.mutate({ id: t.id, isActive: !t.isActive }) },
                        { label: 'Eliminar', danger: true, onSelect: () => askRemove(t) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Panel>
  );
}

export function ExpensesPage() {
  const { hasMinRole } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'recurrentes' ? 'recurrentes' : 'gastos';
  const setTab = (t: Tab) => setParams(() => (t === 'gastos' ? new URLSearchParams() : new URLSearchParams({ tab: t })), { replace: true });
  const [showExpense, setShowExpense] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [action, setAction] = useState<{ expense: ExpenseRow; mode: 'edit' | 'void' | 'pay' } | null>(null);

  if (!hasMinRole('SUPERVISOR')) {
    return <div className="erp"><EmptyState icon={Receipt} title="Solo supervisores y administradores pueden ver los gastos." /></div>;
  }

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Gastos" actions={<>
        <Btn onClick={() => setShowCategories(true)}><Tags />Categorías</Btn>
        <Btn onClick={() => setShowTemplate(true)}><Repeat />Nuevo recurrente</Btn>
        <Btn variant="primary" onClick={() => setShowExpense(true)}><Plus />Registrar gasto</Btn>
      </>} />
      <PageTabs value={tab} onChange={setTab} tabs={[['gastos', 'Gastos'], ['recurrentes', 'Recurrentes']]} />
      {tab === 'gastos' ? <ExpensesList onAction={setAction} /> : <RecurringList onNew={() => setShowTemplate(true)} />}

      {showExpense && <ExpenseModal onClose={() => setShowExpense(false)} />}
      {action && <ExpenseActionModal {...action} onClose={() => setAction(null)} />}
      {showCategories && <ExpenseCategoriesModal onClose={() => setShowCategories(false)} />}
      {showTemplate && <RecurringTemplateModal onClose={() => setShowTemplate(false)} />}
    </div>
  );
}
