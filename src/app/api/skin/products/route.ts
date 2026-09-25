import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { addProduct } from '@/services/skin'

const productSchema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().max(80).nullable().optional(),
  kind: z.enum(['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen', 'eye_cream', 'exfoliant', 'mask', 'other']),
  openedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  paoMonths: z.number().int().min(1).max(120).nullable().optional(),
  status: z.enum(['active', 'finished', 'discarded']).optional(),
  routineAm: z.boolean().optional(),
  routinePm: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function POST(req: Request) {
  return withUser(async (user) => addProduct(user.id, await parseBody(req, productSchema), user.timezone))
}
