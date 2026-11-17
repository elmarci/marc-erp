import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, X, BookOpen, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Modal, useConfirm } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';
import { formatCost, formatDateTime, cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Product, Supplier, SupplierCatalogItem } from './types';

export function SupplierModal({ supplier, onClose, onSaved }: {
  supplier?: Supplier; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    businessName: supplier?.businessName ?? '',
    taxId: supplier?.taxId ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    city: supplier?.city ?? '',
    paymentTermDays: String(supplier?.paymentTermDays ?? 30),
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => supplier
      ? api.put(`/suppliers/${supplier.id}`, { ...form, paymentTermDays: Number(form.paymentTermDays) })
      : api.post('/suppliers', { ...form, paymentTermDays: Number(form.paymentTermDays) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(supplier ? 'Proveedor actualizado.' : 'Proveedor creado.');
      onSaved();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }));

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="md" keepOpen
      title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!form.businessName}>Guardar</Btn>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-body font-medium">Razón social *</label>
            <Input value={form.businessName} onChange={f('businessName')} placeholder="Distribuidora ABC S.A.C." />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">RUC</label>
            <Input value={form.taxId} onChange={f('taxId')} placeholder="20XXXXXXXXX" maxLength={11} />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Contacto</label>
            <Input value={form.contactName} onChange={f('contactName')} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Email</label>
            <Input type="email" value={form.email} onChange={f('email')} placeholder="ventas@proveedor.com" />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Teléfono</label>
            <Input value={form.phone} onChange={f('phone')} placeholder="987654321" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-body font-medium">Dirección</label>
            <Input value={form.address} onChange={f('address')} placeholder="Av. Los Proveedores 123" />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Ciudad</label>
            <Input value={form.city} onChange={f('city')} placeholder="Lima" />
          </div>
          <div>
            <label className="mb-1 block text-body font-medium">Plazo pago (días)</label>
            <Input type="number" value={form.paymentTermDays} onChange={f('paymentTermDays')} min={0} />
          </div>
        </div>
    </Modal>
  );
}

/* ─── Supplier Catalog Modal (qué vende cada proveedor y a qué precio) ──── */
export function SupplierCatalogModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [draft, setDraft] = useState<{ productId: string; name: string; price: string } | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['supplier-products', supplier.id],
    queryFn: async () => (await api.get<{ data: SupplierCatalogItem[] }>(`/suppliers/${supplier.id}/products`)).data.data,
  });

  const { data: products } = useQuery({
    queryKey: ['products-search-catalog', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Product[] }>(`/products?q=${debouncedSearch}&limit=15`)).data.data,
    enabled: debouncedSearch.length >= 2,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['supplier-products', supplier.id] });

  const addMutation = useMutation({
    mutationFn: (data: { productId: string; price: number }) => api.post(`/suppliers/${supplier.id}/products`, data),
    onSuccess: () => { invalidate(); setDraft(null); toast.success('Producto agregado al catálogo.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { productId: string; price: number; isPreferred?: boolean }) =>
      api.put(`/suppliers/${supplier.id}/products/${data.productId}`, { price: data.price, isPreferred: data.isPreferred }),
    onSuccess: invalidate,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => api.delete(`/suppliers/${supplier.id}/products/${productId}`),
    onSuccess: () => { invalidate(); toast.success('Producto quitado del catálogo.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const existingIds = new Set((catalog ?? []).map(c => c.productId));

  return (
    <Modal open onOpenChange={(v) => { if (!v) (onClose)(); }} size="md" keepOpen
      title={<>Catálogo — {supplier.businessName}</>} description={<>Qué productos vende este proveedor y a qué precio, para armar pedidos y comparar precios.</>}
      footer={<>
        <Btn onClick={onClose}>Cerrar</Btn>
      </>}
    >
      <div className="space-y-4">
          <div>
            <label className="mb-1 block text-body font-medium">Agregar producto al catálogo</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input className="pl-9" placeholder="Buscar producto por nombre o código..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {products && products.length > 0 && search.length >= 2 && (
              <div className="border rounded-srf mt-1 divide-y max-h-40 overflow-y-auto bg-surface shadow-lg">
                {products.map(p => (
                  <button key={p.id} disabled={existingIds.has(p.id)} onClick={() => { setDraft({ productId: p.id, name: p.name, price: String(p.costPrice) }); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-body hover:bg-ink/[0.03] flex justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                    <span>{p.name}</span>
                    <span className="text-ink-muted">{existingIds.has(p.id) ? 'Ya en catálogo' : formatCost(p.costPrice)}</span>
                  </button>
                ))}
              </div>
            )}
            {draft && (
              <div className="mt-2 flex items-center gap-2 rounded-srf border p-3">
                <span className="flex-1 text-body font-medium truncate">{draft.name}</span>
                <span className="text-body text-ink-muted">S/</span>
                <Input type="number" min={0} step={0.0001} value={draft.price} autoFocus
                  onChange={e => setDraft(d => d && { ...d, price: e.target.value })} className="h-8 w-24 text-right" />
                <Btn variant="primary" size="sm" loading={addMutation.isPending} disabled={!draft.price}
                  onClick={() => addMutation.mutate({ productId: draft.productId, price: Number(draft.price) })}>
                  Agregar
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setDraft(null)}><X className="h-3.5 w-3.5" /></Btn>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-ink-muted">Cargando catálogo...</div>
          ) : (catalog ?? []).length === 0 ? (
            <div className="py-8 text-center text-ink-muted text-body">
              Este proveedor aún no tiene productos registrados. Se agregan solos al crear/recibir órdenes de compra, o puedes registrarlos aquí manualmente.
            </div>
          ) : (
            <table className="w-full text-body">
              <thead>
                <tr className="border-b text-left text-meta text-ink-muted">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium text-right w-28">Precio</th>
                  <th className="py-2 font-medium text-center w-16">Preferido</th>
                  <th className="py-2 font-medium text-right w-28">Última compra</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {catalog!.map(item => (
                  <tr key={item.productId}>
                    <td className="py-2">
                      <p className="font-medium">{item.product.name}</p>
                      {item.product.barcode && <p className="text-meta text-ink-muted font-mono">{item.product.barcode}</p>}
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" min={0} step={0.0001} defaultValue={item.price}
                        onBlur={e => {
                          const price = Number(e.target.value);
                          if (price !== item.price) updateMutation.mutate({ productId: item.productId, price, isPreferred: item.isPreferred });
                        }}
                        className="h-8 text-right" />
                    </td>
                    <td className="py-2 text-center">
                      <button onClick={() => updateMutation.mutate({ productId: item.productId, price: item.price, isPreferred: !item.isPreferred })}
                        title={item.isPreferred ? 'Proveedor preferido para este producto' : 'Marcar como preferido'}>
                        <Star className={cn('h-4 w-4 mx-auto', item.isPreferred ? 'fill-warn text-warn' : 'text-ink-muted')} />
                      </button>
                    </td>
                    <td className="py-2 text-right text-meta text-ink-muted">
                      {item.lastPurchaseAt ? formatDateTime(item.lastPurchaseAt) : 'Sin compras aún'}
                    </td>
                    <td className="py-2">
                      <Btn variant="ghost" size="sm" className="w-8 px-0 hover:text-bad-ink"
                        onClick={async () => {
                          const r = await confirm({ title: `Quitar "${item.product.name}" del catálogo`, description: `Deja de figurar como producto de ${supplier.businessName}. No cambia el stock ni compras pasadas.`, confirmLabel: 'Quitar' });
                          if (r.ok) removeMutation.mutate(item.productId);
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </Modal>
  );
}

/* ─── Print de comprobante de compra ─────────────────────────────────────── */
