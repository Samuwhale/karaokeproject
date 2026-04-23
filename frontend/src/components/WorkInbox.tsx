import type { ImportDraft, ProcessingProfile, QueueRunEntry, RunProcessingConfigInput, UpdateImportDraftInput } from '../types'
import type { LibraryFilter } from './trackListView'
import { QueueList } from './QueueList'
import { StagedImportsPanel } from './StagedImportsPanel'

type WorkInboxProps = {
  drafts: ImportDraft[]
  queueRuns: QueueRunEntry[]
  setupRequired: boolean
  activeRuns: number
  attentionCount: number
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  selectedQueueRunIds: Set<string>
  onToggleQueueSelected: (runId: string) => void
  onSelectAllQueue: (ids: string[]) => void
  onClearQueueSelection: () => void
  onSelectRun: (trackId: string, runId: string) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
  retryingRunId: string | null
  onAddSongs: () => void
  onOpenSettings: () => void
  onOpenFilter: (filter: LibraryFilter) => void
  onUpdateStagedImport: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardStagedImport: (draftId: string) => Promise<void>
  onConfirmStagedImports: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
    processing_overrides?: Record<string, RunProcessingConfigInput>
  }) => Promise<unknown>
}

export function WorkInbox({
  drafts,
  queueRuns,
  setupRequired,
  activeRuns,
  attentionCount,
  profiles,
  defaultProfileKey,
  confirmingDrafts,
  selectedQueueRunIds,
  onToggleQueueSelected,
  onSelectAllQueue,
  onClearQueueSelection,
  onSelectRun,
  onCancelRun,
  onRetryRun,
  onDismissRun,
  cancellingRunId,
  retryingRunId,
  onAddSongs,
  onOpenSettings,
  onOpenFilter,
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
}: WorkInboxProps) {
  const queueShortcut =
    attentionCount > 0
      ? {
          label: 'Open songs needing attention',
          filter: 'needs-attention' as LibraryFilter,
        }
      : activeRuns > 0
        ? {
            label: 'Open rendering songs',
            filter: 'rendering' as LibraryFilter,
          }
        : null

  return (
    <div className="track-list-wrap work-inbox">
      <div className="section-head">
        <div className="section-head-copy">
          <h2>Inbox</h2>
          <p>Keep setup blockers, staged imports, running work, and next decisions in one place.</p>
        </div>
      </div>

      <div className="work-inbox-body">
        {setupRequired ? (
          <section className="work-inbox-section">
            <div className="work-inbox-callout">
              <div>
                <strong>Finish setup before processing</strong>
                <p>Resolve missing tools or storage issues before you queue more work.</p>
              </div>
              <button type="button" className="button-primary" onClick={onOpenSettings}>
                Open settings
              </button>
            </div>
          </section>
        ) : null}

        <section className="work-inbox-section">
          <div className="work-inbox-section-head">
            <div>
              <h3>Staged imports</h3>
              <p>
                {drafts.length > 0
                  ? `${drafts.length} staged source${drafts.length === 1 ? '' : 's'} waiting for review or import.`
                  : 'Imported sources stay visible here until you confirm their titles and duplicate handling.'}
              </p>
            </div>
            <button type="button" className="button-secondary" onClick={onAddSongs}>
              Add songs
            </button>
          </div>
          {drafts.length === 0 ? (
            <p className="empty-state">Nothing staged right now. Add local files or paste a YouTube URL to start.</p>
          ) : (
            <StagedImportsPanel
              stagedImports={drafts}
              profiles={profiles}
              defaultProfileKey={defaultProfileKey}
              confirming={confirmingDrafts}
              onUpdateStagedImport={onUpdateStagedImport}
              onDiscardStagedImport={onDiscardStagedImport}
              onConfirmStagedImports={onConfirmStagedImports}
            />
          )}
        </section>

        <section className="work-inbox-section">
          <div className="work-inbox-section-head">
            <div>
              <h3>Active queue</h3>
              <p>
                {attentionCount > 0
                  ? 'Running work stays visible here, and failed runs can be reopened without leaving the inbox.'
                  : 'Queue visibility stays pinned here so you can check progress without leaving the worklist.'}
              </p>
            </div>
            {queueShortcut ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => onOpenFilter(queueShortcut.filter)}
              >
                {queueShortcut.label}
              </button>
            ) : null}
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
    </div>
  )
}
