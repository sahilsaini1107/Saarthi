import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteTask, updateTask } from '@/services/goals'

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  milestoneId: z.string().min(1).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  done: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => updateTask(user.id, id, await parseBody(req, updateSchema), user.timezone))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => deleteTask(user.id, id, user.timezone))
}
