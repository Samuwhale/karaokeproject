import { ProgressBar } from '../feedback/ProgressBar'
import { Skeleton } from '../feedback/Skeleton'
import { isActiveRunStatus } from '../runStatus'
import {
  LIBRARY_FILTERS,
  type LibraryFilter,
  type LibrarySort,
  type LibraryView,
  trackStageSummary,
} from '../trackListView'
import type { TrackSummary } from '../../types'

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
  workQueue: {
    stagedCount: number
    activeCount: number
    followUpCount: number
  }
  selectedIds: Set<string>
  onViewChange: (view: LibraryView) => void
  onOpenQueue: () => void
  onToggleSelect: (trackId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onOpenTrack: (track: TrackSummary) => void
  onAddSongs: () => void
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

function sourceLabel(track: TrackSummary) {
  if (track.source_type === 'youtube') return 'YouTube link'
  return 'Local file'
}

function emptyMessage(filter: LibraryFilter) {
  switch (filter) {
    case 'processing':
      return 'Nothing is waiting on import or split work right now.'
    case 'ready':
      return 'Nothing is ready for version review or mixing right now.'
    default:
      return 'No songs match this search.'
  }
}

function trackActionLabel(track: TrackSummary) {
  switch (trackStageSummary(track).key) {
    case 'rendering':
      return 'Open queue'
    case 'needs-attention':
      return 'Review version'
    case 'ready':
      return 'Choose version'
    case 'final':
      return 'Open mix'
    default:
      return 'Queue split'
  }
}

export function LibraryPage({
  view,
  tracks,
  totalCount,
  hasFirstSync,
  countsByFilter,
  currentTrackId,
  workQueue,
  selectedIds,
  onViewChange,
  onOpenQueue,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenTrack,
  onAddSongs,
}: LibraryPageProps) {
  const loading = !hasFirstSync && totalCount === 0
  const libraryEmpty = hasFirstSync && totalCount === 0
  const noMatches = hasFirstSync && totalCount > 0 && tracks.length === 0
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))
  const selectedCount = selectedIds.size
  const queueSummary = [
    workQueue.stagedCount > 0
      ? `${workQueue.stagedCount} staged import${workQueue.stagedCount === 1 ? '' : 's'}`
      : null,
    workQueue.activeCount > 0
      ? `${workQueue.activeCount} split${workQueue.activeCount === 1 ? '' : 's'} running`
      : null,
    workQueue.followUpCount > 0
      ? `${workQueue.followUpCount} ready for review`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <section className="suite-page library-page">
      <header className="suite-page-head">
        <div>
          <h1>Songs</h1>
          <p>Manage your studio stems and splitting progress.</p>
        </div>
        <div className="suite-page-head-actions">
          <button type="button" className="button-primary" onClick={onAddSongs}>
            Add songs
          </button>
        </div>
      </header>

      {queueSummary ? (
        <section className="work-queue-summary">
          <div>
            <h2>{queueSummary}.</h2>
            <p>Open queue to review imports, active processing, and finished runs in one place.</p>
          </div>
          <button type="button" className="button-secondary" onClick={onOpenQueue}>
            Open queue
          </button>
        </section>
      ) : null}

      <section className="songs-library">
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
              <span>{countsByFilter[filter.value]}</span>
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
            {tracks.length > 0 ? (
              <label className="checkbox-row library-select-all">
                <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
                <span>{allSelected ? 'Clear all' : 'Select all'}</span>
              </label>
            ) : null}
            {selectedCount > 0 ? <span className="library-selection-count">{selectedCount} selected</span> : null}
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
          <div className="library-table">
            <div className="library-table-head" aria-hidden>
              <span />
              <span>Title &amp; artist</span>
              <span>Source</span>
              <span>State</span>
              <span>Action</span>
            </div>
            <div className="track-list">
              {tracks.map((track) => {
                const latest = track.latest_run
                const isSelected = selectedIds.has(track.id)
                const stage = trackStageSummary(track)
                const actionLabel = trackActionLabel(track)
                const latestRunActive = latest ? isActiveRunStatus(latest.status) : false
                const stageSummary = latestRunActive
                  ? latest?.status_message || 'Split in progress'
                    : stage.key === 'needs-attention'
                    ? 'Retry required'
                    : stage.key === 'ready'
                      ? 'Ready for review'
                      : stage.key === 'final'
                        ? 'Ready to export'
                        : track.has_custom_mix
                          ? 'Custom mix saved'
                          : 'Waiting to split'
                const metaSummary = [
                  formatDuration(track.duration_seconds),
                  track.run_count === 0
                    ? 'No versions yet'
                    : `${track.run_count} version${track.run_count === 1 ? '' : 's'}`,
                ].join(' · ')
                const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'

                return (
                  <div
                    key={track.id}
                    className={`${currentTrackId === track.id ? 'track-row-active' : ''} ${isSelected ? 'track-row-checked' : ''}`}
                  >
                    <div className="track-row-shell">
                      <label className="track-row-check" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(track.id)}
                          aria-label={`Select ${track.title}`}
                        />
                      </label>

                      <button type="button" className="track-row" onClick={() => onOpenTrack(track)}>
                        <div className="track-row-title-cell">
                          {track.thumbnail_url ? (
                            <img
                              className="track-row-art"
                              src={track.thumbnail_url}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className="track-row-art track-row-art-fallback" aria-hidden>
                              {initials}
                            </span>
                          )}
                          <div className="track-row-title">
                            <strong>{track.title}</strong>
                            <span>{artistLine(track)}</span>
                          </div>
                        </div>

                        <div className="track-row-source-cell">
                          <strong>{sourceLabel(track)}</strong>
                          <span>{metaSummary}</span>
                        </div>

                        <div className="track-row-state-cell">
                          <span className={`track-row-stage ${stage.toneClassName}`}>{stage.label}</span>
                          <span className="track-row-state-copy">{stageSummary}</span>
                          {latestRunActive && latest ? <ProgressBar value={latest.progress} /> : null}
                        </div>

                        <div className="track-row-action-cell">
                          <span>{actionLabel}</span>
                          {latestRunActive && latest ? <strong>{Math.round(latest.progress)}%</strong> : null}
                        </div>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </section>
  )
}
