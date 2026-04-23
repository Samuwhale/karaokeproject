import { useMemo, useState } from 'react'

import { QueueList } from './QueueList'
import { RUN_STATUS_LABELS } from '../runStatus'
import { SONG_BROWSE_SORT_OPTIONS, applySongBrowse, trackStageSummary } from '../trackListView'
import type { SongsView } from '../../routes'
import type { QueueRunEntry, TrackSummary } from '../../types'

type SongsPageProps = {
  view: SongsView
  tracks: TrackSummary[]
  currentTrackId: string | null
  stagedImportsCount: number
  queueRuns: QueueRunEntry[]
  onViewChange: (view: SongsView) => void
  onOpenTrack: (track: TrackSummary, options?: { runId?: string | null }) => void
  onAddSongs: () => void
  onReviewImports: () => void
  onBatchExport: (trackIds: string[]) => void
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = (total % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

type RowStatus = { text: string | null; tone: 'processing' | 'attn' | 'final' | null }

function rowStatus(track: TrackSummary): RowStatus {
  const stage = trackStageSummary(track)
  const run = track.latest_run
  if (stage.key === 'processing' && run) {
    const label = RUN_STATUS_LABELS[run.status] ?? 'Processing'
    const percent = run.status === 'queued' ? null : Math.round(run.progress)
    return { text: percent === null ? label : `${label} · ${percent}%`, tone: 'processing' }
  }
  if (stage.key === 'needs-attention') {
    return { text: run?.status === 'cancelled' ? 'Cancelled' : 'Split failed', tone: 'attn' }
  }
  if (stage.key === 'needs-split') return { text: 'No split yet', tone: null }
  if (stage.key === 'final') return { text: 'Final', tone: 'final' }
  return { text: null, tone: null }
}

const TRACK_WAVE_VIEW_WIDTH = 320
const TRACK_WAVE_VIEW_HEIGHT = 28
const TRACK_WAVE_MID = TRACK_WAVE_VIEW_HEIGHT / 2
const TRACK_WAVE_MAX_HALF = TRACK_WAVE_MID - 1

function TrackWaveThumb({ track }: { track: TrackSummary }) {
  const peaks = track.source_peaks
  if (peaks.length === 0) {
    return (
      <svg
        className="track-wave track-wave-empty"
        viewBox={`0 0 ${TRACK_WAVE_VIEW_WIDTH} ${TRACK_WAVE_VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1={0}
          y1={TRACK_WAVE_MID}
          x2={TRACK_WAVE_VIEW_WIDTH}
          y2={TRACK_WAVE_MID}
          strokeDasharray="2 4"
        />
      </svg>
    )
  }
  const barWidth = TRACK_WAVE_VIEW_WIDTH / peaks.length
  return (
    <svg
      className="track-wave"
      viewBox={`0 0 ${TRACK_WAVE_VIEW_WIDTH} ${TRACK_WAVE_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {peaks.map((peak, index) => {
        const half = Math.max(0.5, Math.min(TRACK_WAVE_MAX_HALF, peak * TRACK_WAVE_MAX_HALF))
        return (
          <rect
            key={index}
            x={index * barWidth}
            y={TRACK_WAVE_MID - half}
            width={Math.max(1, barWidth - 0.6)}
            height={half * 2}
          />
        )
      })}
    </svg>
  )
}

export function SongsPage({
  view,
  tracks,
  currentTrackId,
  stagedImportsCount,
  queueRuns,
  onViewChange,
  onOpenTrack,
  onAddSongs,
  onReviewImports,
  onBatchExport,
}: SongsPageProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const browseTracks = useMemo(
    () => applySongBrowse(tracks, { search: view.search, sort: view.sort }),
    [tracks, view.search, view.sort],
  )
  const exportableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const track of browseTracks) {
      const stage = trackStageSummary(track)
      if (stage.key === 'ready' || stage.key === 'final') ids.add(track.id)
    }
    return ids
  }, [browseTracks])
  const selectedCount = selected.size
  const allSelected = exportableIds.size > 0 && Array.from(exportableIds).every((id) => selected.has(id))

  function toggleSelect(trackId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(exportableIds))
  }

  function handleBatchExport() {
    if (selectedCount === 0) return
    onBatchExport(Array.from(selected))
    setSelected(new Set())
  }

  function clearSelection() {
    setSelected(new Set())
  }

  return (
    <section className="library">
      <h1 className="library-hero">Library</h1>

      <QueueList
        draftsCount={stagedImportsCount}
        queueRuns={queueRuns}
        onReviewImports={onReviewImports}
        onOpenRun={(entry) => {
          const track = tracks.find((item) => item.id === entry.track_id)
          if (track) onOpenTrack(track, { runId: entry.run.id })
        }}
      />

      <div className="library-toolbar">
        <input
          type="search"
          className="library-search"
          placeholder="Search title or artist"
          aria-label="Search songs"
          value={view.search}
          onChange={(event) => onViewChange({ ...view, search: event.target.value })}
        />
        <select
          className="library-sort"
          aria-label="Sort songs"
          value={view.sort}
          onChange={(event) => onViewChange({ ...view, sort: event.target.value as SongsView['sort'] })}
        >
          {SONG_BROWSE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {browseTracks.length > 0 ? (
        <div className="library-list" role="list">
          {browseTracks.map((track) => {
            const status = rowStatus(track)
            const isActive = currentTrackId === track.id
            const isSelected = selected.has(track.id)
            const canSelect = exportableIds.has(track.id)
            const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'
            const meta = [track.artist ?? 'Unknown artist', formatDuration(track.duration_seconds)]
              .filter(Boolean)
              .join(' · ')

            return (
              <div
                key={track.id}
                role="listitem"
                className={`song-row ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
              >
                <label
                  className={`song-row-check ${canSelect ? '' : 'is-disabled'}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canSelect}
                    onChange={() => toggleSelect(track.id)}
                    aria-label={`Select ${track.title}`}
                  />
                </label>
                <button
                  type="button"
                  className="song-row-open"
                  onClick={() => onOpenTrack(track)}
                >
                  <span className="song-row-art" aria-hidden>
                    {track.thumbnail_url ? <img src={track.thumbnail_url} alt="" loading="lazy" /> : initials}
                  </span>
                  <span className="song-row-copy">
                    <span className="song-row-title">{track.title}</span>
                    <span className="song-row-sub">{meta}</span>
                  </span>
                  <span className="song-row-wave-cell" aria-hidden>
                    <TrackWaveThumb track={track} />
                  </span>
                  {status.text ? (
                    <span className={`song-row-status ${status.tone ? `is-${status.tone}` : ''}`}>
                      {status.text}
                    </span>
                  ) : (
                    <span />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      ) : tracks.length > 0 ? (
        <p className="library-empty">No songs match this search.</p>
      ) : (
        <div className="library-empty">
          <strong>No songs yet</strong>
          <p>Paste a YouTube URL, drop audio files, or hit Add to start.</p>
          <button type="button" className="button-primary" onClick={onAddSongs}>
            Add songs
          </button>
        </div>
      )}

      {selectedCount > 0 ? (
        <div className="batch-bar" role="status">
          <span className="batch-bar-count">{selectedCount} selected</span>
          <div className="batch-bar-spacer" />
          <button type="button" className="button-link" onClick={toggleAll}>
            {allSelected ? 'Clear all' : 'Select all ready'}
          </button>
          <button type="button" className="button-link" onClick={clearSelection}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={handleBatchExport}>
            Export selection
          </button>
        </div>
      ) : null}
    </section>
  )
}
