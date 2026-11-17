// Categorías y subcategorías de productos (Inventario, POS y tienda online):
// crear, editar, controles de vencimiento y precio volátil, imagen.
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, FolderTree, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Btn, Check, EmptyState, Field, Modal, PageHeader, RowMenu, StatusBadge, fieldCls, surfaceCls, useConfirm } from '@/components/erp'
import { api, getErrorMessage } from '@/services/api'
import { cn } from '@/lib/utils'

interface CategoryNode {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  requiresExpiry: boolean
  volatilePricing: boolean
  _count: { products: number; children: number }
  children: CategoryNode[]
}

/* ─── Form Modal ─────────────────────────────────────────────────────── */
function CategoryModal({ category, parentOptions, defaultParentId, onClose }: {
  category?: CategoryNode
  parentOptions: CategoryNode[]
  defaultParentId?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!category
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? defaultParentId ?? '',
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
    imageUrl: category?.imageUrl ?? '',
    requiresExpiry: category?.requiresExpiry ?? false,
    volatilePricing: category?.volatilePricing ?? false,
  })

  const imageUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.append('image', file)
      return api.post<{ data: { imageUrl: string } }>('/categories/upload-image', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (res) => setForm(v => ({ ...v, imageUrl: res.data.data.imageUrl })),
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        parentId: form.parentId || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        imageUrl: form.imageUrl || null,
        requiresExpiry: form.requiresExpiry,
        volatilePricing: form.volatilePricing,
      }
      return isEdit ? api.put(`/categories/${category!.id}`, payload) : api.post('/categories', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-manage'] })
      toast.success(isEdit ? 'Categoría actualizada.' : 'Categoría creada.')
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const toggle = (k: 'isActive' | 'requiresExpiry' | 'volatilePricing') => () => setForm(v => ({ ...v, [k]: !v[k] }))

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={isEdit ? 'Editar categoría' : 'Nueva categoría'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name}>{isEdit ? 'Guardar cambios' : 'Crear categoría'}</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre" required><input className={fieldCls} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="Ej: Licores" autoFocus /></Field>
        <Field label="Categoría padre">
          <select className={fieldCls} value={form.parentId} onChange={e => setForm(v => ({ ...v, parentId: e.target.value }))}>
            <option value="">Ninguna (categoría principal)</option>
            {parentOptions.filter(p => p.id !== category?.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Descripción"><input className={fieldCls} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="Opcional" /></Field>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Orden"><input type="number" className={cn(fieldCls, 'text-right tabular-nums')} value={form.sortOrder} onChange={e => setForm(v => ({ ...v, sortOrder: e.target.value }))} /></Field>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-table font-medium text-ink">
            <Check checked={form.isActive} onChange={toggle('isActive')} label="Activa" />Activa
          </label>
        </div>

        <section className="flex flex-col divide-y divide-line rounded-ctl border border-line">
          <p className="px-3 py-2 text-meta font-medium text-ink-muted">Controles del inventario</p>
          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
            <span className="pt-0.5"><Check checked={form.requiresExpiry} onChange={toggle('requiresExpiry')} label="Vencimiento obligatorio" /></span>
            <span>
              <span className="block text-table font-medium text-ink">Vencimiento obligatorio</span>
              <span className="block text-meta text-ink-muted">
                Lácteos, panadería, carnes y embutidos. No se puede recibir una compra sin fecha de vencimiento y los productos
                (y subcategorías) quedan con el control activado.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
            <span className="pt-0.5"><Check checked={form.volatilePricing} onChange={toggle('volatilePricing')} label="Precio volátil" /></span>
            <span>
              <span className="block text-table font-medium text-ink">Precio volátil (alerta de margen)</span>
              <span className="block text-meta text-ink-muted">
                Frutas y verduras. Si el último costo de compra deja poco margen contra el precio de venta, se avisa para que
                actualices el precio. Los productos a granel siempre tienen esta alerta.
              </span>
            </span>
          </label>
        </section>

        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Imagen</span>
          <div className="flex items-center gap-3">
            {form.imageUrl
              ? <img src={form.imageUrl} alt="" className="size-16 rounded-ctl object-cover shadow-[0_0_0_1px_hsl(var(--line))]" />
              : <div className="grid size-16 place-items-center rounded-ctl bg-ink/[0.04] text-ink-muted shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]"><ImagePlus className="size-5" /></div>}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) imageUploadMutation.mutate(f) }} />
            <Btn size="sm" loading={imageUploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>{form.imageUrl ? 'Cambiar' : 'Subir imagen'}</Btn>
            {form.imageUrl && <Btn size="sm" variant="ghost" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))}>Quitar</Btn>}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Fila de categoría (con sus subcategorías) ─────────────────────────── */
function CategoryRow({ node, depth, onEdit, onAddChild, onDelete }: {
  node: CategoryNode; depth: number
  onEdit: (c: CategoryNode) => void
  onAddChild: (parentId: string) => void
  onDelete: (c: CategoryNode) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 border-t border-line py-2 pr-2 first:border-t-0 hover:bg-surface-2" style={{ paddingLeft: `${12 + depth * 28}px` }}>
        {depth > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink-muted" />}
        {node.imageUrl
          ? <img src={node.imageUrl} alt="" className="size-8 shrink-0 rounded-ctl object-cover" />
          : <div className="grid size-8 shrink-0 place-items-center rounded-ctl bg-ink/[0.05]"><FolderTree className="size-4 text-ink-muted" /></div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-table font-medium">{node.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 text-meta text-ink-muted">
            <span className="tabular-nums">{node._count.products} productos</span>
            {node.description && <span className="truncate">{node.description}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
          {node.requiresExpiry && <StatusBadge tone="warn">Vencimiento</StatusBadge>}
          {node.volatilePricing && <StatusBadge tone="neutral">Precio volátil</StatusBadge>}
          {!node.isActive && <StatusBadge tone="muted">Inactiva</StatusBadge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {depth === 0 && <Btn size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => onAddChild(node.id)}><Plus />Subcategoría</Btn>}
          <Btn size="sm" onClick={() => onEdit(node)}><Pencil />Editar</Btn>
          <RowMenu label={`Acciones de ${node.name}`} actions={[
            ...(depth === 0 ? [{ label: 'Agregar subcategoría', icon: Plus, onSelect: () => onAddChild(node.id) }] : []),
            { label: 'Eliminar', icon: Trash2, danger: true, separated: depth === 0, onSelect: () => onDelete(node) },
          ]} />
        </div>
      </div>
      {node.children.map(child => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </>
  )
}

/* ─── Página ─────────────────────────────────────────────────────────── */
export function CategoriesPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [showModal, setShowModal] = useState(false)
  const [editCategory, setEditCategory] = useState<CategoryNode | undefined>()
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>()

  const { data, isLoading } = useQuery({
    queryKey: ['categories-manage'],
    queryFn: async () => (await api.get<{ data: CategoryNode[] }>('/categories/manage')).data.data,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories-manage'] }); toast.success('Categoría eliminada.') },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const categories = data ?? []
  const topLevel = categories.filter(c => !c.parentId)

  const openCreate = (parentId?: string) => { setEditCategory(undefined); setDefaultParentId(parentId); setShowModal(true) }
  const openEdit = (c: CategoryNode) => { setEditCategory(c); setDefaultParentId(undefined); setShowModal(true) }
  const remove = async (c: CategoryNode) => {
    const r = await confirm({ title: `Eliminar la categoría "${c.name}"`, confirmLabel: 'Eliminar', tone: 'danger' })
    if (r.ok) deleteMutation.mutate(c.id)
  }

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Categorías" actions={<Btn variant="primary" onClick={() => openCreate()}><Plus />Nueva categoría</Btn>}>
        <p className="text-table text-ink-muted">Categorías y subcategorías de productos, usadas en Inventario, POS y la tienda online</p>
      </PageHeader>

      <div className={cn('overflow-hidden', surfaceCls)}>
        {isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : topLevel.length === 0 ? <EmptyState icon={FolderTree} title="No hay categorías creadas." />
          : topLevel.map(node => <CategoryRow key={node.id} node={node} depth={0} onEdit={openEdit} onAddChild={openCreate} onDelete={remove} />)}
      </div>

      {showModal && (
        <CategoryModal
          category={editCategory}
          parentOptions={topLevel}
          defaultParentId={defaultParentId}
          onClose={() => { setShowModal(false); setEditCategory(undefined); setDefaultParentId(undefined) }}
        />
      )}
    </div>
  )
}
