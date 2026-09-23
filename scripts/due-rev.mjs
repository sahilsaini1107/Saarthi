// Test seed: make one topic's revision due today (for Today-widget verification)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const r = await db.courseTopic.updateMany({ where: { title: 'Scaling intro' }, data: { nextRevisionAt: new Date('2026-09-06T00:00:00.000Z') } })
console.log('updated:', r.count)
await db.$disconnect()
