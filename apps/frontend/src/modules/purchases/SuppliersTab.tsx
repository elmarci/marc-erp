import { Btn, StatusBadge, surfaceCls, useConfirm } from '@/components/erp';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, BookOpen, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';
import { downloadExcel } from '@/lib/exportExcel';
import { SupplierCatalogModal, SupplierModal } from './SupplierModals';
import { Supplier } from './types';

export function SuppliersTab() {
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | undefined>();
  const [catalogSupplier, setCatalogSupplier] = useState<Supplier | undefined>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: async () => (await api.get<{ data: Supplier[] }>(`/suppliers?search=${search}&limit=50`)).data.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Proveedor eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <Input className="pl-9" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Btn
          onClick={() => downloadExcel(`/suppliers/export${search ? `?search=${encodeURIComponent(search)}` : ''}`, 'proveedores.xlsx')}>
          <FileSpreadsheet />Exportar Excel
        </Btn>
        <Btn variant="primary" onClick={() => { setEditSupplier(undefined); setShowModal(true); }}>
          <Plus />Nuevo Proveedor
        </Btn>
      </div>

      <div className={surfaceCls}>
        {isLoading ? <div className="py-12 text-center text-ink-muted">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b bg-surface-2 text-meta uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 text-left font-semibold">Razón social</th>
                  <th className="px-4 py-3 text-left font-semibold">RUC</th>
                  <th className="px-4 py-3 text-left font-semibold">Contacto</th>
                  <th className="px-4 py-3 text-left font-semibold">Teléfono</th>
                  <th className="px-4 py-3 text-center font-semibold">Órdenes</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data ?? []).map(s => (
                  <tr key={s.id} className="hover:bg-ink/[0.03]">
                    <td className="px-4 py-3.5 font-semibold">{s.businessName}</td>
                    <td className="px-4 py-3.5 text-ink-muted">{s.taxId ?? '—'}</td>
                    <td className="px-4 py-3.5">{s.contactName ?? '—'}</td>
                    <td className="px-4 py-3.5">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-center">{s._count?.purchaseOrders ?? 0}</td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge tone={s.isActive ? 'ok' : 'muted'}>{s.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1">
                        <Btn variant="ghost" size="sm" onClick={() => setCatalogSupplier(s)}>
                          <BookOpen />Catálogo
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => { setEditSupplier(s); setShowModal(true); }}>Editar</Btn>
                        <Btn variant="ghost" size="sm" className="hover:text-bad-ink"
                          onClick={async () => {
                            const r = await confirm({ title: `Eliminar el proveedor ${s.businessName}`, description: 'Sus compras pasadas se mantienen.', confirmLabel: 'Eliminar' });
                            if (r.ok) deleteMutation.mutate(s.id);
                          }}>
                          Eliminar
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-ink-muted">No hay proveedores registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <SupplierModal
          supplier={editSupplier}
          onClose={() => setShowModal(false)}
          onSaved={() => setShowModal(false)}
        />
      )}
      {catalogSupplier && <SupplierCatalogModal supplier={catalogSupplier} onClose={() => setCatalogSupplier(undefined)} />}
    </div>
  );
}

/* ─── Orders Tab ────────────────────────────────────────────────────────── */
