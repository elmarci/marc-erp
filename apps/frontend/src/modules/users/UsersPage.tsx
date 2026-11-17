// Usuarios del ERP: lista, crear, editar (perfil, estado, horario) y desactivar.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Btn, EmptyState, PageHeader, RowMenu, StatusBadge, surfaceCls, tableCls, tdCls, thCls, useConfirm,
} from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatDateTime, ROLE_LABELS, STATUS_LABELS } from '@/lib/utils';
import { UserFormModal, type EditableUser } from './UserFormModal';
import type { WorkSchedule } from '@/modules/attendance/attendance';

interface User {
  id: string; email: string; username: string; firstName: string; lastName: string; phone: string | null;
  role: string; status: string; lastLoginAt: string | null; workSchedule: WorkSchedule | null;
}

const STATUS_TONE: Record<string, 'ok' | 'bad' | 'muted'> = { ACTIVE: 'ok', LOCKED: 'bad' };

export function UsersPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page] = useState(1);
  const [form, setForm] = useState<{ user?: EditableUser } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => {
      const res = await api.get<{ data: User[]; pagination: { total: number; totalPages: number } }>(
        `/users?page=${page}&limit=25`,
      );
      return res.data;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/deactivate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Usuario desactivado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deactivate = async (user: User) => {
    const r = await confirm({ title: `Desactivar a ${user.firstName} ${user.lastName}`, description: 'Ya no podrá ingresar al sistema.', confirmLabel: 'Desactivar' });
    if (r.ok) deactivateMutation.mutate(user.id);
  };
  const users = data?.data ?? [];

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Usuarios" actions={<Btn variant="primary" onClick={() => setForm({})}><Plus />Nuevo usuario</Btn>}>
        <p className="text-table text-ink-muted">{data ? `${data.pagination.total} usuarios` : 'Accesos al sistema'}</p>
      </PageHeader>

      <div className={cn('overflow-hidden', surfaceCls)}>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : users.length === 0 ? <EmptyState icon={Users} title="No hay usuarios registrados" /> : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr>
                <th className={thCls}>Usuario</th>
                <th className={cn(thCls, 'hidden md:table-cell')}>Correo</th>
                <th className={thCls}>Rol</th>
                <th className={thCls}>Estado</th>
                <th className={cn(thCls, 'hidden sm:table-cell')}>Último acceso</th>
                <th className={cn(thCls, 'w-px')}><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-2">
                    <td className={cn(tdCls, 'py-1.5')}>
                      <div className="font-medium">{user.firstName} {user.lastName}</div>
                      <div className="flex items-center gap-2 text-meta text-ink-muted">
                        @{user.username}
                        {user.workSchedule && <span className="inline-flex items-center gap-1"><Clock className="size-3" />con horario</span>}
                      </div>
                    </td>
                    <td className={cn(tdCls, 'hidden text-ink-muted md:table-cell')}>{user.email}</td>
                    <td className={cn(tdCls, 'text-ink-muted')}>{ROLE_LABELS[user.role] ?? user.role}</td>
                    <td className={tdCls}><StatusBadge tone={STATUS_TONE[user.status] ?? 'muted'}>{STATUS_LABELS[user.status] ?? user.status}</StatusBadge></td>
                    <td className={cn(tdCls, 'hidden tabular-nums text-meta text-ink-muted sm:table-cell')}>
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'}
                    </td>
                    <td className={cn(tdCls, 'px-1')}>
                      <div className="flex items-center justify-end gap-1">
                        <Btn size="sm" onClick={() => setForm({ user })}><Pencil />Editar</Btn>
                        <RowMenu label={`Acciones de ${user.firstName} ${user.lastName}`} actions={[
                          { label: 'Desactivar', icon: UserX, danger: true, disabled: user.status !== 'ACTIVE', onSelect: () => deactivate(user) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <UserFormModal
          user={form.user}
          onClose={() => setForm(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['users'] }); if (form.user) setForm(null); }}
        />
      )}
    </div>
  );
}
