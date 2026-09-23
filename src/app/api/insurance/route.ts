import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createPolicy, listPolicies } from '@/services/insurance'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['term', 'health', 'life', 'vehicle', 'asset', 'other']),
  insurer: z.string().min(1).max(120),
  policyNumber: z.string().max(80).nullable().optional(),
  sumAssuredPaise: z.number().int().positive(),
  premiumPaise: z.number().int().positive(),
  premiumFrequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'annual']),
  nextPremiumDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullable().optional(),
  nominee: z.string().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET() {
  return withUser((user) => listPolicies(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createPolicy(user.id, await parseBody(req, createSchema)))
}
