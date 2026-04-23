import { QueueList } from '../QueueList'
import { StagedImportsPanel } from '../StagedImportsPanel'
import { ProgressBar } from '../feedback/ProgressBar'
import { Skeleton } from '../feedback/Skeleton'
import { isActiveRunStatus } from '../runStatus'
import {
  LIBRARY_FILTERS,
  type LibraryFilter,
  libraryFilterMeta,
  type LibrarySort,
  type LibraryView,
  trackStageSummary,
} from '../trackListView'
import type {
  ProcessingProfile,
  QueueRunEntry,
  RunProcessingConfigInput,
  StagedImport,
  TrackSummary,
  UpdateImportDraftInput,
} from '../../types'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'created', label: 'Recently imported' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'runs', label: 'Most runs' },
]

type LibraryPageProps = {
  view: LibraryView
  tracks: TrackSummary[]
  totalCount: number
  hasFirstSync: boolean
  countsByFilter: Record<LibraryFilter, number>
  currentTrackId: string | null
  selectionMode: boolean
  selectedIds: Set<string>
  stagedImports: StagedImport[]
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  selectedQueueRunIds: Set<string>
  queueRuns: QueueRunEntry[]
  cancellingRunId: string | null
  retryingRunId: string | null
  onViewChange: (view: LibraryView) => void
  onSelectionModeChange: (enabled: boolean) => void
  onToggleSelect: (trackId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onOpenTrack: (trackId: string) => void
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

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function artistLine(track: TrackSummary) {
  if (track.artist) return track.artist
  return `(from ${track.source_filename})`
}

function emptyMessage(filter: LibraryFilter) {
  switch (filter) {
    case 'needs-attention':
      return 'No songs need another attempt right now.'
    case 'ready-to-render':
      return 'Every imported song already has a split queued or finished.'
    case 'ready':
      return 'Nothing is waiting for a final listening pass right now.'
    case 'final':
      return 'No final versions have been saved yet.'
    default:
      return 'No songs match this search.'
  }
}

export function LibraryPage({
  view,
  tracks,
  totalCount,
  hasFirstSync,
  countsByFilter,
  currentTrackId,
  selectionMode,
  selectedIds,
  stagedImports,
  profiles,
  defaultProfileKey,
  confirmingDrafts,
  selectedQueueRunIds,
  queueRuns,
  cancellingRunId,
  retryingRunId,
  onViewChange,
  onSelectionModeChange,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenTrack,
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
}: LibraryPageProps) {
  const loading = !hasFirstSync && totalCount === 0
  const libraryEmpty = hasFirstSync && totalCount === 0
  const noMatches = hasFirstSync && totalCount > 0 && tracks.length === 0
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))
  const activeQueueCount = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status)).length
  const needsFollowUpCount = queueRuns.length - activeQueueCount
  const hasImports = stagedImports.length > 0
  const hasQueue = queueRuns.length > 0
  const activeFilterMeta = libraryFilterMeta(view.filter)

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <section className="suite-page library-page">
      <header className="suite-page-head">
        <div>
          <h1>Songs</h1>
          <p>Add sources, review the next actions, then open Studio only when a song is ready to judge.</p>
        </div>
        <div className="suite-page-head-actions">
          <button type="button" className="button-secondary" onClick={() => onSelectionModeChange(!selectionMode)}>
            {selectionMode ? 'Done' : 'Select songs'}
          </button>
          <button type="button" className="button-primary" onClick={onAddSongs}>
            Add songs
          </button>
        </div>
      </header>

      {hasImports || hasQueue ? (
        <section className="songs-priority">
          <div className="songs-priority-head">
            <div>
              <h2>Next up</h2>
              <p>Keep new imports and active work together so the queue feels like part of the song flow, not a separate place to manage.</p>
            </div>
            <div className="songs-priority-meta">
              {hasImports ? <span>{stagedImports.length} import review</span> : null}
              {activeQueueCount > 0 ? <span>{activeQueueCount} running</span> : null}
              {needsFollowUpCount > 0 ? <span>{needsFollowUpCount} need follow-up</span> : null}
            </div>
          </div>

          {hasImports ? (
            <section className="songs-priority-section">
              <div className="queue-section-head">
                <div>
                  <h2>Review imports</h2>
                  <p>Fix titles only when needed, resolve duplicates, and queue the right split once for the whole batch.</p>
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
            <section className="songs-priority-section">
              <div className="queue-section-head">
                <div>
                  <h2>Processing and follow-up</h2>
                  <p>Watch active splits here and jump into the exact song version that needs a decision.</p>
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
          ) : null}
        </section>
      ) : null}

      <section className="songs-library">
        <div className="queue-section-head">
          <div>
            <h2>Library</h2>
            <p>{activeFilterMeta.description}</p>
          </div>
        </div>

        <div className="library-filter-bar" role="tablist" aria-label="Song workflow filters">
          {LIBRARY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={view.filter === filter.value}
              className={`library-filter-pill ${view.filter === filter.value ? 'library-filter-pill-active' : ''}`}
              onClick={() => onViewChange({ ...view, filter: filter.value })}
            >
              <strong>{filter.label}</strong>
              <span>{countsByFilter[filter.value]} songs</span>
            </button>
          ))}
        </div>

        <div className="library-toolbar">
          <input
            type="search"
            className="library-search"
            placeholder="Search title or artist"
            aria-label="Search songs by title or artist"
            value={view.search}
            onChange={(event) => onViewChange({ ...view, search: event.target.value })}
          />
          <div className="library-toolbar-actions">
            <select
              aria-label="Sort songs"
              value={view.sort}
              onChange={(event) => onViewChange({ ...view, sort: event.target.value as LibrarySort })}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectionMode && tracks.length > 0 ? (
              <label className="checkbox-row library-select-all">
                <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
                <span>{allSelected ? 'Clear all' : 'Select all'}</span>
              </label>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="track-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton-track-row">
                <Skeleton width="62%" height={14} />
                <Skeleton width="40%" height={11} />
              </div>
            ))}
          </div>
        ) : libraryEmpty ? (
          <p className="empty-state track-list-empty">
            No songs yet. Add files or a YouTube link to stage the first batch.
          </p>
        ) : noMatches ? (
          <p className="empty-state track-list-empty">{emptyMessage(view.filter)}</p>
        ) : (
          <div className="track-list">
            {tracks.map((track) => {
              const latest = track.latest_run
              const isSelected = selectedIds.has(track.id)
              const stage = trackStageSummary(track)
              const latestRunActive = latest ? isActiveRunStatus(latest.status) : false
              const stageSummary = latestRunActive
                ? latest?.status_message || 'Split in progress'
                : track.has_custom_mix
                  ? 'Custom mix saved'
                  : stage.key === 'needs-attention'
                    ? 'Retry this version or queue a different setup'
                    : stage.key === 'ready'
                      ? 'Open Studio, compare versions, and choose the keeper'
                      : stage.key === 'final'
                        ? 'Ready to export again'
                        : 'Queue the first split'
              const metaSummary = [
                track.source_type === 'youtube' ? 'YouTube' : 'Local',
                formatDuration(track.duration_seconds),
                track.run_count === 0
                  ? 'No versions yet'
                  : `${track.run_count} version${track.run_count === 1 ? '' : 's'}`,
              ].join(' · ')

              return (
                <div
                  key={track.id}
                  className={`track-card-shell ${selectionMode ? 'track-card-shell-selecting' : ''} ${currentTrackId === track.id ? 'track-card-active' : ''} ${isSelected ? 'track-card-checked' : ''}`}
                >
                  {selectionMode ? (
                    <label className="track-card-check" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(track.id)}
                        aria-label={`Select ${track.title}`}
                      />
                    </label>
                  ) : null}
                  <button type="button" className="track-card track-card-main" onClick={() => onOpenTrack(track.id)}>
                    <div className="track-card-header">
                      <div>
                        <strong>{track.title}</strong>
                        <p>{artistLine(track)}</p>
                      </div>
                      <span className={`track-card-stage ${stage.toneClassName}`}>{stage.label}</span>
                    </div>
                    <div className="track-card-footer">
                      <strong className="track-card-next">{stageSummary}</strong>
                      <span className="track-card-meta">{metaSummary}</span>
                    </div>
                    {latestRunActive && latest ? (
                      <div className="track-card-progress">
                        <ProgressBar value={latest.progress} />
                      </div>
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}
