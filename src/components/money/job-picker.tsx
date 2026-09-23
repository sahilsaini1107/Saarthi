'use client'

// Shared portfolio-job picker (Phase 8): "Auto" follows the framework's
// suggested job for the entity kind; a stored tag always wins.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { JOB_META, JOBS } from '@/lib/planner'
import type { JobKey } from '@/lib/types'

const AUTO = '__auto__'

export function JobPicker({
  value,
  suggested,
  onChange,
}: {
  value: JobKey | null
  /** entity-kind suggestion shown in the Auto option */
  suggested: JobKey | null
  onChange: (job: JobKey | null) => void
}) {
  const current = value ?? AUTO
  return (
    <Select value={current} onValueChange={(v) => onChange(v === AUTO ? null : (v as JobKey))}>
      <SelectTrigger className="h-11 w-full rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>
          {suggested ? `Auto · ${JOB_META[suggested].emoji} ${JOB_META[suggested].label}` : 'Not tagged'}
        </SelectItem>
        {JOBS.map((j) => (
          <SelectItem key={j} value={j}>
            {JOB_META[j].emoji} {JOB_META[j].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
