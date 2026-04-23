import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
import { RUN_STATUS_LABELS } from '../runStatus'
import { isActiveRunStatus } from '../runStatus'
import type {
  ProcessingProfile,
  QueueRunEntry,
  RunProcessingConfigInput,
  StagedImport,
  UpdateImportDraftInput,
} from '../../types'

type QueuePageProps = {
  stagedImports: StagedImport[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  selectedQueueRunIds: Set<string>
  queueRuns: QueueRunEntry[]
  cancellingRunId: string | null
  retryingRunId: string | null
  onAddSongs: () => void
  onToggleQueueSelected: (runId: string) => void
  onSelectAllQueue: (ids: string[]) => void
  onClearQueueSelection: () => void
  onSelectRun: (trackId: string, runId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  onUpdateStagedImport: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardStagedImport: (draftId: string) => Promise<void>
  onConfirmStagedImports: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
    processing_overrides?: Record<string, RunProcessingConfigInput>
  }) => Promise<unknown>
}

function formatRelativeShort(value: string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.round(diffMs / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function QueuePage({
  stagedImports,
  profiles,
  defaultProfileKey,
  confirmingDrafts,
  selectedQueueRunIds,
  queueRuns,
  cancellingRunId,
  retryingRunId,
  onAddSongs,
  onToggleQueueSelected,
  onSelectAllQueue,
  onClearQueueSelection,
  onSelectRun,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: QueuePageProps) {
  const hasImports = stagedImports.length > 0
  const hasQueue = queueRuns.length > 0
  const activeEntries = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status))
  const readyEntries = queueRuns.filter((entry) => !isActiveRunStatus(entry.run.status))

  return (
    <section className="suite-page queue-page">
      <header className="suite-page-head">
        <div>
          <h1>Open Queue</h1>
          <p>Manage your current processing stems and imports.</p>
        </div>
        <div className="suite-page-head-actions">
          <button type="button" className="button-primary" onClick={onAddSongs}>
            Add songs
          </button>
        </div>
      </header>

      {!hasImports && !hasQueue ? (
        <section className="queue-section queue-empty-state">
          <strong>Nothing is waiting right now.</strong>
          <p>Add songs or queue a split from the library to bring work back here.</p>
        </section>
      ) : null}

      {hasImports ? (
        <section className="queue-section">
          <div className="queue-section-head">
            <div>
              <h2>Staged Imports ({stagedImports.length})</h2>
              <p>Clean up names once, resolve duplicates, then decide whether this batch should start splitting now.</p>
            </div>
          </div>
          <StagedImportsPanel
            stagedImports={stagedImports}
            profiles={profiles}
            defaultProfileKey={defaultProfileKey}
            confirming={confirmingDrafts}
            onUpdateStagedImport={onUpdateStagedImport}
            onDiscardStagedImport={onDiscardStagedImport}
            onConfirmStagedImports={onConfirmStagedImports}
          />
        </section>
      ) : null}

      {hasQueue ? (
        <section className="queue-section">
          <div className="queue-section-head">
            <div>
              <h2>Active Queue</h2>
              <p>Monitor the current work and jump straight into the version that needs attention next.</p>
            </div>
            {activeEntries.length > 0 ? <span className="queue-section-count">{activeEntries.length} items processing</span> : null}
          </div>
          {activeEntries.length > 0 ? (
            <QueueList
              showHeader={false}
              entries={activeEntries}
              selectedIds={selectedQueueRunIds}
              onToggleSelect={onToggleQueueSelected}
              onSelectAll={onSelectAllQueue}
              onClearSelection={onClearQueueSelection}
              onSelectRun={onSelectRun}
              onCancelRun={onCancelRun}
              onRetryRun={onRetryRun}
              onDismissRun={onDismissRun}
              cancellingRunId={cancellingRunId}
              retryingRunId={retryingRunId}
            />
          ) : (
            <p className="empty-state">No active splits are running right now.</p>
          )}
        </section>
      ) : null}

      {readyEntries.length > 0 ? (
        <section className="queue-section queue-ready-section">
          <div className="queue-section-head">
            <div>
              <h2>Ready for Studio</h2>
              <p>Open finished versions, retry anything that failed, and keep the queue moving.</p>
            </div>
          </div>

          <div className="queue-ready-grid">
            {readyEntries.map((entry) => {
              const failed = entry.run.status === 'failed' || entry.run.status === 'cancelled'

              return (
                <article
                  key={entry.run.id}
                  className={`queue-ready-card ${failed ? 'queue-ready-card-danger' : ''}`}
                >
                  <div className="queue-ready-card-copy">
                    <strong>{entry.track_title}</strong>
                    <span>
                      {failed
                        ? RUN_STATUS_LABELS[entry.run.status] ?? entry.run.status
                        : `${entry.run.processing.profile_label} · ${formatRelativeShort(entry.run.updated_at)}`}
                    </span>
                  </div>
                  <p className="queue-ready-card-detail">
                    {failed
                      ? entry.run.error_message || 'This run needs another attempt.'
                      : `${Math.max(1, Math.round(entry.run.progress || 100))}% complete · open in Studio to review or export.`}
                  </p>
                  <div className="queue-ready-card-actions">
                    {failed ? (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={retryingRunId === entry.run.id}
                        onClick={() => void onRetryRun(entry.run.id)}
                      >
                        {retryingRunId === entry.run.id ? 'Retrying…' : 'Retry Split'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => onSelectRun(entry.track_id, entry.run.id)}
                      >
                        Open in Studio
                      </button>
                    )}
                    {failed ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void onDismissRun(entry.run.id)}
                      >
                        Dismiss
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </section>
  )
}
