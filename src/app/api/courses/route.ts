import { z } from 'zod'
import { parseBody, withUser } from '@/lib/api-helpers'
import { createCourse, listCourses } from '@/services/study'

export const courseSchema = z.object({
  title: z.string().min(1).max(120),
  provider: z.string().max(80).nullable().optional(),
  emoji: z.string().min(1).max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'completed', 'paused', 'dropped']).optional(),
  topics: z.array(z.string().min(1).max(160)).max(200).optional(),
})

export async function GET() {
  return withUser(async (user) => listCourses(user.id, user.timezone))
}

export async function POST(req: Request) {
  return withUser(async (user) => createCourse(user.id, await parseBody(req, courseSchema), user.timezone))
}
