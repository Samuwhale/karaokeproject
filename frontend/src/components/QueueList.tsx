import { RUN_STATUS_LABELS, describeRun, isActiveRunStatus } from './runStatus'
import type { QueueRunEntry } from '../types'
import { ProgressBar } from './feedback/ProgressBar'
import { Spinner } from './feedback/Spinner'

const REMEDIATION: { pattern: RegExp; hint: string }[] = [
  { pattern: /yt-dlp/i, hint: 'Install yt-dlp, then retry this split.' },
  { pattern: /ffmpeg|ffprobe/i, hint: 'Install ffmpeg before retrying.' },
  { pattern: /audio-separator/i, hint: 'Install the processing extras in the worker venv, then retry.' },
  { pattern: /disk/i, hint: 'Free space in outputs or temp storage before retrying.' },
]

type QueueListProps = {
  entries: QueueRunEntry[]
  selectedIds: Set<string>
  onToggleSelect: (runId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onSelectRun: (trackId: string, runId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
  retryingRunId: string | null
  embedded?: boolean
  showHeader?: boolean
}

function formatElapsed(since: string) {
  const started = new Date(since).getTime()
  const diffSec = Math.max(0, Math.round((Date.now() - started) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const m = Math.floor(diffSec / 60)
  const s = diffSec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function remediationFor(message: string | null) {
  if (!message) return null
  return REMEDIATION.find((entry) => entry.pattern.test(message))?.hint ?? null
}

export function QueueList({
  entries,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSelectRun,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  cancellingRunId,
  retryingRunId,
  embedded = false,
  showHeader = true,
}: QueueListProps) {
  const activeEntries = entries.filter((entry) => isActiveRunStatus(entry.run.status))
  const attentionEntries = entries.filter((entry) => !isActiveRunStatus(entry.run.status))
  const selectableIds = entries.map((entry) => entry.run.id)
  const activeCount = activeEntries.length
  const attentionCount = attentionEntries.length
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(selectableIds)
  }

  function renderRows(items: QueueRunEntry[], group: 'active' | 'followup') {
    return items.map((entry) => {
      const { run } = entry
      const failed = run.status === 'failed' || run.status === 'cancelled'
      const selected = selectedIds.has(run.id)
      const cancelling = cancellingRunId === run.id
      const retrying = retryingRunId === run.id
      const description = describeRun(run)
      const remediation = remediationFor(run.error_message)
      const timingLabel = isActiveRunStatus(run.status)
        ? run.status === 'queued'
          ? `Queued for ${formatElapsed(run.created_at)}`
          : `Processing for ${formatElapsed(run.created_at)}`
        : `Finished ${formatElapsed(run.updated_at)} ago`

      const rowClassName = [
        'queue-row',
        selected ? 'queue-row-selected' : '',
        failed ? 'queue-row-failed' : '',
      ]
        .filter(Boolean)
        .join(' ')

      return (
        <article key={run.id} className={rowClassName}>
          <label className="list-row-check">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(run.id)}
            />
          </label>
          <button
            type="button"
            className="queue-row-main"
            onClick={() => onSelectRun(entry.track_id, run.id)}
          >
            <div className="queue-row-title">
              <strong>{entry.track_title}</strong>
              {entry.track_artist ? <span> · {entry.track_artist}</span> : null}
            </div>
            <div className="queue-row-meta">
              {RUN_STATUS_LABELS[run.status] ?? run.status} · {run.processing.profile_label} · {timingLabel}
            </div>
            {group === 'active' ? (
              <ProgressBar value={run.progress} label={description || RUN_STATUS_LABELS[run.status]} />
            ) : null}
            {description ? <div className="queue-row-message">{description}</div> : null}
            {group === 'followup' && run.error_message ? (
              <div className="queue-row-error">
                <div>{run.error_message}</div>
                {remediation ? <div className="queue-row-hint">{remediation}</div> : null}
              </div>
            ) : null}
          </button>
          <div className="queue-row-actions">
            {group === 'followup' ? (
              <>
                <button
                  type="button"
                  className="button-primary"
                  disabled={retrying}
                  onClick={() => void onRetryRun(run.id)}
                >
                  {retrying ? (
                    <>
                      <Spinner /> Retrying
                    </>
                  ) : (
                    'Retry split'
                  )}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void onDismissRun(run.id)}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button-secondary"
                disabled={cancelling}
                onClick={() => void onCancelRun(run.id)}
              >
                {cancelling ? 'Cancelling…' : 'Cancel split'}
              </button>
            )}
          </div>
        </article>
      )
    })
  }

  if (entries.length === 0) {
    return (
      <div className={embedded ? 'queue-list-panel' : 'track-list-wrap'}>
        {showHeader ? (
          <div className="section-head">
            <div className="section-head-copy">
              <h2>Queue</h2>
              <p>Watch active splits and jump straight back into the exact result that needs attention.</p>
            </div>
          </div>
        ) : null}
        <p className="empty-state">
          Nothing is running right now. Queue a split from imported songs or from a song in the library to see progress here.
        </p>
      </div>
    )
  }

  return (
    <div className={embedded ? 'queue-list-panel' : 'track-list-wrap'}>
      {showHeader ? (
        <div className="section-head">
          <div className="section-head-copy">
            <h2>Queue</h2>
            <p>Keep active splits visible and clear anything that needs follow-up.</p>
          </div>
        </div>
      ) : null}

      <div className="list-controls">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={selectableIds.length === 0}
            onChange={handleToggleAll}
          />
          <span>{allSelected ? 'Clear all' : 'Select all'}</span>
        </label>
        <span className="library-count">
          {activeCount} running
          {attentionCount > 0 ? ` · ${attentionCount} need follow-up` : ''}
        </span>
      </div>

      {activeEntries.length > 0 ? (
        <section className="queue-group">
          <div className="queue-group-head">
            <strong>Splitting now</strong>
            <span>{activeCount}</span>
          </div>
          <div className="queue-list">{renderRows(activeEntries, 'active')}</div>
        </section>
      ) : null}

      {attentionEntries.length > 0 ? (
        <section className="queue-group">
          <div className="queue-group-head">
            <strong>Needs follow-up</strong>
            <span>{attentionCount}</span>
          </div>
          <div className="queue-list">{renderRows(attentionEntries, 'followup')}</div>
        </section>
      ) : null}
    </div>
  )
}
