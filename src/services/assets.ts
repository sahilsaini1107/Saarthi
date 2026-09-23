// Real-world assets (Phase 1.5): real estate, vehicles, machinery, gold,
// electronics, etc. Values are user-maintained — Saarthi never guesses what
// your flat is worth. BigInt rows for asset-scale money (Decision #10).

import { db } from '@/lib/db'
import { HttpError } from '@/lib/api-helpers'
import { isoDayUTC, toUTC } from '@/lib/date'
import { AssetDTO, JobKey } from '@/lib/types'
import { parseJob } from '@/services/planner'
// Categories live in lib/constants (server-safe) — re-exported for the API surface.
import { ASSET_CATEGORIES as CATEGORIES, type AssetCategoryKey } from '@/lib/constants'

export const ASSET_CATEGORIES = CATEGORIES
export type AssetCategory = AssetCategoryKey

export interface AssetWithMeta extends AssetDTO {
  gainPaise: number | null
  gainPct: number | null
}

function toDTO(a: {
  id: string
  name: string
  category: string
  currentValuePaise: bigint
  purchaseValuePaise: bigint | null
  purchaseDate: Date | null
  job: string | null
  location: string | null
  notes: string | null
  createdAt: Date
}): AssetDTO {
  return {
    id: a.id,
    name: a.name,
    category: a.category as AssetCategory,
    currentValuePaise: Number(a.currentValuePaise),
    purchaseValuePaise: a.purchaseValuePaise === null ? null : Number(a.purchaseValuePaise),
    purchaseDate: a.purchaseDate ? isoDayUTC(a.purchaseDate) : null,
    job: (a.job as JobKey | null) ?? null,
    location: a.location,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  }
}

export async function createAsset(
  userId: string,
  input: {
    name: string
    category: AssetCategory
    currentValuePaise: number
    purchaseValuePaise?: number | null
    purchaseDate?: string | null
    job?: JobKey | null
    location?: string | null
    notes?: string | null
  },
): Promise<AssetDTO> {
  const name = input.name.trim()
  if (!name) throw new HttpError('Name is required', 422)
  if (!ASSET_CATEGORIES.includes(input.category)) throw new HttpError('Unknown asset category', 422)
  if (!Number.isInteger(input.currentValuePaise) || input.currentValuePaise <= 0) throw new HttpError('Current value must be positive', 422)
  if (input.purchaseValuePaise != null && (!Number.isInteger(input.purchaseValuePaise) || input.purchaseValuePaise <= 0)) {
    throw new HttpError('Purchase value must be positive', 422)
  }
  if (input.purchaseDate !== undefined && input.purchaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.purchaseDate)) {
    throw new HttpError('Purchase date must be YYYY-MM-DD', 422)
  }

  const row = await db.asset.create({
    data: {
      userId,
      name,
      category: input.category,
      currentValuePaise: BigInt(input.currentValuePaise),
      purchaseValuePaise: input.purchaseValuePaise != null ? BigInt(input.purchaseValuePaise) : null,
      purchaseDate: input.purchaseDate ? toUTC(input.purchaseDate) : null,
      job: parseJob(input.job),
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  })
  return toDTO(row)
}

export async function listAssets(userId: string): Promise<AssetWithMeta[]> {
  const rows = await db.asset.findMany({ where: { userId }, orderBy: { currentValuePaise: 'desc' } })
  return rows.map((row) => {
    const dto = toDTO(row)
    const gain = dto.purchaseValuePaise === null ? null : dto.currentValuePaise - dto.purchaseValuePaise
    return {
      ...dto,
      gainPaise: gain,
      gainPct: gain === null || !dto.purchaseValuePaise ? null : Math.round((gain / dto.purchaseValuePaise) * 100),
    }
  })
}

export async function updateAsset(
  userId: string,
  id: string,
  input: Partial<{
    name: string
    category: AssetCategory
    currentValuePaise: number
    purchaseValuePaise: number | null
    purchaseDate: string | null
    job: JobKey | null
    location: string | null
    notes: string | null
  }>,
): Promise<AssetDTO> {
  const existing = await db.asset.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Asset not found', 404)
  if (input.category !== undefined && !ASSET_CATEGORIES.includes(input.category)) throw new HttpError('Unknown asset category', 422)
  if (
    input.currentValuePaise !== undefined &&
    (!Number.isInteger(input.currentValuePaise) || input.currentValuePaise <= 0)
  ) {
    throw new HttpError('Current value must be positive', 422)
  }

  const row = await db.asset.update({
    where: { id },
    data: {
      name: input.name?.trim() || existing.name,
      category: input.category ?? existing.category,
      currentValuePaise: input.currentValuePaise !== undefined ? BigInt(input.currentValuePaise) : existing.currentValuePaise,
      purchaseValuePaise:
        input.purchaseValuePaise === undefined
          ? existing.purchaseValuePaise
          : input.purchaseValuePaise === null
            ? null
            : BigInt(input.purchaseValuePaise),
      purchaseDate:
        input.purchaseDate === undefined
          ? existing.purchaseDate
          : input.purchaseDate === null
            ? null
            : toUTC(input.purchaseDate),
      job: input.job === undefined ? existing.job : parseJob(input.job),
      location: input.location === undefined ? existing.location : input.location?.trim() || null,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
    },
  })
  return toDTO(row)
}

export async function deleteAsset(userId: string, id: string): Promise<void> {
  const existing = await db.asset.findFirst({ where: { id, userId } })
  if (!existing) throw new HttpError('Asset not found', 404)
  await db.asset.delete({ where: { id } })
}
