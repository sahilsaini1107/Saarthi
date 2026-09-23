import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { allMetricSeries, metricSeries, saveMetric } from '@/services/body'
import { BODY_METRIC_ABSOLUTE_MAX, BODY_METRIC_KINDS } from '@/lib/constants'

const metricSchema = z.object({
  // the full panel lives in one place — adding a readout is a constants edit
  kind: z.enum(BODY_METRIC_KINDS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // per-kind ceiling enforced in the service (saveMetric)
  valueMilli: z.number().int().min(1).max(BODY_METRIC_ABSOLUTE_MAX),
  note: z.string().max(500).nullable().optional(),
})

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get('kind')
  return withUser(async (user) =>
    kind ? metricSeries(user.id, kind, user.timezone) : allMetricSeries(user.id, user.timezone),
  )
}

export async function POST(req: Request) {
  return withUser(async (user) => saveMetric(user.id, await parseBody(req, metricSchema), user.timezone))
}
