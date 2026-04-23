import { useMemo, useState } from 'react'

import { isActiveRunStatus } from '../runStatus'
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
  if (stage.key === 'processing') {
    const pct = Math.round(track.latest_run?.progress ?? 0)
    return { text: `Splitting · ${pct}%`, tone: 'processing' }
  }
  if (stage.key === 'needs-attention') return { text: 'Split failed', tone: 'attn' }
  if (stage.key === 'needs-split') return { text: 'No split yet', tone: null }
  if (stage.key === 'final') return { text: 'Final', tone: 'final' }
  return { text: null, tone: null }
}

function QueueStrip({
  draftsCount,
  activeCount,
  failedCount,
  onReviewImports,
}: {
  draftsCount: number
  activeCount: number
  failedCount: number
  onReviewImports: () => void
}) {
  const parts: string[] = []
  if (draftsCount > 0) parts.push(`${draftsCount} import${draftsCount === 1 ? '' : 's'} to review`)
  if (activeCount > 0) parts.push(`${activeCount} split${activeCount === 1 ? '' : 's'} running`)
  if (failedCount > 0) parts.push(`${failedCount} need${failedCount === 1 ? 's' : ''} attention`)
  const title =
    draftsCount > 0
      ? 'Imports waiting'
      : failedCount > 0
        ? 'Needs attention'
        : 'Splitting now'

  return (
    <section className={`library-queue ${failedCount > 0 && draftsCount === 0 && activeCount === 0 ? 'is-attn' : ''}`}>
      <div className="library-queue-copy">
        <strong>{title}</strong>
        <span>{parts.join(' · ')}</span>
      </div>
      <div className="library-queue-actions">
        {draftsCount > 0 ? (
          <button type="button" className="button-primary" onClick={onReviewImports}>
            Review
          </button>
        ) : null}
      </div>
    </section>
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
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const browseTracks = useMemo(
    () => applySongBrowse(tracks, { search: view.search, sort: view.sort }),
    [tracks, view.search, view.sort],
  )
  const activeCount = queueRuns.filter((entry) => isActiveRunStatus(entry.run.status)).length
  const failedCount = queueRuns.filter(
    (entry) => entry.run.status === 'failed' || entry.run.status === 'cancelled',
  ).length
  const showQueue = stagedImportsCount > 0 || activeCount > 0 || failedCount > 0
  const selectableTracks = useMemo(
    () =>
      browseTracks.filter((track) => {
        const stage = trackStageSummary(track)
        return stage.key === 'ready' || stage.key === 'final'
      }),
    [browseTracks],
  )
  const selectedCount = selected.size
  const allSelectable = selectableTracks.length > 0 && selectableTracks.every((track) => selected.has(track.id))

  function toggleSelect(trackId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }

  function toggleSelecting() {
    if (selecting) setSelected(new Set())
    setSelecting((value) => !value)
  }

  function toggleAll() {
    if (allSelectable) setSelected(new Set())
    else setSelected(new Set(selectableTracks.map((track) => track.id)))
  }

  function handleBatchExport() {
    if (selectedCount === 0) return
    onBatchExport(Array.from(selected))
    setSelected(new Set())
    setSelecting(false)
  }

  return (
    <section className="library">
      <h1 className="library-hero">Library</h1>

      {showQueue ? (
        <QueueStrip
          draftsCount={stagedImportsCount}
          activeCount={activeCount}
          failedCount={failedCount}
          onReviewImports={onReviewImports}
        />
      ) : null}

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
        <button
          type="button"
          className={`library-batch-toggle ${selecting ? 'is-active' : ''}`}
          onClick={toggleSelecting}
          disabled={tracks.length === 0}
        >
          {selecting ? 'Cancel' : 'Select'}
        </button>
      </div>

      {selecting && selectableTracks.length > 0 ? (
        <div className="library-toolbar">
          <button type="button" className="library-batch-toggle" onClick={toggleAll}>
            {allSelectable ? 'Clear all' : 'Select all ready'}
          </button>
          <span className="library-count">{selectedCount} selected</span>
        </div>
      ) : null}

      {browseTracks.length > 0 ? (
        <div className="library-list" role="list">
          {browseTracks.map((track) => {
            const status = rowStatus(track)
            const isActive = currentTrackId === track.id
            const isSelected = selected.has(track.id)
            const canSelect =
              selecting &&
              selectableTracks.some((candidate) => candidate.id === track.id)
            const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'
            const meta = [track.artist ?? 'Unknown artist', formatDuration(track.duration_seconds)]
              .filter(Boolean)
              .join(' · ')

            return (
              <button
                key={track.id}
                type="button"
                role="listitem"
                className={`song-row ${isActive ? 'is-active' : ''}`}
                data-batch={selecting ? 'on' : 'off'}
                onClick={(event) => {
                  if (selecting) {
                    event.preventDefault()
                    if (canSelect) toggleSelect(track.id)
                    return
                  }
                  onOpenTrack(track)
                }}
              >
                {selecting ? (
                  <span className="song-row-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canSelect}
                      onChange={() => toggleSelect(track.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${track.title}`}
                    />
                  </span>
                ) : null}
                <span className="song-row-art" aria-hidden>
                  {track.thumbnail_url ? <img src={track.thumbnail_url} alt="" loading="lazy" /> : initials}
                </span>
                <span className="song-row-copy">
                  <span className="song-row-title">{track.title}</span>
                  <span className="song-row-sub">{meta}</span>
                </span>
                {status.text ? (
                  <span className={`song-row-status ${status.tone ? `is-${status.tone}` : ''}`}>
                    {status.text}
                  </span>
                ) : (
                  <span />
                )}
              </button>
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

      {selecting && selectedCount > 0 ? (
        <div className="batch-bar" role="status">
          <span className="batch-bar-count">{selectedCount} selected</span>
          <span className="batch-bar-hint">Export as edited mix, raw stems, or both.</span>
          <button type="button" className="button-primary" onClick={handleBatchExport}>
            Export selection
          </button>
        </div>
      ) : null}
    </section>
  )
}
