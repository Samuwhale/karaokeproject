import type { TrackSummary } from '../types'
import { ProgressBar } from './feedback/ProgressBar'
import { Skeleton } from './feedback/Skeleton'
import { isActiveRunStatus } from './runStatus'
import {
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

type TrackListProps = {
  tracks: TrackSummary[]
  totalCount: number
  selectedTrackId: string | null
  hasFirstSync: boolean
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  onSelect: (trackId: string) => void
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
  const countLabel = hasFirstSync ? `${tracks.length} of ${totalCount}` : null
  const allSelected = tracks.length > 0 && tracks.every((track) => selectedIds.has(track.id))
  const activeFilter = libraryFilterMeta(view.filter)

  function emptyMessage() {
    switch (view.filter) {
      case 'needs-attention':
        return 'No songs need follow-up right now.'
      case 'ready-to-render':
        return 'No songs are waiting for a first render.'
      case 'rendering':
        return 'Nothing is rendering right now.'
      case 'ready':
        return 'No songs are ready for a final decision yet.'
      case 'final':
        return 'No songs have a chosen final version yet.'
      default:
        return 'No tracks match this search.'
    }
  }

  function handleToggleAll() {
    if (allSelected) onClearSelection()
    else onSelectAll(tracks.map((track) => track.id))
  }

  return (
    <div className="track-list-wrap">
      <div className="section-head">
        <div className="section-head-copy">
          <h2>Songs</h2>
          <p>{activeFilter.description}</p>
        </div>
        <div className="track-list-head-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => onSelectionModeChange(!selectionMode)}
          >
            {selectionMode ? 'Done' : 'Batch Select'}
          </button>
        </div>
      </div>

      {libraryEmpty ? null : (
        <div className="library-controls">
          <input
            type="search"
            className="library-search"
            placeholder="Search songs"
            aria-label="Search tracks by title or artist"
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
            {countLabel ? <span className="library-count">{activeFilter.label} · Showing {countLabel}</span> : null}
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
        <p className="empty-state track-list-empty">
          No songs yet. Import files or paste a YouTube URL, review the staged songs, then choose whether to render immediately or later.
        </p>
      ) : noMatches ? (
        <p className="empty-state track-list-empty">
          {emptyMessage()}
        </p>
      ) : (
        <div className="track-list">
          {tracks.map((track) => {
            const latest = track.latest_run
            const isSelected = selectedIds.has(track.id)
            const stage = trackStageSummary(track)
            const latestRunActive = latest ? isActiveRunStatus(latest.status) : false
            const metaSummary = [
              track.source_type === 'youtube' ? 'YouTube' : 'Local file',
              formatDuration(track.duration_seconds),
              track.run_count === 0
                ? 'No renders yet'
                : `${track.run_count} render${track.run_count === 1 ? '' : 's'}`,
            ].join(' · ')

            const content = (
              <>
                <div className="track-card-header">
                  <div>
                    <strong>{track.title}</strong>
                    <p>{artistLine(track)}</p>
                  </div>
                  <span className={`track-card-stage ${stage.toneClassName}`}>
                    {stage.label}
                  </span>
                </div>
                <p className="track-card-summary">{stage.detail}</p>
                <div className="track-card-footer">
                  <span>{metaSummary}</span>
                  {track.has_custom_mix ? <span>Custom mix saved</span> : null}
                </div>
                {latestRunActive && latest ? (
                  <div className="track-card-progress">
                    <ProgressBar value={latest.progress} />
                  </div>
                ) : null}
              </>
            )

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
                  className="track-card track-card-main"
                  onClick={() => onSelect(track.id)}
                >
                  {content}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
