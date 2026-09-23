// Daily coach check-in (Phase 23). GET ?date= (default today); POST upserts
// one day, writing only the fields present in the payload.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { deleteCheckIn, getCheckIn, saveCheckIn } from '@/services/checkin'

const scale = z.number().int().min(1).max(5).nullable().optional()

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  energy: scale,
  soreness: scale,
  stress: scale,
  sleepQuality: scale,
  sleepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  steps: z.number().int().min(0).max(200_000).nullable().optional(),
  waterMl: z.number().int().min(0).max(20_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date') ?? undefined
  return withUser(async (user) => getCheckIn(user.id, user.timezone, date))
}

export async function POST(req: Request) {
  return withUser(async (user) => saveCheckIn(user.id, await parseBody(req, schema), user.timezone))
}

export async function DELETE(req: Request) {
  const date = new URL(req.url).searchParams.get('date')
  return withUser(async (user) => deleteCheckIn(user.id, date ?? '', user.timezone))
}
