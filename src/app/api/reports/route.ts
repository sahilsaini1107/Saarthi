// Reports hub API (Phase F / task 20). GET /api/reports?domain=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Read-only aggregation over the user's own rows; the window is validated
// (real dates, from ≤ to, ≤ 366 days) and defaults to the current month.

import { z } from 'zod'
import { HttpError, withUser } from '@/lib/api-helpers'
import { currentMonthKey } from '@/lib/date'
import { daysInclusive, isReportDomain, isValidISODate, monthWindow } from '@/lib/reports'
import { domainReport } from '@/services/reports'

const querySchema = z.object({
  domain: z.string().regex(/^[a-z]+$/),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return withUser(async (user) => {
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
      throw new HttpError(msg || 'Invalid query', 422)
    }

    const { domain, from, to } = parsed.data
    const month = monthWindow(currentMonthKey(user.timezone))

    const fromIso = from ?? month.from
    const toIso = to ?? month.to

    // hand-rolled date checks give precise 422s (zod regex alone would pass 2026-02-30)
    if (!isValidISODate(fromIso) || !isValidISODate(toIso)) throw new HttpError('from/to must be real calendar dates (YYYY-MM-DD)', 422)
    if (toIso < fromIso) throw new HttpError('to must not be before from', 422)
    const span = daysInclusive(fromIso, toIso)
    if (span > 366) throw new HttpError('Reports cover at most 366 days — narrow the window', 422)

    if (!isReportDomain(domain)) throw new HttpError(`Unknown report domain: ${domain}`, 422)

    return domainReport(user.id, user.timezone, domain, fromIso, toIso)
  })
}
