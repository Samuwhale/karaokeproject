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

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled'])

/**
 * Return the best short progress line for a run.
 *
 * Prefers a specific status_message coming from the worker ("Encoding MP3 at
 * 320k", etc.) over the generic stage description. Falls back to the stage
 * description when no message has been set yet.
 */
export function describeRun(run: RunSummary): string {
  const message = run.status_message?.trim()
  if (message) return message
  return RUN_STAGE_DESCRIPTIONS[run.status] ?? ''
}

export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status)
}
