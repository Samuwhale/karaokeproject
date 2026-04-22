import type { TrackSummary } from '../types'
import { ProgressBar } from './feedback/ProgressBar'
import { Skeleton } from './feedback/Skeleton'

export type LibrarySort = 'recent' | 'created' | 'title' | 'runs'
export type LibraryFilter = 'all' | 'failed' | 'has-keeper' | 'no-keeper'

export type LibraryView = {
  search: string
  sort: LibrarySort
  filter: LibraryFilter
}

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  search: '',
  sort: 'recent',
  filter: 'all',
}

const ACTIVE_RUN_STATUSES = new Set(['queued', 'preparing', 'separating', 'exporting'])

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'created', label: 'Recently imported' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'runs', label: 'Most runs' },
]

const FILTER_OPTIONS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All tracks' },
  { value: 'failed', label: 'Failed' },
  { value: 'has-keeper', label: 'With Final Render' },
  { value: 'no-keeper', label: 'Without Final Render' },
]

export function applyLibraryView(tracks: TrackSummary[], view: LibraryView): TrackSummary[] {
  const query = view.search.trim().toLowerCase()
  const matches = tracks.filter((track) => {
    if (query) {
      const haystack = `${track.title} ${track.artist ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    const latestStatus = track.latest_run?.status ?? null
    switch (view.filter) {
      case 'failed':
        return latestStatus === 'failed'
      case 'has-keeper':
        return !!track.keeper_run_id
      case 'no-keeper':
        return !track.keeper_run_id
      default:
        return true
    }
  })
  return [...matches].sort((a, b) => {
    switch (view.sort) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'runs':
        return b.run_count - a.run_count
      case 'created':
        return b.created_at.localeCompare(a.created_at)
      default:
        return b.updated_at.localeCompare(a.updated_at)
    }
  })
}

type TrackListProps = {
  tracks: TrackSummary[]
  totalCount: number
  selectedTrackId: string | null
  hasFirstSync: boolean
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  onSelect: (trackId: string) => void
  onAddTracks: () => void
  selectionMode: boolean
  onSelectionModeChange: (enabled: boolean) => void
  selectedIds: Set<string>
  onToggleSelect: (trackId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function artistLine(track: TrackSummary) {
  if (track.artist) return track.artist
  return `(from ${track.source_filename})`
}

export function TrackList({
  tracks,
  totalCount,
  selectedTrackId,
  hasFirstSync,
  view,
  onViewChange,
  onSelect,
  onAddTracks,
  selectionMode,
  onSelectionModeChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: TrackListProps) {
  const libraryEmpty = hasFirstSync && totalCount === 0
  const showSkeleton = !hasFirstSync && totalCount === 0
  const noMatches = hasFirstSync && totalCount > 0 && tracks.length === 0
  const isFiltered = view.search.trim() !== '' || view.filter !== 'all'
  const countLabel = hasFirstSync
    ? isFiltered
      ? `${tracks.length} of ${totalCount}`
      : `${totalCount}`
    : null
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <div className="track-list-wrap">
      <div className="section-head">
        <h2>Library</h2>
        <div className="track-list-head-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => onSelectionModeChange(!selectionMode)}
          >
            {selectionMode ? 'Done' : 'Select'}
          </button>
          <button type="button" className="button-primary" onClick={onAddTracks}>
            Add sources
          </button>
        </div>
      </div>

      {libraryEmpty ? null : (
        <div className="library-controls">
          <input
            type="search"
            className="library-search"
            placeholder="Search title or artist"
            value={view.search}
            onChange={(event) => onViewChange({ ...view, search: event.target.value })}
          />
          <div className="library-control-row">
            <select
              aria-label="Sort"
              value={view.sort}
              onChange={(event) => onViewChange({ ...view, sort: event.target.value as LibrarySort })}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter"
              value={view.filter}
              onChange={(event) => onViewChange({ ...view, filter: event.target.value as LibraryFilter })}
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {countLabel ? <span className="library-count">{countLabel}</span> : null}
          </div>
          {selectionMode && tracks.length > 0 ? (
            <div className="list-controls">
              <label className="checkbox-row">
                <input type="checkbox" checked={allSelected} onChange={handleToggleAll} />
                <span>{allSelected ? 'Clear all' : 'Select all'}</span>
              </label>
            </div>
          ) : null}
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
        <p className="empty-state" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
          Library is empty. Add files or paste a YouTube URL to stage sources, then choose how to render them.
        </p>
      ) : noMatches ? (
        <p className="empty-state" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
          No tracks match this search or filter.
        </p>
      ) : (
        <div className="track-list">
          {tracks.map((track) => {
            const latest = track.latest_run
            const isActive = latest ? ACTIVE_RUN_STATUSES.has(latest.status) : false
            const isFailed = latest?.status === 'failed'
            const isSelected = selectedIds.has(track.id)
            const hasKeeper = !!track.keeper_run_id
            return (
              <div
                key={track.id}
                className={`track-card-shell ${selectionMode ? 'track-card-shell-selecting' : ''} ${selectedTrackId === track.id ? 'track-card-active' : ''} ${isSelected ? 'track-card-checked' : ''}`}
              >
                {selectionMode ? (
                  <label className="track-card-check" onClick={(e) => e.stopPropagation()}>
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
                  className="track-card"
                  onClick={() => onSelect(track.id)}
                >
                  <div className="track-card-header">
                    <div>
                      <strong>{track.title}</strong>
                      <p>{artistLine(track)}</p>
                    </div>
                    {isFailed ? (
                      <span className="track-card-status track-card-status-failed">
                        <span className="topbar-dot topbar-dot-err" /> Failed
                      </span>
                    ) : hasKeeper ? (
                      <span
                        className="track-card-status track-card-status-final"
                        title="A render is marked as final"
                      >
                        Final Render
                      </span>
                    ) : null}
                  </div>
                  <div className="track-card-footer">
                    <span>
                      {track.source_type === 'youtube' ? 'YouTube' : 'local'} ·{' '}
                      {formatDuration(track.duration_seconds)}
                    </span>
                    <span>
                      {track.run_count === 0
                        ? 'no renders'
                        : `${track.run_count} render${track.run_count === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {isActive && latest ? (
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
    </div>
  )
}
