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
  selectionMode: boolean
  selectedIds: Set<string>
  onViewChange: (view: LibraryView) => void
  onSelectionModeChange: (enabled: boolean) => void
  onToggleSelect: (trackId: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  onOpenTrack: (trackId: string) => void
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

function emptyMessage(filter: LibraryFilter) {
  switch (filter) {
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

export function LibraryPage({
  view,
  tracks,
  totalCount,
  hasFirstSync,
  countsByFilter,
  currentTrackId,
  selectionMode,
  selectedIds,
  onViewChange,
  onSelectionModeChange,
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

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <section className="suite-page library-page">
      <header className="suite-page-head">
        <div>
          <h1>Songs</h1>
          <p>Find the next song to split, review, or finish in Studio.</p>
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

      <div className="library-overview" aria-label="Song library overview">
        <div>
          <strong>{countsByFilter['ready-to-render']}</strong>
          <span>need a first split</span>
        </div>
        <div>
          <strong>{countsByFilter.ready}</strong>
          <span>need a final decision</span>
        </div>
        <div>
          <strong>{countsByFilter.final}</strong>
          <span>have a saved final</span>
        </div>
      </div>

      <div className="library-toolbar">
        <input
          type="search"
          className="library-search"
          placeholder="Search title or artist"
          aria-label="Search tracks by title or artist"
          value={view.search}
          onChange={(event) => onViewChange({ ...view, search: event.target.value })}
        />
        <div className="library-toolbar-actions">
          <select
            aria-label="Filter library"
            value={view.filter}
            onChange={(event) => onViewChange({ ...view, filter: event.target.value as LibraryFilter })}
          >
            {LIBRARY_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label} ({countsByFilter[filter.value]})
              </option>
            ))}
          </select>
          <select
            aria-label="Sort library"
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
          No songs yet. Add files or paste a YouTube URL, then queue the first split when you are ready.
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
                  ? 'Retry or change split'
                  : stage.key === 'ready'
                    ? 'Review in Studio and choose the final split'
                    : stage.key === 'final'
                      ? 'Ready to export again'
                      : 'Queue first split'
            const metaSummary = [
              track.source_type === 'youtube' ? 'YouTube' : 'Local',
              formatDuration(track.duration_seconds),
              track.run_count === 0
                ? 'No splits yet'
                : `${track.run_count} split${track.run_count === 1 ? '' : 's'}`,
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
  )
}
