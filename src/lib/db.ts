import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: (PrismaClient & { __saarthiModelSig?: string }) | undefined
}

/**
 * Dev hot-reload guard: after `prisma db push` regenerates the client, the
 * cached singleton still references the OLD client and is missing any newly
 * added models (e.g. `db.principle`). Detect that by comparing the current
 * client's datamodel signature with the one the cached instance was built
 * from, and re-instantiate when they differ. In production this is a no-op
 * (the process starts with a fresh client).
 */
function modelSig(): string {
  return Prisma.dmmf.datamodel.models
    .map((m) => m.name)
    .sort()
    .join(',')
}

function buildClient(): PrismaClient & { __saarthiModelSig?: string } {
  const client = new PrismaClient({
    // `query` logging prints EVERY statement. That is useful locally and pure
    // noise (and cost) in a serverless log, so it is dev-only.
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'],
    // Generous headroom for interactive transactions. A local SQLite file is
    // sub-millisecond and never needs it, but this costs nothing and keeps
    // the app working unchanged if it is ever pointed at a remote Postgres,
    // where a cold connection once blew Prisma's 5 s default at 5409 ms.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  }) as PrismaClient & { __saarthiModelSig?: string }
  client.__saarthiModelSig = modelSig()
  return client
}

const cached = globalForPrisma.prisma
export const db = cached && cached.__saarthiModelSig === modelSig() ? cached : buildClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// hmr-nudge p15a
