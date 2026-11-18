// Historial de cambios: quién cambió qué y cuándo.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pagination, fieldCls, surfaceCls } from '@/components/erp';
import { api } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';

/* ─── Historial de cambios ───────────────────────────────────────────────── */

interface AuditRow {
  id: string; action: string; resource: string; resourceId: string | null; createdAt: string;
  oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null;
  metadata: { label?: string | null } | null;
  user: { firstName: string; lastName: string; username: string } | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  Product: 'Producto', Category: 'Categoría', Brand: 'Marca', Supplier: 'Proveedor', Customer: 'Cliente', User: 'Usuario',
  Setting: 'Configuración', Promotion: 'Oferta', Expense: 'Gasto', RecurringExpenseTemplate: 'Gasto recurrente',
  CashRegister: 'Caja', DocumentSeries: 'Serie de comprobante', TaxRate: 'Impuesto', Payer: 'Pagador', Batch: 'Lote',
  Rider: 'Repartidor', auth: 'Sesión',
};
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó', VOID: 'Anuló', LOGIN: 'Inició sesión', LOGOUT: 'Cerró sesión',
};
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', salePrice: 'Precio de venta', wholesalePrice: 'Precio mayorista', packPrice: 'Precio por paquete',
  packSize: 'Unidades por paquete', minStock: 'Stock mínimo', status: 'Estado', barcode: 'Código de barras',
  categoryId: 'Categoría', supplierId: 'Proveedor', description: 'Descripción', amount: 'Monto', category: 'Categoría',
  expenseDate: 'Fecha del gasto', value: 'Valor', role: 'Rol', isActive: 'Activo', creditLimit: 'Límite de crédito',
  phone: 'Teléfono', email: 'Correo', expiryDate: 'Vencimiento', trackExpiry: 'Controla vencimiento',
  passwordHash: 'Contraseña', pin: 'PIN', voidReason: 'Motivo de anulación', bottleDeposit: 'Garantía de envase',
  isFavorite: 'Favorito', storeFeatured: 'Destacado en tienda', imageUrl: 'Foto', workSchedule: 'Horario',
  firstName: 'Nombre', lastName: 'Apellido', businessName: 'Razón social', taxId: 'RUC/DNI', method: 'Método',
};
const HIDDEN_FIELDS = new Set(['voidedAt', 'voidedById', 'deletedAt', 'id', 'userId']);
const MONEY_FIELDS = new Set(['salePrice', 'wholesalePrice', 'packPrice', 'amount', 'creditLimit', 'bottleDeposit']);

function showValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'vacío';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (MONEY_FIELDS.has(field) && typeof v === 'number') return formatCurrency(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  if (typeof v === 'object') return 'actualizado';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export function AuditTab() {
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), limit: '30' });
    if (resource) q.set('resource', resource);
    if (action) q.set('action', action);
    if (search.trim().length >= 2) q.set('search', search.trim());
    return q.toString();
  }, [resource, action, search, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', params],
    queryFn: async () => (await api.get<{ data: AuditRow[]; resources: string[]; pagination: { total: number; totalPages: number } }>(`/administration/audit-log?${params}`)).data,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="audit-resource">Qué se cambió</label>
          <select id="audit-resource" className={fieldCls} value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }}>
            <option value="">Todo</option>
            {(data?.resources ?? []).map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r] ?? r}</option>)}
            <option value="auth">Sesiones</option>
          </select>
        </div>
        <div className="w-40">
          <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="audit-action">Acción</label>
          <select id="audit-action" className={fieldCls} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {['CREATE', 'UPDATE', 'DELETE', 'VOID'].map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <label className="mb-1.5 block text-table font-medium text-ink" htmlFor="audit-search">Buscar por nombre</label>
          <input id="audit-search" className={fieldCls} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Ej: Leche Gloria" />
        </div>
      </div>

      {isLoading || !data ? <p className="py-10 text-table text-ink-muted">Cargando…</p> : data.data.length === 0 ? (
        <p className="py-10 text-table text-ink-muted">
          Aún no hay cambios registrados con estos filtros. Desde ahora, cada cambio de precio, producto, cliente, gasto o configuración queda anotado aquí.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {data.data.map((row) => {
            const fields = row.action === 'UPDATE' || row.action === 'VOID'
              ? Object.keys(row.newValues ?? {}).filter((f) => !HIDDEN_FIELDS.has(f)) : [];
            return (
              <li key={row.id} className="grid gap-x-6 gap-y-1 py-3 text-table sm:grid-cols-[150px_1fr]">
                <div className="text-ink-muted">
                  <p className="tabular-nums">{formatDateTime(row.createdAt)}</p>
                  <p>{row.user ? `${row.user.firstName} ${row.user.lastName}` : 'Sistema'}</p>
                </div>
                <div>
                  <p>
                    <span className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</span>
                    {row.resource !== 'auth' && <> {(RESOURCE_LABELS[row.resource] ?? row.resource).toLowerCase()}</>}
                    {row.metadata?.label && <span className="font-medium"> {row.metadata.label}</span>}
                  </p>
                  {fields.map((f) => (
                    <p key={f} className="text-ink-muted">
                      {FIELD_LABELS[f] ?? f}: {showValue(f, row.oldValues?.[f])} <span aria-hidden>→</span>{' '}
                      <span className="text-ink">{showValue(f, row.newValues?.[f])}</span>
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className={surfaceCls}>
          <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={30} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
