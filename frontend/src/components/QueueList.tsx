import { RUN_STATUS_LABELS } from './runStatus'
import type { QueueRunEntry } from '../types'
import { ProgressBar } from './feedback/ProgressBar'

type QueueListProps = {
  entries: QueueRunEntry[]
  selectedIds: Set<string>
  onToggleSelect: (runId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onSelectTrack: (trackId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
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
  cancellingRunId,
}: QueueListProps) {
  const allSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(entry.run.id))

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(entries.map((entry) => entry.run.id))
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
          <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
          <span>{allSelected ? 'Clear all' : 'Select all'}</span>
        </label>
        <span className="library-count">{entries.length} active</span>
      </div>

      <div className="queue-list">
        {entries.map((entry) => {
          const selected = selectedIds.has(entry.run.id)
          const cancelling = cancellingRunId === entry.run.id
          return (
            <article
              key={entry.run.id}
              className={`queue-row ${selected ? 'queue-row-selected' : ''}`}
            >
              <label className="inbox-row-check">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(entry.run.id)}
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
                  {RUN_STATUS_LABELS[entry.run.status] ?? entry.run.status} ·{' '}
                  {entry.run.processing.profile_label} · {formatElapsed(entry.run.created_at)}
                </div>
                <ProgressBar value={entry.run.progress} />
                {entry.run.status !== 'queued' && entry.run.status_message ? (
                  <div className="queue-row-message">{entry.run.status_message}</div>
                ) : null}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={cancelling}
                onClick={() => void onCancelRun(entry.run.id)}
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
