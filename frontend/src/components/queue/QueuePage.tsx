import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
import type {
  ProcessingProfile,
  QueueRunEntry,
  RunProcessingConfigInput,
  UpdateImportDraftInput,
} from '../../types'

type QueuePageProps = {
  draftsCount: number
  queueCount: number
  stagedImports: Parameters<typeof StagedImportsPanel>[0]['stagedImports']
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  selectedQueueRunIds: Set<string>
  queueRuns: QueueRunEntry[]
  cancellingRunId: string | null
  retryingRunId: string | null
  onAddSongs: () => void
  onSelectRun: (trackId: string, runId: string | null) => void
  onToggleQueueSelected: (runId: string) => void
  onSelectAllQueue: (ids: string[]) => void
  onClearQueueSelection: () => void
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

export function QueuePage({
  draftsCount,
  queueCount,
  stagedImports,
  profiles,
  defaultProfileKey,
  confirmingDrafts,
  selectedQueueRunIds,
  queueRuns,
  cancellingRunId,
  retryingRunId,
  onAddSongs,
  onSelectRun,
  onToggleQueueSelected,
  onSelectAllQueue,
  onClearQueueSelection,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: QueuePageProps) {
  const hasImports = stagedImports.length > 0
  const hasQueue = queueRuns.length > 0
  const intro = hasImports
    ? 'Review imports first, then queue the split batch that should run next.'
    : hasQueue
      ? 'Watch active splits here and jump back into Studio when a result needs a decision.'
      : 'This is the shared inbox for new imports and active splitting jobs.'

  return (
    <section className="suite-page queue-page">
      <header className="suite-page-head">
        <div>
          <h1>Work Queue</h1>
          <p>{intro}</p>
        </div>
        <button type="button" className="button-primary" onClick={onAddSongs}>
          Add songs
        </button>
      </header>

      {hasImports || hasQueue ? (
        <div className="queue-overview" aria-label="Work queue overview">
          <div>
            <strong>{draftsCount}</strong>
            <span>imports to review</span>
          </div>
          <div>
            <strong>{queueCount}</strong>
            <span>split jobs in queue</span>
          </div>
        </div>
      ) : null}

      <div className="queue-sections">
        {hasImports ? (
          <section className="queue-section">
            <div className="queue-section-head">
              <div>
                <h2>Review Imports</h2>
                <p>Confirm titles, resolve duplicates only when needed, and queue the next batch.</p>
              </div>
            </div>
            <div className="queue-imports-panel">
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

        <section className="queue-section">
          <div className="queue-section-head">
            <div>
              <h2>{hasQueue ? 'Processing' : 'No Active Work'}</h2>
              <p>
                {hasQueue
                  ? 'Keep processing visible here without leaving the batch inbox.'
                  : 'When you queue splits, their progress and follow-up actions appear here.'}
              </p>
            </div>
          </div>
          <QueueList
            embedded
            showHeader={false}
            entries={queueRuns}
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
        </section>
      </div>

      {!hasImports && !hasQueue ? (
        <div className="empty-state queue-empty-state">
          Nothing is waiting right now. Add songs to start another split batch.
        </div>
      ) : null}
    </section>
  )
}
