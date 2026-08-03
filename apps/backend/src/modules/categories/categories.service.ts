import { prisma } from '../../database/client';
import { redis } from '../../config/redis';
import { NotFoundError, BusinessError } from '../../utils/errors';

const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
};

function slugify(name: string): string {
  const stripped = name.toLowerCase().split('').map(ch => ACCENTS[ch] ?? ch).join('');
  return stripped.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'categoria';
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.category.findFirst({ where: { slug, id: excludeId ? { not: excludeId } : undefined } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export class CategoriesService {
  async getManageTree() {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true, children: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string, typeof categories>();
    for (const c of categories) {
      const key = c.parentId ?? '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    }
    const build = (parentKey: string): unknown[] =>
      (byParent.get(parentKey) ?? []).map(c => ({ ...c, children: build(c.id) }));
    return build('');
  }

  async create(data: { name: string; description?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean; imageUrl?: string | null }) {
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundError('Categoría padre');
      if (parent.parentId) throw new BusinessError('No se pueden crear subcategorías de más de 2 niveles.');
    }
    const slug = await uniqueSlug(data.name);
    const category = await prisma.category.create({
      data: {
        name: data.name, slug,
        description: data.description || null,
        parentId: data.parentId || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        imageUrl: data.imageUrl || null,
      },
    });
    await redis.del('categories:all');
    return category;
  }

  async update(id: string, data: { name?: string; description?: string; parentId?: string | null; sortOrder?: number; isActive?: boolean; imageUrl?: string | null }) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Categoría');

    if (data.parentId !== undefined && data.parentId) {
      if (data.parentId === id) throw new BusinessError('Una categoría no puede ser su propia categoría padre.');
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundError('Categoría padre');
      if (parent.parentId) throw new BusinessError('No se pueden crear subcategorías de más de 2 niveles.');
    }

    const slug = data.name && data.name !== existing.name ? await uniqueSlug(data.name, id) : undefined;

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(slug ? { slug } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      },
    });
    await redis.del('categories:all');
    return category;
  }

  async remove(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundError('Categoría');
    if (category._count.products > 0) {
      throw new BusinessError(`No se puede eliminar: tiene ${category._count.products} producto(s) asignado(s). Reasígnalos primero.`);
    }
    if (category._count.children > 0) {
      throw new BusinessError(`No se puede eliminar: tiene ${category._count.children} subcategoría(s). Elimínalas o muévelas primero.`);
    }
    await prisma.category.delete({ where: { id } });
    await redis.del('categories:all');
  }
}

export const categoriesService = new CategoriesService();
