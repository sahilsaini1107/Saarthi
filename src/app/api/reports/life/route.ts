// Monthly Life Report API (Phase F / task 20). GET /api/reports/life?month=YYYY-MM
// Assembles the cross-pillar month report: Life Score snapshot + per-pillar
// sections built from the same per-domain aggregation as the hub. Future
// months are rejected (there is nothing to report on yet).

import { z } from 'zod'
import { HttpError, withUser } from '@/lib/api-helpers'
import { currentMonthKey } from '@/lib/date'
import { isValidMonthKey } from '@/lib/reports'
import { lifeReport } from '@/services/reports'

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return withUser(async (user) => {
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      throw new HttpError(msg || 'Invalid query', 422)
    }

    const monthKey = parsed.data.month ?? currentMonthKey(user.timezone)
    if (!isValidMonthKey(monthKey)) throw new HttpError('month must be a valid YYYY-MM', 422)
    if (monthKey > currentMonthKey(user.timezone)) throw new HttpError('That month has not happened yet', 422)

    return lifeReport(user.id, user.timezone, monthKey)
  })
}
