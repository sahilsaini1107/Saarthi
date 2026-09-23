import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createIdea, listIdeas } from '@/services/ideas'

export const ideaSchema = z.object({
  title: z.string().min(1).max(120),
  // business | startup | product | content | personal | other
  category: z.string().max(20).optional(),
  // spark | exploring | planned | launched | parked | dropped
  status: z.string().max(20).optional(),
  nextStep: z.string().max(200).nullable().optional(),
  impact: z.number().int().min(1).max(10).optional(),
  confidence: z.number().int().min(1).max(10).optional(),
  effort: z.number().int().min(1).max(10).optional(),
  tags: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  problem: z.string().max(1000).nullable().optional(),
  audience: z.string().max(500).nullable().optional(),
  value: z.string().max(500).nullable().optional(),
  solution: z.string().max(1000).nullable().optional(),
  revenue: z.string().max(500).nullable().optional(),
  costs: z.string().max(500).nullable().optional(),
  metrics: z.string().max(500).nullable().optional(),
  advantage: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withUser(async (user) => listIdeas(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createIdea(user.id, await parseBody(req, ideaSchema), user.timezone))
}
