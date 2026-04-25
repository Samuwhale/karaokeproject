import type { RunSummary } from '../types'

const ACTIVE_RUN_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])

export function isActiveRunStatus(status: string): boolean {
  return ACTIVE_RUN_STATUSES.has(status)
}

// Detailed labels used where the user benefits from knowing the exact pipeline
// stage (activity list / stepper). Kept fine-grained so a 90-second job still
// feels alive.
export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing audio',
  separating: 'Separating stems',
  exporting: 'Building exports',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// Short labels for compact surfaces (run chips, inline summaries). All active
// pipeline stages collapse into 'Processing' — the stepper below still shows
// which stage, so the chip doesn't need to repeat it.
export const RUN_STATUS_SHORT_LABELS: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Processing',
  separating: 'Processing',
  exporting: 'Processing',
  completed: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const RUN_STAGE_DESCRIPTIONS: Record<string, string> = {
  queued: 'waiting for a worker',
  preparing: 'decoding + normalising',
  separating: 'creating stems',
  exporting: 'writing stem exports',
}

export function describeRun(run: RunSummary): string {
  const message = run.status_message?.trim()
  if (message) return message
  return RUN_STAGE_DESCRIPTIONS[run.status] ?? ''
}
