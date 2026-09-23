import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createAsset, listAssets } from '@/services/assets'
import { JOB_KEYS } from '@/lib/planner'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(['real_estate', 'vehicle', 'machinery', 'gold_jewellery', 'electronics', 'furniture', 'art', 'other']),
  currentValuePaise: z.number().int().positive(),
  purchaseValuePaise: z.number().int().positive().nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  job: z.enum(JOB_KEYS).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listAssets(user.id))
}

export async function POST(req: Request) {
  return withUser(async (user) => createAsset(user.id, await parseBody(req, createSchema)))
}
