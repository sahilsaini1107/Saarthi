import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { getPlannerOverview, replaceTargets, type TargetInput } from '@/services/planner'
import { JOB_KEYS } from '@/lib/planner'

export async function GET() {
  return withUser((user) => getPlannerOverview(user.id, user.timezone))
}

const targetsSchema = z.object({
  targets: z
    .array(
      z.object({
        job: z.enum(JOB_KEYS),
        targetPct: z.number().min(0).max(100),
      }),
    )
    .max(JOB_KEYS.length),
})

export async function PUT(req: Request) {
  return withUser(async (user) => {
    const { targets } = await parseBody(req, targetsSchema)
    await replaceTargets(user.id, targets as TargetInput[])
    return getPlannerOverview(user.id, user.timezone)
  })
}
