import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteCourse, updateCourse } from '@/services/study'

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  provider: z.string().max(80).nullable().optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'completed', 'paused', 'dropped']).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateCourse(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deleteCourse(user.id, id)
    return { ok: true }
  })
}
