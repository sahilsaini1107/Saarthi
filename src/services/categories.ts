// Category service. Every query is user-scoped (RLS-equivalent).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { DEFAULT_CATEGORIES } from '@/lib/constants'
import { CategoryDTO } from '@/lib/types'

function toDTO(c: { id: string; name: string; emoji: string; color: string; kind: string; isSystem: boolean }): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    kind: c.kind === 'income' ? 'income' : 'expense',
    isSystem: c.isSystem,
  }
}

/** Seeds the 12 system categories on first login (task 1.4). Idempotent. */
export async function seedDefaultCategories(userId: string): Promise<void> {
  const existing = await db.category.count({ where: { userId } })
  if (existing > 0) return
  await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      kind: c.kind,
      isSystem: true,
    })),
  })
}

export async function listCategories(userId: string): Promise<CategoryDTO[]> {
  const rows = await db.category.findMany({
    where: { userId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
  return rows.map(toDTO)
}

export async function createCategory(
  userId: string,
  input: { name: string; emoji?: string; color?: string; kind: 'expense' | 'income' },
): Promise<CategoryDTO> {
  const name = input.name.trim()
  if (!name) throw new HttpError('Category name is required', 422)
  const dupe = await db.category.findFirst({ where: { userId, name } })
  if (dupe) throw new HttpError(`"${name}" already exists`, 409)
  const row = await db.category.create({
    data: {
      userId,
      name,
      emoji: input.emoji || '🏷️',
      color: input.color || '#64748B',
      kind: input.kind,
      isSystem: false,
    },
  })
  return toDTO(row)
}

export async function updateCategory(
  userId: string,
  id: string,
  input: { name?: string; emoji?: string; color?: string },
): Promise<CategoryDTO> {
  const existing = await db.category.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Category not found', 404)
  const row = await db.category.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      emoji: input.emoji ?? existing.emoji,
      color: input.color ?? existing.color,
    },
  })
  return toDTO(row)
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const existing = await db.category.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Category not found', 404)
  if (existing.isSystem) throw new HttpError('System categories cannot be deleted', 403)
  // Transactions keep history: categoryId is set null on delete (schema-level).
  await db.category.delete({ where: { id } })
}
