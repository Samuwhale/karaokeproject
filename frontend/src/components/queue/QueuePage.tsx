import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
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

function importsHeadline(
  stagedCount: number,
  readyCount: number,
  activeCount: number,
  blockedCount: number,
) {
  if (stagedCount > 0) {
    return `${stagedCount} source${stagedCount === 1 ? '' : 's'} waiting for import review.`
  }
  if (readyCount > 0) {
    return `${readyCount} finished split${readyCount === 1 ? '' : 's'} ready to open in Mix.`
  }
  if (activeCount > 0) {
    return `${activeCount} split${activeCount === 1 ? '' : 's'} running in the background.`
  }
  if (blockedCount > 0) {
    return `${blockedCount} split${blockedCount === 1 ? '' : 's'} need another decision before work continues.`
  }
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
  const processingEntries = [...activeEntries, ...failedEntries]

  return (
    <section className="kp-page kp-queue-page">
      <header className="kp-page-header">
        <div>
          <h1>Imports</h1>
          <p>
            {importsHeadline(
              stagedImports.length,
              studioReadyEntries.length,
              activeEntries.length,
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
            <p>Add songs to stage sources, start splits, and feed the next mix session.</p>
          </div>
        </section>
      ) : null}

      <div className="kp-queue-layout">
        {hasImports ? (
          <section className="kp-queue-section kp-queue-section-primary">
            <header className="kp-section-header">
              <div>
                <h2>Import Review</h2>
                <p>Clean titles once, resolve duplicates, then decide whether this batch only enters Songs or starts splitting immediately.</p>
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

        {studioReadyEntries.length > 0 ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Ready for Mix</h2>
                <p>Open the next finished result and move straight into review or mixing.</p>
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
                    Open mix
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {processingEntries.length > 0 ? (
          <section className="kp-queue-section">
            <header className="kp-section-header">
              <div>
                <h2>Processing & Follow-Up</h2>
                <p>Keep active splits visible and clear failures so the inbox stays legible.</p>
              </div>
              <span>{processingEntries.length}</span>
            </header>
            <div className="kp-queue-embedded">
              <QueueList
                showHeader={false}
                entries={processingEntries}
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

      </div>
    </section>
  )
}
