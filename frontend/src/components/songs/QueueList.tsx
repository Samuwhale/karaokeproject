import { useEffect, useState } from 'react'

import { RUN_STATUS_LABELS, isActiveRunStatus } from '../runStatus'
import type { QueueRunEntry } from '../../types'

type QueueListProps = {
  draftsCount: number
  queueRuns: QueueRunEntry[]
  onReviewImports: () => void
  onOpenRun: (entry: QueueRunEntry) => void
}

function formatElapsed(startedAt: string): string {
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return ''
  const totalSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function useTickingClock(enabled: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [enabled])
}

function trackLabel(entry: QueueRunEntry): string {
  return entry.track_artist ? `${entry.track_title} · ${entry.track_artist}` : entry.track_title
}

export function QueueList({ draftsCount, queueRuns, onReviewImports, onOpenRun }: QueueListProps) {
  const active = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status))
  const failed = queueRuns.filter(
    (entry) => entry.run.status === 'failed' || entry.run.status === 'cancelled',
  )

  useTickingClock(active.length > 0)

  if (draftsCount === 0 && active.length === 0 && failed.length === 0) return null

  return (
    <section className="library-queue">
      {draftsCount > 0 ? (
        <div className="queue-drafts">
          <div className="queue-drafts-copy">
            <strong>
              {draftsCount} import{draftsCount === 1 ? '' : 's'} waiting
            </strong>
            <span>Review titles and queueing before splitting.</span>
          </div>
          <button type="button" className="button-primary" onClick={onReviewImports}>
            Review
          </button>
        </div>
      ) : null}

      {active.length > 0 ? (
        <ul className="queue-list">
          {active.map((entry) => {
            const run = entry.run
            const stageLabel = RUN_STATUS_LABELS[run.status] ?? 'Processing'
            const elapsed = formatElapsed(run.created_at)
            const percent = Math.round(run.progress)
            const showBar = run.status !== 'queued'
            return (
              <li key={run.id}>
                <button
                  type="button"
                  className="queue-row is-active"
                  onClick={() => onOpenRun(entry)}
                >
                  <span className="queue-row-main">
                    <span className="queue-row-title">{trackLabel(entry)}</span>
                    <span className="queue-row-meta">
                      <span className="queue-row-stage">{stageLabel}</span>
                      {showBar ? <span className="queue-row-dot" aria-hidden>·</span> : null}
                      {showBar ? <span className="queue-row-pct">{percent}%</span> : null}
                      <span className="queue-row-spacer" />
                      <span className="queue-row-elapsed">{elapsed}</span>
                    </span>
                  </span>
                  <span
                    className="queue-row-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={showBar ? percent : undefined}
                    aria-label={`${stageLabel} ${showBar ? `${percent} percent` : ''}`}
                  >
                    <span
                      className={`queue-row-bar-fill ${showBar ? '' : 'is-indeterminate'}`}
                      style={showBar ? { width: `${percent}%` } : undefined}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {failed.length > 0 ? (
        <ul className="queue-list is-failed">
          {failed.map((entry) => {
            const run = entry.run
            const stageLabel = run.status === 'cancelled' ? 'Cancelled' : 'Failed'
            const reason = run.error_message?.trim() || run.status_message?.trim() || 'No detail recorded.'
            return (
              <li key={run.id}>
                <button
                  type="button"
                  className="queue-row is-failed"
                  onClick={() => onOpenRun(entry)}
                >
                  <span className="queue-row-main">
                    <span className="queue-row-title">{trackLabel(entry)}</span>
                    <span className="queue-row-meta">
                      <span className="queue-row-stage">{stageLabel}</span>
                      <span className="queue-row-dot" aria-hidden>·</span>
                      <span className="queue-row-reason">{reason}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
