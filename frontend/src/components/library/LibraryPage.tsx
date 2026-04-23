import { Skeleton } from '../feedback/Skeleton'
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
  { value: 'runs', label: 'Most versions' },
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
  onToggleSelect: (trackId: string) => void
  onSelectAll: () => void
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
  return 'Unknown artist'
}

function emptyMessage(filter: LibraryFilter) {
  switch (filter) {
    case 'needs-work':
      return 'Nothing is waiting on import review, split work, or retry right now.'
    case 'ready':
      return 'Nothing is ready to open in the mixer right now.'
    case 'final':
      return 'No songs have a locked final version yet.'
    default:
      return 'No songs match this search.'
  }
}

function nextActionLabel(track: TrackSummary) {
  const stage = trackStageSummary(track)

  switch (stage.key) {
    case 'rendering':
      return 'Watch queue'
    case 'needs-attention':
      return 'Fix split'
    case 'ready':
      return 'Open mix'
    case 'final':
      return 'Resume mix'
    default:
      return 'Start split'
  }
}

function libraryHeadline(totalCount: number, readyCount: number) {
  if (totalCount === 0) return 'Build the song library first, then move straight into Mix.'
  if (readyCount === 0) return 'Everything here still needs import review, a split, or a retry.'
  return `${readyCount} song${readyCount === 1 ? '' : 's'} are ready to review or open in Mix.`
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
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenTrack,
  onAddSongs,
}: LibraryPageProps) {
  const loading = !hasFirstSync && totalCount === 0
  const libraryEmpty = hasFirstSync && totalCount === 0
  const noMatches = hasFirstSync && totalCount > 0 && tracks.length === 0
  const selectedCount = selectedIds.size
  const allVisibleSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))
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

  return (
    <section className="kp-page kp-library-page">
      <header className="kp-page-header">
        <div>
          <h1>Songs</h1>
          <p>{libraryHeadline(totalCount, countsByFilter.ready)}</p>
          {queueSummary ? (
            <p className="kp-page-supporting-copy">
              Imports: {queueSummary}. Open Imports when you want to review sources or pick up the next finished split.
            </p>
          ) : null}
        </div>
        <button type="button" className="button-primary" onClick={onAddSongs}>
          Add songs
        </button>
      </header>

      <section className="kp-library-shell">
        <div className="kp-library-toolbar">
          <div className="kp-segmented-control" role="tablist" aria-label="Song workflow filters">
            {LIBRARY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={view.filter === filter.value}
                className={view.filter === filter.value ? 'kp-segmented-active' : ''}
                onClick={() => onViewChange({ ...view, filter: filter.value })}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="kp-library-controls">
            <button
              type="button"
              className="button-secondary"
              disabled={tracks.length === 0}
              onClick={allVisibleSelected ? onClearSelection : onSelectAll}
            >
              {allVisibleSelected ? 'Clear selection' : `Select all shown${tracks.length > 0 ? ` (${tracks.length})` : ''}`}
            </button>
            <input
              type="search"
              className="kp-search-field"
              placeholder="Search title or artist"
              aria-label="Search songs by title or artist"
              value={view.search}
              onChange={(event) => onViewChange({ ...view, search: event.target.value })}
            />
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
            <span className="kp-toolbar-meta">
              {tracks.length} shown
              {countsByFilter[view.filter] !== tracks.length && view.filter !== 'all'
                ? ` · ${countsByFilter[view.filter]} total`
                : ''}
            </span>
            {selectedCount > 0 ? <span className="kp-toolbar-meta">{selectedCount} selected</span> : null}
          </div>
        </div>

        {loading ? (
          <div className="kp-library-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="kp-library-row kp-library-row-skeleton">
                <Skeleton width="58%" height={16} />
                <Skeleton width="24%" height={14} />
                <Skeleton width="18%" height={14} />
              </div>
            ))}
          </div>
        ) : libraryEmpty ? (
          <p className="empty-state">No songs yet. Add files or a YouTube link to stage the first batch.</p>
        ) : noMatches ? (
          <p className="empty-state">{emptyMessage(view.filter)}</p>
        ) : (
          <div className="kp-library-list">
            <div className="kp-library-head" aria-hidden>
              <span />
              <span>Song</span>
              <span>Stage</span>
              <span>Next step</span>
            </div>

            {tracks.map((track) => {
              const stage = trackStageSummary(track)
              const isSelected = selectedIds.has(track.id)
              const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'
              const metadata = [
                artistLine(track),
                formatDuration(track.duration_seconds),
                track.run_count === 0
                  ? 'No versions'
                  : `${track.run_count} version${track.run_count === 1 ? '' : 's'}`,
              ].join(' · ')

              return (
                <div
                  key={track.id}
                  className={`kp-library-row ${currentTrackId === track.id ? 'kp-library-row-active' : ''} ${isSelected ? 'kp-library-row-selected' : ''}`}
                >
                  <label className="kp-library-check" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(track.id)}
                      aria-label={`Select ${track.title}`}
                    />
                  </label>

                  <button type="button" className="kp-library-row-button" onClick={() => onOpenTrack(track)}>
                    <span className="kp-library-art" aria-hidden>
                      {track.thumbnail_url ? <img src={track.thumbnail_url} alt="" loading="lazy" /> : initials}
                    </span>
                    <span className="kp-library-copy">
                      <strong>{track.title}</strong>
                      <span>{metadata}</span>
                    </span>
                    <span className="kp-library-status">
                      <strong>{stage.label}</strong>
                      <span>{stage.detail}</span>
                    </span>
                    <span className="kp-library-next">{nextActionLabel(track)}</span>
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
