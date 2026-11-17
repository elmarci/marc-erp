// Opciones de despacho que elige el cliente en la tienda online: "Presa:
// Pierna / Pecho", "Temperatura: Helada / Sin helar", etc. No cambian el
// precio: solo le dicen al personal cómo preparar el pedido.
//
// Se guardan como JSON en la configuración `store_product_options` (tabla
// settings) y se administran desde el ERP (pantalla "Opciones en la tienda").
// Un grupo aplica a una categoría entera (y sus subcategorías) y/o a
// productos sueltos.

import { z } from 'zod';
import { prisma } from '../../database/client';
import { BusinessError } from '../../utils/errors';

export const OPTIONS_SETTING = 'store_product_options';

export const optionGroupSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(40),
  choices: z.array(z.string().trim().min(1).max(40)).min(2).max(12),
  required: z.boolean(),
  categoryIds: z.array(z.string().uuid()).max(100).default([]),
  productIds: z.array(z.string().uuid()).max(500).default([]),
});
export type OptionGroup = z.infer<typeof optionGroupSchema>;

// Lo que ve la tienda de cada grupo (sin a qué productos aplica).
export type PublicOptionGroup = Pick<OptionGroup, 'id' | 'name' | 'choices' | 'required'>;

export async function loadOptionGroups(): Promise<OptionGroup[]> {
  const row = await prisma.setting.findUnique({ where: { key: OPTIONS_SETTING } });
  if (!row?.value) return [];
  try {
    const parsed = z.array(optionGroupSchema).safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveOptionGroups(groups: OptionGroup[]): Promise<void> {
  const value = JSON.stringify(groups);
  await prisma.setting.upsert({
    where: { key: OPTIONS_SETTING },
    update: { value },
    create: { key: OPTIONS_SETTING, value, type: 'json', group: 'store', label: 'Opciones de productos en la tienda' },
  });
}

type ProductRef = { id: string; categoryId?: string | null; category?: { id?: string; parentId?: string | null; parent?: { id: string } | null } | null };

export function groupsForProduct(groups: OptionGroup[], p: ProductRef): PublicOptionGroup[] {
  const cats = new Set<string>();
  const catId = p.categoryId ?? p.category?.id;
  if (catId) cats.add(catId);
  const parentId = p.category?.parentId ?? p.category?.parent?.id;
  if (parentId) cats.add(parentId);
  return groups
    .filter(g => g.productIds.includes(p.id) || g.categoryIds.some(c => cats.has(c)))
    .map(({ id, name, choices, required }) => ({ id, name, choices, required }));
}

// Valida lo que eligió el cliente ({ idDelGrupo: "Pierna" }) contra los
// grupos que aplican al producto y lo devuelve como texto para despacho.
// Un grupo obligatorio sin elegir corta el pedido con un mensaje claro.
export function optionsText(
  applicable: PublicOptionGroup[],
  selected: Record<string, string> | undefined,
  productName: string,
): string | null {
  const parts: string[] = [];
  for (const g of applicable) {
    const choice = selected?.[g.id];
    if (choice && g.choices.includes(choice)) {
      parts.push(`${g.name}: ${choice}`);
    } else if (g.required) {
      throw new BusinessError(`Elige "${g.name}" para "${productName}".`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}
