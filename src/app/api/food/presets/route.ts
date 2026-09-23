// One-tap starter foods — adds a preset group, skipping names already present.

import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { seedPresetGroup } from '@/services/food'

const schema = z.object({ groupId: z.string().min(1).max(40) })

export async function POST(req: Request) {
  return withUser(async (user) => seedPresetGroup(user.id, (await parseBody(req, schema)).groupId))
}
