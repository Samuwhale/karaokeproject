import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
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
              <h2>Staged Imports</h2>
              <p>Review new sources once, fix only what matters, then decide whether this batch should start splitting.</p>
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
              <p>Monitor active work here and open the exact version that needs a decision.</p>
            </div>
          </div>
          <QueueList
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
      ) : null}
    </section>
  )
}
