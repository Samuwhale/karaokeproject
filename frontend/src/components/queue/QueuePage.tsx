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

function queueHeadline(
  stagedCount: number,
  activeCount: number,
  readyCount: number,
  blockedCount: number,
) {
  if (readyCount > 0) return `${readyCount} completed split${readyCount === 1 ? '' : 's'} can move into Studio now.`
  if (stagedCount > 0) return `${stagedCount} import${stagedCount === 1 ? '' : 's'} need review before the next split starts.`
  if (activeCount > 0) return `${activeCount} split${activeCount === 1 ? '' : 's'} running in the background right now.`
  if (blockedCount > 0) return `${blockedCount} run${blockedCount === 1 ? '' : 's'} need attention before work can continue.`
  return 'Nothing is waiting right now.'
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
  const followUpEntries = queueRuns.filter((entry) => !isActiveRunStatus(entry.run.status))
  const failedEntries = followUpEntries.filter(
    (entry) => entry.run.status === 'failed' || entry.run.status === 'cancelled',
  )
  const studioReadyEntries = followUpEntries.filter(
    (entry) => entry.run.status !== 'failed' && entry.run.status !== 'cancelled',
  )

  return (
    <section className="kp-page kp-queue-page">
      <header className="kp-page-header">
        <div>
          <h1>Queue</h1>
          <p>
            {queueHeadline(
              stagedImports.length,
              activeEntries.length,
              studioReadyEntries.length,
              failedEntries.length,
            )}
          </p>
        </div>
        <button type="button" className="button-primary" onClick={onAddSongs}>
          Add songs
        </button>
      </header>

      {!hasImports && !hasQueue ? (
        <section className="kp-inline-banner">
          <div>
            <strong>Nothing waiting</strong>
            <p>Add songs or queue a split from the library to bring work back here.</p>
          </div>
        </section>
      ) : null}

      <div className="kp-queue-layout">
        {studioReadyEntries.length > 0 ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Ready for Studio</h2>
                <p>Open the next finished result and move straight into review or mix.</p>
              </div>
              <span>{studioReadyEntries.length}</span>
            </header>

            <div className="kp-ready-list">
              {studioReadyEntries.map((entry) => (
                <article key={entry.run.id} className="kp-ready-row">
                  <div>
                    <strong>{entry.track_title}</strong>
                    <p>
                      {entry.run.processing.profile_label} · {formatRelativeShort(entry.run.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => onSelectRun(entry.track_id, entry.run.id)}
                  >
                    Open in Studio
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {hasImports ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Import review</h2>
                <p>Clean up names, resolve duplicates once, then decide whether this batch should start splitting now.</p>
              </div>
              <span>{stagedImports.length}</span>
            </header>
            <div className="kp-queue-embedded">
              <StagedImportsPanel
                stagedImports={stagedImports}
                profiles={profiles}
                defaultProfileKey={defaultProfileKey}
                confirming={confirmingDrafts}
                onUpdateStagedImport={onUpdateStagedImport}
                onDiscardStagedImport={onDiscardStagedImport}
                onConfirmStagedImports={onConfirmStagedImports}
              />
            </div>
          </section>
        ) : null}

        {activeEntries.length > 0 ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Separating now</h2>
                <p>Keep active runs visible, then jump into Studio as soon as one finishes.</p>
              </div>
              <span>{activeEntries.length}</span>
            </header>
            <div className="kp-queue-embedded">
              <QueueList
                showHeader={false}
                entries={activeEntries}
                selectedIds={selectedQueueRunIds}
                onToggleSelect={onToggleQueueSelected}
                onSelectRun={onSelectRun}
                onCancelRun={onCancelRun}
                onRetryRun={onRetryRun}
                onDismissRun={onDismissRun}
                cancellingRunId={cancellingRunId}
                retryingRunId={retryingRunId}
              />
            </div>
          </section>
        ) : null}

        {failedEntries.length > 0 ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Needs attention</h2>
                <p>Retry failed work or clear it out so the queue stays legible.</p>
              </div>
              <span>{failedEntries.length}</span>
            </header>

            <div className="kp-ready-list">
              {failedEntries.map((entry) => (
                <article key={entry.run.id} className="kp-ready-row kp-ready-row-danger">
                  <div>
                    <strong>{entry.track_title}</strong>
                    <p>{RUN_STATUS_LABELS[entry.run.status] ?? entry.run.status}</p>
                    <small>{entry.run.error_message || 'This run needs another attempt before it can move forward.'}</small>
                  </div>
                  <div className="kp-ready-actions">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={retryingRunId === entry.run.id}
                      onClick={() => void onRetryRun(entry.run.id)}
                    >
                      {retryingRunId === entry.run.id ? 'Retrying…' : 'Retry split'}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void onDismissRun(entry.run.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}
