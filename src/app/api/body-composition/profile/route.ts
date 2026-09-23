// The fixed facts a composition panel needs: height, birth year, sex, goal
// weight. Every field is optional and nullable — clearing one is meaningful.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { getBodyProfile, saveBodyProfile } from '@/services/body'

const schema = z.object({
  /** cm × 1000 — 178.0 cm = 178000 */
  heightMilliCm: z.number().int().min(50_000).max(260_000).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2200).nullable().optional(),
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  /** grams — 70 kg = 70000 */
  goalWeightG: z.number().int().min(20_000).max(400_000).nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => getBodyProfile(user.id, user.timezone))
}

export async function PATCH(req: Request) {
  return withUser(async (user) => saveBodyProfile(user.id, await parseBody(req, schema), user.timezone))
}
