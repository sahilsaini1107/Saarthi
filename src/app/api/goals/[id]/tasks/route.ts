import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addTask } from '@/services/goals'

const taskSchema = z.object({
  title: z.string().min(1).max(160),
  milestoneId: z.string().min(1).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => addTask(user.id, id, await parseBody(req, taskSchema), user.timezone))
}
