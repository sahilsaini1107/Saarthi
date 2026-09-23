// Whole-panel entry: every reading from one weigh-in in a single call.
// A null value removes that kind's reading for the day (how a typo is undone).

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { saveMetricsBulk } from '@/services/body'
import { BODY_METRIC_ABSOLUTE_MAX } from '@/lib/constants'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // the per-kind ceiling is enforced in the service (kg, % and kcal differ)
  values: z.record(z.string().max(30), z.number().int().min(1).max(BODY_METRIC_ABSOLUTE_MAX).nullable()),
})

export async function POST(req: Request) {
  return withUser(async (user) => saveMetricsBulk(user.id, await parseBody(req, schema), user.timezone))
}
