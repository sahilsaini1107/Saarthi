import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deletePlanExercise, updatePlanExercise } from '@/services/fitness'

const patchSchema = z.object({
  sets: z.number().int().min(1).max(20).optional(),
  repMin: z.number().int().min(1).max(200).nullable().optional(),
  repMax: z.number().int().min(1).max(200).nullable().optional(),
  secondsMin: z.number().int().min(1).max(3600).nullable().optional(),
  secondsMax: z.number().int().min(1).max(3600).nullable().optional(),
  restSeconds: z.number().int().min(0).max(1200).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  order: z.number().int().min(0).max(14).optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await updatePlanExercise(user.id, id, await parseBody(req, patchSchema))
    return { ok: true }
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withUser(async (user) => {
    await deletePlanExercise(user.id, id)
    return { ok: true }
  })
}
