import { RUN_STATUS_LABELS, describeRun, isTerminalRunStatus } from './runStatus'
import type { QueueRunEntry } from '../types'
import { ProgressBar } from './feedback/ProgressBar'
import { Spinner } from './feedback/Spinner'

type QueueListProps = {
  entries: QueueRunEntry[]
  selectedIds: Set<string>
  onToggleSelect: (runId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onSelectTrack: (trackId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
  retryingRunId: string | null
}

function formatElapsed(createdAt: string) {
  const started = new Date(createdAt).getTime()
  const diffSec = Math.max(0, Math.round((Date.now() - started) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const m = Math.floor(diffSec / 60)
  const s = diffSec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function QueueList({
  entries,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onSelectTrack,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  cancellingRunId,
  retryingRunId,
}: QueueListProps) {
  const selectableIds = entries
    .filter((entry) => !isTerminalRunStatus(entry.run.status))
    .map((entry) => entry.run.id)
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(selectableIds)
  }

  if (entries.length === 0) {
    return (
      <div className="track-list-wrap">
        <div className="section-head">
          <h2>Queue</h2>
        </div>
        <p className="empty-state">
          Nothing running. Confirm drafts in Inbox or queue a new render from the Library to see
          live progress here.
        </p>
      </div>
    )
  }

  return (
    <div className="track-list-wrap">
      <div className="section-head">
        <h2>Queue</h2>
      </div>

      <div className="inbox-controls">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={selectableIds.length === 0}
            onChange={handleToggleAll}
          />
          <span>{allSelected ? 'Clear all' : 'Select all'}</span>
        </label>
        <span className="library-count">{entries.length} active</span>
      </div>

      <div className="queue-list">
        {entries.map((entry) => {
          const { run } = entry
          const terminal = isTerminalRunStatus(run.status)
          const failed = run.status === 'failed' || run.status === 'cancelled'
          const completed = run.status === 'completed'
          const selected = selectedIds.has(run.id)
          const cancelling = cancellingRunId === run.id
          const retrying = retryingRunId === run.id
          const description = describeRun(run)

          const rowClassName = [
            'queue-row',
            selected ? 'queue-row-selected' : '',
            failed ? 'queue-row-failed' : '',
            completed ? 'queue-row-done' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <article key={run.id} className={rowClassName}>
              <label className="inbox-row-check">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={terminal}
                  onChange={() => onToggleSelect(run.id)}
                />
              </label>
              <button
                type="button"
                className="queue-row-main"
                onClick={() => onSelectTrack(entry.track_id)}
              >
                <div className="queue-row-title">
                  <strong>{entry.track_title}</strong>
                  {entry.track_artist ? <span> · {entry.track_artist}</span> : null}
                </div>
                <div className="queue-row-meta">
                  {RUN_STATUS_LABELS[run.status] ?? run.status} ·{' '}
                  {run.processing.profile_label} · {formatElapsed(run.created_at)}
                </div>
                {!terminal ? <ProgressBar value={run.progress} /> : null}
                {description && !failed ? (
                  <div className="queue-row-message">{description}</div>
                ) : null}
                {failed && run.error_message ? (
                  <div className="queue-row-error">{run.error_message}</div>
                ) : null}
              </button>
              <div className="queue-row-actions">
                {failed ? (
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
                      ) : run.status === 'cancelled' ? (
                        'Run again'
                      ) : (
                        'Retry'
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
                ) : completed ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void onDismissRun(run.id)}
                  >
                    Dismiss
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={cancelling}
                    onClick={() => void onCancelRun(run.id)}
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
