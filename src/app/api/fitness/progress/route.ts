import { withUser } from '@/lib/api-helpers'
import { trainedExercises } from '@/services/fitness'

export async function GET() {
  return withUser(async (user) => trainedExercises(user.id))
}
