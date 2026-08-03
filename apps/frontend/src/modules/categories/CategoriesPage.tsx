import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X, Pencil, Trash2, FolderTree, ImagePlus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { api, getErrorMessage } from '@/services/api'

interface CategoryNode {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">{isEdit ? 'Editar categoría' : 'Nueva categoría'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="mb-1 block text-sm font-medium">Nombre *</label>
            <Input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="Ej: Licores" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Categoría padre</label>
            <select value={form.parentId} onChange={e => setForm(v => ({ ...v, parentId: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Ninguna (categoría principal)</option>
              {parentOptions.filter(p => p.id !== category?.id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <Input value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="Opcional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Orden</label>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(v => ({ ...v, sortOrder: e.target.value }))} />
            </div>
            <div className="flex items-end pb-2 gap-2">
              <input type="checkbox" id="cat-active" checked={form.isActive}
                onChange={e => setForm(v => ({ ...v, isActive: e.target.checked }))} className="h-4 w-4 rounded border-input" />
              <label htmlFor="cat-active" className="text-sm font-medium">Activa</label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Imagen</label>
            <div className="flex items-center gap-3">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover border" />
              ) : (
                <div className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) imageUploadMutation.mutate(f) }} />
              <Button type="button" variant="outline" size="sm" loading={imageUploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}>
                {form.imageUrl ? 'Cambiar' : 'Subir imagen'}
              </Button>
              {form.imageUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm(v => ({ ...v, imageUrl: '' }))}>Quitar</Button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name}>
            {isEdit ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Category Row ───────────────────────────────────────────────────── */
function CategoryRow({ node, depth, onEdit, onAddChild, onDelete }: {
  node: CategoryNode; depth: number
  onEdit: (c: CategoryNode) => void
  onAddChild: (parentId: string) => void
  onDelete: (c: CategoryNode) => void
}) {
  return (
    <>
      <div className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 ${depth > 0 ? 'border-t' : 'border-t'}`}
        style={{ paddingLeft: `${16 + depth * 28}px` }}>
        {depth > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        {node.imageUrl ? (
          <img src={node.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover border shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded-lg border bg-muted flex items-center justify-center shrink-0">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{node.name}</p>
          {node.description && <p className="text-xs text-muted-foreground truncate">{node.description}</p>}
        </div>
        <Badge variant="secondary" className="shrink-0">{node._count.products} productos</Badge>
        {!node.isActive && <Badge variant="secondary" className="shrink-0">Inactiva</Badge>}
        <div className="flex gap-1 shrink-0">
          {depth === 0 && (
            <Button variant="ghost" size="sm" onClick={() => onAddChild(node.id)}>+ Sub</Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(node)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => onDelete(node)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {node.children.map(child => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export function CategoriesPage() {
  const queryClient = useQueryClient()
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorías</h1>
          <p className="text-sm text-muted-foreground">Organiza categorías y subcategorías de productos (usadas en Inventario, POS y la tienda online)</p>
        </div>
        <Button onClick={() => openCreate()}><Plus className="mr-2 h-4 w-4" />Nueva categoría</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : topLevel.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <FolderTree className="h-12 w-12 opacity-20" />
              <p>No hay categorías creadas.</p>
            </div>
          ) : (
            <div>
              {topLevel.map(node => (
                <CategoryRow key={node.id} node={node} depth={0} onEdit={openEdit} onAddChild={openCreate}
                  onDelete={(c) => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteMutation.mutate(c.id) }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
