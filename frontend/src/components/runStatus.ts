import type { RunSummary } from '../types'

export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing audio',
  separating: 'Separating stems',
  exporting: 'Building exports',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const RUN_STAGE_DESCRIPTIONS: Record<string, string> = {
  queued: 'waiting for a worker',
  preparing: 'decoding + normalising',
  separating: 'running the stem model',
  exporting: 'rendering instrumental + bundle',
}

export function describeRun(run: RunSummary): string {
  const message = run.status_message?.trim()
  if (message) return message
  return RUN_STAGE_DESCRIPTIONS[run.status] ?? ''
}
