import type {
  ImportDraft,
  ProcessingProfile,
  QueueRunEntry,
  RunProcessingConfigInput,
  TrackSummary,
  UpdateImportDraftInput,
} from '../types'
import { QueueList } from './QueueList'
import { StagedImportsPanel } from './StagedImportsPanel'
import { ProgressBar } from './feedback/ProgressBar'
import { Skeleton } from './feedback/Skeleton'
import { isActiveRunStatus } from './runStatus'
import {
  LIBRARY_FILTERS,
  type LibraryFilter,
  type LibrarySort,
  type LibraryView,
  libraryFilterMeta,
  trackStageSummary,
} from './trackListView'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'created', label: 'Recently imported' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'runs', label: 'Most runs' },
]

type WorkflowFocus = {
  title: string
  description: string
  actionLabel: string
  action: () => void
}

type WorkflowSummary = {
  drafts: number
  readyToRender: number
  ready: number
  final: number
  activeRuns: number
  queueAttention: number
  attentionCount: number
}

type WorkspaceSection = 'inbox' | 'queue' | LibraryFilter

type WorkspacePanelProps = {
  workflowFocus: WorkflowFocus
  workflowSummary: WorkflowSummary
  drafts: ImportDraft[]
  queueRuns: QueueRunEntry[]
  setupRequired: boolean
  profiles: ProcessingProfile[]
  defaultProfileKey: string
  confirmingDrafts: boolean
  selectedQueueRunIds: Set<string>
  onToggleQueueSelected: (runId: string) => void
  onSelectAllQueue: (ids: string[]) => void
  onClearQueueSelection: () => void
  onSelectRun: (trackId: string, runId: string | null) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<void>
  onDismissRun: (runId: string) => Promise<void>
  cancellingRunId: string | null
  retryingRunId: string | null
  onAddSongs: () => void
  onOpenSettings: () => void
  onUpdateStagedImport: (draftId: string, payload: UpdateImportDraftInput) => Promise<void>
  onDiscardStagedImport: (draftId: string) => Promise<void>
  onConfirmStagedImports: (payload: {
    draft_ids: string[]
    queue: boolean
    processing?: RunProcessingConfigInput
    processing_overrides?: Record<string, RunProcessingConfigInput>
  }) => Promise<unknown>
  tracks: TrackSummary[]
  totalCount: number
  selectedTrackId: string | null
  hasFirstSync: boolean
  activeSection: WorkspaceSection
  onSectionChange: (section: WorkspaceSection) => void
  view: LibraryView
  countsByFilter: Record<LibraryFilter, number>
  onViewChange: (view: LibraryView) => void
  onFilterChange: (filter: LibraryFilter) => void
  selectionMode: boolean
  onSelectionModeChange: (enabled: boolean) => void
  selectedIds: Set<string>
  onToggleSelect: (trackId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function artistLine(track: TrackSummary) {
  if (track.artist) return track.artist
  return `(from ${track.source_filename})`
}

export function WorkspacePanel({
  workflowFocus,
  workflowSummary,
  drafts,
  queueRuns,
  setupRequired,
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
  onUpdateStagedImport,
  onDiscardStagedImport,
  onConfirmStagedImports,
  tracks,
  totalCount,
  selectedTrackId,
  hasFirstSync,
  activeSection,
  onSectionChange,
  view,
  countsByFilter,
  onViewChange,
  onFilterChange,
  selectionMode,
  onSelectionModeChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: WorkspacePanelProps) {
  const libraryEmpty = hasFirstSync && totalCount === 0
  const showSkeleton = !hasFirstSync && totalCount === 0
  const noMatches = hasFirstSync && totalCount > 0 && tracks.length === 0
  const countLabel = hasFirstSync ? `${tracks.length} of ${totalCount}` : null
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))
  const activeFilter = libraryFilterMeta(view.filter)
  const librarySummary = hasFirstSync
    ? [
        `${totalCount} song${totalCount === 1 ? '' : 's'} in the library`,
        drafts.length > 0 ? `${drafts.length} ready for review` : null,
        workflowSummary.activeRuns > 0 ? `${workflowSummary.activeRuns} splitting now` : null,
        workflowSummary.attentionCount > 0 ? `${workflowSummary.attentionCount} need attention` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Loading songs and workspace state.'
  const isInboxView = activeSection === 'inbox'
  const isQueueView = activeSection === 'queue'
  const isLibraryView = !isInboxView && !isQueueView
  const workspaceMode: 'inbox' | 'library' | 'queue' = isInboxView
    ? 'inbox'
    : isQueueView
      ? 'queue'
      : 'library'
  const topLevelSections = [
    {
      key: 'inbox' as const,
      label: 'Review imports',
      count: drafts.length,
      description: drafts.length > 0 ? 'Titles and duplicate decisions waiting.' : 'Nothing waiting.',
    },
    {
      key: 'library' as const,
      label: 'Library',
      count: totalCount,
      description: totalCount > 0 ? 'Browse songs by workflow stage.' : 'Empty until you import songs.',
    },
    {
      key: 'queue' as const,
      label: 'Queue',
      count: queueRuns.length,
      description:
        queueRuns.length > 0 ? 'Watch active splits and follow-ups.' : 'No split is running right now.',
    },
  ]
  const libraryFilters = LIBRARY_FILTERS.filter((filter) => filter.value !== 'all')
  const summaryItems = [
    {
      label: 'Ready to review',
      value: drafts.length,
      detail: drafts.length === 1 ? 'import waiting' : 'imports waiting',
    },
    {
      label: 'Need retry',
      value: workflowSummary.attentionCount,
      detail: workflowSummary.attentionCount === 1 ? 'item blocked' : 'items blocked',
    },
    {
      label: 'Ready to split',
      value: workflowSummary.readyToRender,
      detail: workflowSummary.readyToRender === 1 ? 'song queued next' : 'songs queued next',
    },
    {
      label: 'Final versions',
      value: workflowSummary.final,
      detail: workflowSummary.final === 1 ? 'song finished' : 'songs finished',
    },
  ]

  const activeSectionTitle = isInboxView
    ? 'Review imported songs'
    : isQueueView
      ? 'Split queue'
      : activeFilter.label
  const activeSectionDescription = isInboxView
    ? drafts.length > 0
      ? `${drafts.length} source${drafts.length === 1 ? '' : 's'} need a title or duplicate decision before they enter the library.`
      : 'No imported songs are waiting for review right now.'
    : isQueueView
      ? 'Watch active splits, reopen the exact result behind each row, and clear anything that needs follow-up.'
      : activeFilter.value === 'all'
        ? 'Browse songs by workflow stage, then open one to continue.'
        : activeFilter.description

  function emptyMessage() {
    switch (view.filter) {
      case 'needs-attention':
        return 'No songs need follow-up right now.'
      case 'ready-to-render':
        return 'No songs are waiting for a first split.'
      case 'ready':
        return 'No completed splits are waiting for review right now.'
      case 'final':
        return 'No songs have a chosen final version yet.'
      default:
        return 'No songs match this search.'
    }
  }

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <div className="track-list-wrap workspace-panel">
      <section className="workspace-header">
        <div className="workspace-header-copy">
          <h1>Workspace</h1>
          <p>{librarySummary}</p>
        </div>
        <div className="workspace-header-focus">
          <div>
            <strong>{workflowFocus.title}</strong>
            <p>{workflowFocus.description}</p>
          </div>
          <button type="button" className="button-primary" onClick={workflowFocus.action}>
            {workflowFocus.actionLabel}
          </button>
        </div>
        <div className="workspace-summary-grid" aria-label="Workspace summary">
          {summaryItems.map((item) => (
            <div key={item.label} className="workspace-summary-item">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
              <em>{item.detail}</em>
            </div>
          ))}
        </div>
      </section>

      <nav className="workspace-mode-nav" aria-label="Workspace sections">
        {topLevelSections.map((section) => {
          const active = section.key === workspaceMode
          const onClick =
            section.key === 'library'
              ? () => onFilterChange(view.filter)
              : () => onSectionChange(section.key)
          return (
            <button
              key={section.key}
              type="button"
              className={`workspace-mode-button ${active ? 'workspace-mode-button-active' : ''}`}
              onClick={onClick}
              aria-pressed={active}
            >
              <strong>{section.label}</strong>
              <span>{section.count} · {section.description}</span>
            </button>
          )
        })}
      </nav>

      {setupRequired ? (
        <section className="workspace-alert">
          <div>
            <strong>Finish setup before processing</strong>
            <p>Resolve missing tools or storage issues before you queue more work.</p>
          </div>
          <button type="button" className="button-primary" onClick={onOpenSettings}>
            Open settings
          </button>
        </section>
      ) : null}

      <section className="workspace-library">
        <div className="library-toolbar">
          <div className="library-toolbar-top">
            <div>
              <h2>{activeSectionTitle}</h2>
              <p className="library-filter-caption">{activeSectionDescription}</p>
            </div>
            {isInboxView ? (
              <button type="button" className="button-secondary" onClick={onAddSongs}>
                Add songs
              </button>
            ) : isLibraryView ? (
              <div className="track-list-head-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onSelectionModeChange(!selectionMode)}
                >
                  {selectionMode ? 'Done' : 'Select songs'}
                </button>
              </div>
            ) : null}
          </div>
          {isLibraryView ? (
            <div className="library-stage-nav" aria-label="Library stages">
              <button
                type="button"
                className={`library-stage-button ${view.filter === 'all' ? 'library-stage-button-active' : ''}`}
                onClick={() => onFilterChange('all')}
                aria-pressed={view.filter === 'all'}
              >
                <strong>All songs</strong>
                <span>{countsByFilter.all}</span>
              </button>
              {libraryFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`library-stage-button ${view.filter === filter.value ? 'library-stage-button-active' : ''}`}
                  onClick={() => onFilterChange(filter.value)}
                  aria-pressed={view.filter === filter.value}
                >
                  <strong>{filter.label}</strong>
                  <span>{countsByFilter[filter.value]}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isInboxView ? (
          drafts.length > 0 ? (
            <div className="workspace-mode-panel">
              <StagedImportsPanel
                stagedImports={drafts}
                profiles={profiles}
                defaultProfileKey={defaultProfileKey}
                confirming={confirmingDrafts}
                onUpdateStagedImport={onUpdateStagedImport}
                onDiscardStagedImport={onDiscardStagedImport}
                onConfirmStagedImports={onConfirmStagedImports}
              />
            </div>
          ) : (
              <p className="empty-state track-list-empty">
                No imported songs are waiting right now. Add files or paste a YouTube URL to start a new batch.
              </p>
          )
        ) : null}

        {isQueueView ? (
          <QueueList
            embedded
            showHeader={false}
            entries={queueRuns}
            selectedIds={selectedQueueRunIds}
            onToggleSelect={onToggleQueueSelected}
            onSelectAll={onSelectAllQueue}
            onClearSelection={onClearQueueSelection}
            onSelectRun={(trackId, runId) => onSelectRun(trackId, runId)}
            onCancelRun={onCancelRun}
            onRetryRun={onRetryRun}
            onDismissRun={onDismissRun}
            cancellingRunId={cancellingRunId}
            retryingRunId={retryingRunId}
          />
        ) : null}

        {isLibraryView ? (
          <>
            {libraryEmpty ? null : (
              <div className="library-controls">
                <input
                  type="search"
                  className="library-search"
                  placeholder="Search title or artist"
                  aria-label="Search tracks by title or artist"
                  value={view.search}
                  onChange={(event) => onViewChange({ ...view, search: event.target.value })}
                />
                <div className="library-control-row">
                  <select
                    aria-label="Sort library"
                    value={view.sort}
                    onChange={(event) =>
                      onViewChange({ ...view, sort: event.target.value as LibrarySort })
                    }
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {countLabel ? <span className="library-count">Showing {countLabel}</span> : null}
                  {selectionMode && tracks.length > 0 ? (
                    <label className="checkbox-row library-select-all">
                      <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
                      <span>{allSelected ? 'Clear all' : 'Select all'}</span>
                    </label>
                  ) : null}
                </div>
              </div>
            )}

            {showSkeleton ? (
              <div className="track-list">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="skeleton-track-row">
                    <Skeleton width="62%" height={14} />
                    <Skeleton width="40%" height={11} />
                  </div>
                ))}
              </div>
            ) : libraryEmpty ? (
              <p className="empty-state track-list-empty">
                No songs yet. Add files or paste a YouTube URL, then queue the first split when you are ready.
              </p>
            ) : noMatches ? (
              <p className="empty-state track-list-empty">{emptyMessage()}</p>
            ) : (
              <div className="track-list">
                {tracks.map((track) => {
                  const latest = track.latest_run
                  const isSelected = selectedIds.has(track.id)
                  const stage = trackStageSummary(track)
                  const latestRunActive = latest ? isActiveRunStatus(latest.status) : false
                  const metaSummary = [
                    track.source_type === 'youtube' ? 'YouTube' : 'Local',
                    formatDuration(track.duration_seconds),
                    track.run_count === 0
                      ? 'No splits yet'
                      : `${track.run_count} split${track.run_count === 1 ? '' : 's'}`,
                  ].join(' · ')
                  const stageSummary = latestRunActive
                    ? latest?.status_message || 'Split in progress'
                    : track.has_custom_mix
                      ? 'Custom mix saved'
                      : stage.key === 'needs-attention'
                        ? 'Retry this split or choose a different setup'
                        : stage.key === 'ready'
                          ? 'Choose the result to keep'
                          : stage.key === 'final'
                            ? 'Ready to export again'
                            : 'Ready for the first split'

                  return (
                    <div
                      key={track.id}
                      className={`track-card-shell ${selectionMode ? 'track-card-shell-selecting' : ''} ${selectedTrackId === track.id ? 'track-card-active' : ''} ${isSelected ? 'track-card-checked' : ''}`}
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
                      <button
                        type="button"
                        className="track-card track-card-main"
                        onClick={() => onSelectRun(track.id, null)}
                      >
                        <div className="track-card-header">
                          <div>
                            <strong>{track.title}</strong>
                            <p>{artistLine(track)}</p>
                          </div>
                          <span className={`track-card-stage ${stage.toneClassName}`}>{stage.label}</span>
                        </div>
                        <div className="track-card-footer">
                          <span>{metaSummary}</span>
                          <span>{stageSummary}</span>
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
          </>
        ) : null}
      </section>
    </div>
  )
}
