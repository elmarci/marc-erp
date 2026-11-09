import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Edit, UserX, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatDateTime, ROLE_LABELS, STATUS_LABELS } from '@/lib/utils';
import { UserFormModal, EditableUser } from './UserFormModal';
import type { WorkSchedule } from '@/modules/attendance/attendance';

interface User {
  id: string; email: string; username: string; firstName: string; lastName: string; phone: string | null;
  role: string; status: string; lastLoginAt: string | null; workSchedule: WorkSchedule | null;
}

export function UsersPage() {
  const queryClient = useQueryClient();
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => setForm({})}><Plus className="mr-2 h-4 w-4" />Nuevo usuario</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : (data?.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <Users className="h-12 w-12 opacity-20" />
              <p>No hay usuarios registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Usuario</th>
                    <th className="px-4 py-3 text-left font-medium">Correo</th>
                    <th className="px-4 py-3 text-center font-medium">Rol</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Último acceso</th>
                    <th className="px-4 py-3 text-center font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.data ?? []).map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{user.username}
                          {user.workSchedule && <span className="ml-2 inline-flex items-center gap-1"><Clock className="h-3 w-3" />con horario</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={user.status === 'ACTIVE' ? 'success' : user.status === 'LOCKED' ? 'destructive' : 'secondary'}>
                          {STATUS_LABELS[user.status] ?? user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setForm({ user })}><Edit className="h-4 w-4" /></Button>
                          {user.status === 'ACTIVE' && (
                            <Button variant="ghost" size="icon-sm" className="text-destructive"
                              onClick={() => { if (confirm('¿Desactivar usuario?')) deactivateMutation.mutate(user.id); }}>
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
