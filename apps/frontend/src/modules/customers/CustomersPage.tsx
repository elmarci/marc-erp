// Clientes: lista con búsqueda, filtro de tienda online y su ficha (compras,
// consumos, deuda). Crear, editar, cobrar deuda y eliminar.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, ShoppingCart, Trash2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, EmptyState, FilterBar, PageHeader, Pagination, RowMenu, StatusBadge, surfaceCls, tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';
import { downloadExcel } from '@/lib/exportExcel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CustomerDetail } from './CustomerDetail';
import { CustomerModal } from './CustomerForms';
import { TYPE_LABELS, fullName, hasStoreAccount, type Customer } from './types';

const PAGE_SIZE = 25;

export function CustomersPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [detailCustomer, setDetailCustomer] = useState<Customer | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, debouncedSearch, onlineOnly],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page), limit: String(PAGE_SIZE),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(onlineOnly ? { onlineOnly: 'true' } : {}),
      });
      return (await api.get<{ data: Customer[]; pagination: { total: number; totalPages: number } }>(`/customers?${params}`)).data;
    },
  });
  const customers = data?.data ?? [];
  // La ficha abierta se actualiza con la lista (por ejemplo, el saldo tras
  // cobrar una deuda).
  const detail = detailCustomer ? (customers.find((c) => c.id === detailCustomer.id) ?? detailCustomer) : undefined;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); toast.success('Cliente eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openEdit = (c: Customer) => { setEditCustomer(c); setDetailCustomer(undefined); setShowModal(true); };
  const remove = async (c: Customer) => {
    const r = await confirm({ title: `Eliminar a ${fullName(c)}`, confirmLabel: 'Eliminar', tone: 'danger' });
    if (r.ok) deleteMutation.mutate(c.id);
  };

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Clientes" actions={<>
        <Btn className="hidden sm:inline-flex"
          onClick={() => downloadExcel(`/customers/export${search ? `?search=${encodeURIComponent(search)}` : ''}`, 'clientes.xlsx')}>
          <FileSpreadsheet />Exportar Excel
        </Btn>
        <Btn variant="primary" onClick={() => { setEditCustomer(undefined); setShowModal(true); }}><Plus />Nuevo cliente</Btn>
      </>}>
        <p className="text-table text-ink-muted">{data ? `${data.pagination.total.toLocaleString('es-PE')} clientes` : 'Base de datos de clientes'}</p>
      </PageHeader>

      <div className={cn('overflow-hidden', surfaceCls)}>
        <FilterBar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: 'Buscar por nombre, DNI, teléfono' }}
          quick={
            <button type="button" aria-pressed={onlineOnly} onClick={() => { setOnlineOnly((v) => !v); setPage(1); }}
              className={cn('tap inline-flex h-8 items-center gap-1.5 rounded-ctl px-2.5 text-table font-medium transition-colors [&_svg]:size-4',
                onlineOnly ? 'bg-brand text-white' : 'text-ink-muted shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2 hover:text-ink')}>
              <ShoppingCart />Solo tienda online
            </button>
          }
          chips={[
            ...(search ? [{ key: 'q', label: 'Búsqueda', value: search, onRemove: () => { setSearch(''); setPage(1); } }] : []),
            ...(onlineOnly ? [{ key: 'on', label: 'Solo', value: 'Tienda online', onRemove: () => { setOnlineOnly(false); setPage(1); } }] : []),
          ]}
          onClear={() => { setSearch(''); setOnlineOnly(false); setPage(1); }}
        />

        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : customers.length === 0 ? <EmptyState icon={UserCheck} title={search ? 'No se encontraron clientes.' : 'No hay clientes registrados.'} /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Cliente</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Documento</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Teléfono</th>
                <th className={cn(thCls, 'hidden lg:table-cell')}>Tipo</th>
                <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Límite</th>
                <th className={cn(thCls, 'text-right')}>Saldo deuda</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Estado</th>
                <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} tabIndex={0} aria-label={`Ver ficha de ${fullName(c)}`} onClick={() => setDetailCustomer(c)}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetailCustomer(c); } }}
                    className="cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div className="flex items-center gap-1.5 font-medium">
                        {fullName(c)}
                        {hasStoreAccount(c) && <ShoppingCart className="size-3.5 text-ink-muted" aria-label="Registrado en la tienda online" />}
                      </div>
                      {c.businessName && <div className="text-meta text-ink-muted">{c.businessName}</div>}
                    </td>
                    <td className={cn(tdCls, 'hidden tabular-nums text-ink-muted md:table-cell')}>{c.taxId ? `${c.taxIdType ?? ''} ${c.taxId}` : '—'}</td>
                    <td className={cn(tdCls, 'hidden tabular-nums text-ink-muted sm:table-cell')}>{c.phone ?? '—'}</td>
                    <td className={cn(tdCls, 'hidden text-ink-muted lg:table-cell')}>{TYPE_LABELS[c.type] ?? c.type}</td>
                    <td className={cn(tdCls, 'hidden text-right tabular-nums lg:table-cell')}>{formatCurrency(c.creditLimit)}</td>
                    <td className={cn(tdCls, 'text-right font-semibold tabular-nums', Number(c.currentBalance) > 0 ? 'text-bad-ink' : 'text-ink-muted')}>{formatCurrency(c.currentBalance)}</td>
                    <td className={cn(tdCls, 'hidden md:table-cell')}><StatusBadge tone={c.isActive ? 'ok' : 'muted'}>{c.isActive ? 'Activo' : 'Inactivo'}</StatusBadge></td>
                    <td className={cn(tdCls, 'px-1')}>
                      <RowMenu label={`Acciones de ${fullName(c)}`} actions={[
                        { label: 'Editar', icon: Pencil, onSelect: () => openEdit(c) },
                        { label: 'Eliminar', icon: Trash2, danger: true, separated: true, onSelect: () => remove(c) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={PAGE_SIZE} onPage={setPage} />
        )}
      </div>

      {showModal && <CustomerModal customer={editCustomer} onClose={() => { setShowModal(false); setEditCustomer(undefined); }} />}
      {detail && <CustomerDetail customer={detail} onEdit={() => openEdit(detail)} onClose={() => setDetailCustomer(undefined)} />}
    </div>
  );
}
