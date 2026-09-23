// One-off cleanup: remove Phase 18 throwaway test users (cascade removes their
// content items, ideas, sessions). Run: bun scripts/cleanup-phase18.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const users = await db.user.findMany({
    where: { email: { startsWith: 'phase18-' } },
    select: { id: true, email: true },
  })
  for (const u of users) {
    const [c, i] = await Promise.all([db.contentItem.count({ where: { userId: u.id } }), db.idea.count({ where: { userId: u.id } })])
    console.log(`deleting ${u.email} (${c} content, ${i} ideas)`)
    await db.user.delete({ where: { id: u.id } })
  }
  console.log(`removed ${users.length} test users`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
