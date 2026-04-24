import { useEffect, useMemo, useState } from 'react'

import { discardRejection } from '../../async'
import { formatDuration } from '../metrics'
import { describeRun, isActiveRunStatus, RUN_STATUS_LABELS } from '../runStatus'
import { SONG_BROWSE_SORT_OPTIONS, applySongBrowse, trackStageSummary } from '../trackListView'
import type { TrackStageSummary } from '../trackListView'
import type { SongsFilter, SongsView } from '../../routes'
import type { QueueRunEntry, RunSummary, TrackSummary } from '../../types'

type SongsPageProps = {
  view: SongsView
  tracks: TrackSummary[]
  currentTrackId: string | null
  stagedImportsCount: number
  queueRuns: QueueRunEntry[]
  cancellingRunId: string | null
  retryingRunId: string | null
  onViewChange: (view: SongsView) => void
  onOpenTrack: (track: TrackSummary, options?: { runId?: string | null }) => void
  onSplitTrack: (trackId: string) => void
  onAddSongs: () => void
  onReviewImports: () => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
  onBatchSplit: (trackIds: string[]) => void
  onBatchExport: (trackIds: string[]) => void
  onBatchDelete: (trackIds: string[]) => void
}

type RowStatus = {
  text: string | null
  tone: 'processing' | 'attn' | 'ready' | null
  count: number | null
  preferred: boolean
}

function rowStatusFromStage(stage: TrackStageSummary, track: TrackSummary): RowStatus {
  if (stage.key === 'processing') {
    const run = track.latest_run
    const stageLabel = run ? (RUN_STATUS_LABELS[run.status] ?? 'Splitting') : 'Splitting'
    // The progress bar in the wave cell already shows percentage — don't duplicate it
    return { text: stageLabel, tone: 'processing', count: null, preferred: false }
  }
  if (stage.key === 'needs-attention') {
    return {
      text: track.latest_run?.status === 'cancelled' ? 'Cancelled' : 'Split failed',
      tone: 'attn',
      count: null,
      preferred: false,
    }
  }
  if (stage.key === 'needs-split') return { text: null, tone: null, count: null, preferred: false }
  if (stage.key === 'final' || stage.key === 'ready') {
    return {
      text: 'Ready',
      tone: 'ready',
      count: track.run_count > 1 ? track.run_count : null,
      preferred: stage.key === 'final',
    }
  }
  return { text: null, tone: null, count: null, preferred: false }
}

function ClearIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function RowProgressBar({ run }: { run: RunSummary }) {
  const fraction = Math.max(0, Math.min(1, run.progress))
  return (
    <span
      className="song-row-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-label={describeRun(run)}
    >
      <span className="song-row-progress-fill" style={{ width: `${fraction * 100}%` }} />
    </span>
  )
}

function QueueStrip({
  draftsCount,
  activeRuns,
  failedRuns,
  cancellingRunId,
  retryingRunId,
  onReviewImports,
  onOpenRun,
  onCancelRun,
  onRetryRun,
}: {
  draftsCount: number
  activeRuns: QueueRunEntry[]
  failedRuns: QueueRunEntry[]
  cancellingRunId: string | null
  retryingRunId: string | null
  onReviewImports: () => void
  onOpenRun: (entry: QueueRunEntry) => void
  onCancelRun: (runId: string) => Promise<void>
  onRetryRun: (runId: string) => Promise<unknown>
}) {
  const activeCount = activeRuns.length
  const failedCount = failedRuns.length
  const attn = failedCount > 0 && draftsCount === 0 && activeCount === 0
  const aggregate =
    activeCount > 0
      ? activeRuns.reduce((sum, entry) => sum + Math.max(0, Math.min(1, entry.run.progress)), 0) / activeCount
      : 0
  // Show the head summary row only when it adds information beyond what the item rows show.
  // A single active run with no drafts/failures is fully described by its own row.
  const showHead = draftsCount > 0 || failedCount > 0 || activeCount > 1
  const summary: string[] = []
  if (draftsCount > 0) summary.push(`${draftsCount} import${draftsCount === 1 ? '' : 's'} to review`)
  if (showHead && activeCount > 0) summary.push(`${activeCount} split${activeCount === 1 ? '' : 's'} running`)
  if (failedCount > 0) summary.push(`${failedCount} need${failedCount === 1 ? 's' : ''} attention`)

  return (
    <section className={`library-queue ${attn ? 'is-attn' : ''}`}>
      {showHead ? (
        <div className="library-queue-head">
          <span className="library-queue-summary">{summary.join(' · ')}</span>
          {draftsCount > 0 ? (
            <button type="button" className="button-primary" onClick={onReviewImports}>
              Review imports
            </button>
          ) : null}
        </div>
      ) : null}

      {activeCount > 0 ? (
        <>
          {activeCount > 1 ? (
            <div
              className="library-queue-aggregate"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(aggregate * 100)}
              aria-label="Overall split progress"
            >
              <span className="library-queue-aggregate-fill" style={{ width: `${aggregate * 100}%` }} />
            </div>
          ) : null}
          <ul className="library-queue-list">
            {activeRuns.map((entry) => {
              const fraction = Math.max(0, Math.min(1, entry.run.progress))
              const pct = Math.round(fraction * 100)
              const label = describeRun(entry.run) || 'Queued'
              const cancelling = cancellingRunId === entry.run.id
              return (
                <li key={entry.run.id} className="library-queue-row">
                  <button type="button" className="library-queue-item" onClick={() => onOpenRun(entry)}>
                    <span className="library-queue-item-title" title={entry.track_title}>
                      {entry.track_title}
                    </span>
                    <span className="library-queue-item-stage">{label}</span>
                    <span className="library-queue-item-bar" aria-hidden>
                      <span className="library-queue-item-fill" style={{ width: `${fraction * 100}%` }} />
                    </span>
                    <span className="library-queue-item-pct">{pct}%</span>
                  </button>
                  <button
                    type="button"
                    className="library-queue-cancel"
                    disabled={cancelling}
                    onClick={() => discardRejection(() => onCancelRun(entry.run.id))}
                    aria-label={`Cancel split for ${entry.track_title}`}
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {failedCount > 0 ? (
        <ul className="library-queue-list library-queue-failed">
          {failedRuns.map((entry) => {
            const reason = entry.run.error_message?.trim() || entry.run.status_message?.trim() || 'No detail recorded'
            const label = entry.run.status === 'cancelled' ? 'Cancelled' : 'Failed'
            const retrying = retryingRunId === entry.run.id
            return (
              <li key={entry.run.id} className="library-queue-row">
                <button type="button" className="library-queue-item is-failed" onClick={() => onOpenRun(entry)}>
                  <span className="library-queue-item-title" title={entry.track_title}>
                    {entry.track_title}
                  </span>
                  <span className="library-queue-item-stage">{label}</span>
                  <span className="library-queue-item-reason" title={reason}>
                    {reason}
                  </span>
                </button>
                <button
                  type="button"
                  className="library-queue-cancel"
                  disabled={retrying}
                  onClick={() => discardRejection(() => onRetryRun(entry.run.id))}
                  aria-label={`Retry split for ${entry.track_title}`}
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

const TRACK_WAVE_VIEW_WIDTH = 320
const TRACK_WAVE_VIEW_HEIGHT = 40
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

type FilterTab = { value: SongsFilter; label: string; count: number }

export function SongsPage({
  view,
  tracks,
  currentTrackId,
  stagedImportsCount,
  queueRuns,
  cancellingRunId,
  retryingRunId,
  onViewChange,
  onOpenTrack,
  onSplitTrack,
  onAddSongs,
  onReviewImports,
  onCancelRun,
  onRetryRun,
  onBatchSplit,
  onBatchExport,
  onBatchDelete,
}: SongsPageProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    if (selected.size === 0) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selected.size])

  // Disarm delete when selection changes or clears
  useEffect(() => {
    setDeleteArmed(false)
  }, [selected.size])

  // Auto-disarm delete after 4 seconds
  useEffect(() => {
    if (!deleteArmed) return
    const id = window.setTimeout(() => setDeleteArmed(false), 4000)
    return () => window.clearTimeout(id)
  }, [deleteArmed])

  const browseTracks = useMemo(
    () => applySongBrowse(tracks, { search: view.search, sort: view.sort, filter: view.filter }),
    [tracks, view.search, view.sort, view.filter],
  )
  const activeRuns = useMemo(
    () => queueRuns.filter((entry) => isActiveRunStatus(entry.run.status)),
    [queueRuns],
  )
  const failedRuns = useMemo(
    () => queueRuns.filter((entry) => entry.run.status === 'failed' || entry.run.status === 'cancelled'),
    [queueRuns],
  )
  const showQueue = stagedImportsCount > 0 || activeRuns.length > 0 || failedRuns.length > 0

  // Counts per filter bucket (always computed from full tracks list, not filtered)
  const filterCounts = useMemo(() => {
    const counts = { 'needs-split': 0, processing: 0, attention: 0, ready: 0 }
    for (const track of tracks) {
      const stage = trackStageSummary(track)
      if (stage.key === 'needs-split') counts['needs-split']++
      else if (stage.key === 'processing') counts.processing++
      else if (stage.key === 'needs-attention') counts.attention++
      else if (stage.key === 'ready' || stage.key === 'final') counts.ready++
    }
    return counts
  }, [tracks])

  const filterTabs = useMemo<FilterTab[]>(() => {
    const tabs: FilterTab[] = [{ value: 'all', label: 'All', count: tracks.length }]
    if (filterCounts.processing > 0)
      tabs.push({ value: 'processing', label: 'Splitting', count: filterCounts.processing })
    if (filterCounts['needs-split'] > 0)
      tabs.push({ value: 'needs-split', label: 'Unsplit', count: filterCounts['needs-split'] })
    if (filterCounts.attention > 0)
      tabs.push({ value: 'attention', label: 'Issues', count: filterCounts.attention })
    if (filterCounts.ready > 0)
      tabs.push({ value: 'ready', label: 'Ready', count: filterCounts.ready })
    return tabs
  }, [tracks.length, filterCounts])

  const showFilterTabs = filterTabs.length > 2 // only show when at least 2 distinct stages are present

  const { exportableIds, splittableIds } = useMemo(() => {
    const exportable = new Set<string>()
    const splittable = new Set<string>()
    for (const track of browseTracks) {
      const stage = trackStageSummary(track)
      if (stage.key === 'ready' || stage.key === 'final') exportable.add(track.id)
      if (stage.key !== 'processing') splittable.add(track.id)
    }
    return { exportableIds: exportable, splittableIds: splittable }
  }, [browseTracks])

  const browseTrackIds = useMemo(() => new Set(browseTracks.map((track) => track.id)), [browseTracks])
  const { selectedIds, splitEligible, exportEligible } = useMemo(() => {
    const ids = Array.from(selected).filter((id) => browseTrackIds.has(id))
    return {
      selectedIds: ids,
      splitEligible: ids.filter((id) => splittableIds.has(id)),
      exportEligible: ids.filter((id) => exportableIds.has(id)),
    }
  }, [browseTrackIds, selected, splittableIds, exportableIds])
  const selectedCount = selectedIds.length
  const allSelected = browseTracks.length > 0 && browseTracks.every((track) => selectedIds.includes(track.id))

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
    else setSelected(new Set(browseTracks.map((track) => track.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function handleSplit() {
    if (!splitEligible.length) return
    onBatchSplit(splitEligible)
    setSelected(new Set())
  }

  function handleExport() {
    if (!exportEligible.length) return
    onBatchExport(exportEligible)
    setSelected(new Set())
  }

  function handleDelete() {
    if (!selectedCount) return
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    setDeleteArmed(false)
    onBatchDelete(selectedIds)
    setSelected(new Set())
  }

  const countLabel =
    view.search.trim() && browseTracks.length !== tracks.length
      ? `${browseTracks.length} of ${tracks.length}`
      : view.filter !== 'all'
        ? `${browseTracks.length} of ${tracks.length}`
        : tracks.length > 0
          ? `${tracks.length}`
          : null

  return (
    <section className="library">
      {showQueue ? (
        <QueueStrip
          draftsCount={stagedImportsCount}
          activeRuns={activeRuns}
          failedRuns={failedRuns}
          cancellingRunId={cancellingRunId}
          retryingRunId={retryingRunId}
          onReviewImports={onReviewImports}
          onOpenRun={(entry) => {
            const track = tracks.find((item) => item.id === entry.track_id)
            if (track) onOpenTrack(track, { runId: entry.run.id })
          }}
          onCancelRun={onCancelRun}
          onRetryRun={onRetryRun}
        />
      ) : null}

      {tracks.length > 0 ? (
        <>
          <div className="library-toolbar">
            <div className="library-search-wrap">
              <input
                type="search"
                className="library-search"
                placeholder="Search"
                aria-label="Search songs"
                value={view.search}
                onChange={(event) => onViewChange({ ...view, search: event.target.value })}
              />
              {view.search ? (
                <button
                  type="button"
                  className="library-search-clear"
                  onClick={() => onViewChange({ ...view, search: '' })}
                  aria-label="Clear search"
                >
                  <ClearIcon />
                </button>
              ) : null}
            </div>
            <div className="library-sort-group" role="group" aria-label="Sort songs">
              {SONG_BROWSE_SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`library-sort-btn ${view.sort === option.value ? 'is-active' : ''}`}
                  aria-pressed={view.sort === option.value}
                  onClick={() => onViewChange({ ...view, sort: option.value })}
                >
                  {option.shortLabel}
                </button>
              ))}
            </div>
            {countLabel ? (
              <span className="library-count" aria-live="polite">{countLabel}</span>
            ) : null}
          </div>

          {showFilterTabs ? (
            <div className="library-filters" role="tablist" aria-label="Filter songs">
              {filterTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={view.filter === tab.value}
                  className={`library-filter ${view.filter === tab.value ? 'is-active' : ''}`}
                  onClick={() => onViewChange({ ...view, filter: tab.value })}
                >
                  {tab.label}
                  {tab.value !== 'all' ? (
                    <span className="library-filter-count">{tab.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {browseTracks.length > 0 ? (
        <div className="library-list" role="list">
          {browseTracks.map((track) => {
            const stage = trackStageSummary(track)
            const status = rowStatusFromStage(stage, track)
            const isActive = currentTrackId === track.id
            const isSelected = selected.has(track.id)
            const initials = track.title.trim().slice(0, 1).toUpperCase() || 'S'
            const meta = [track.artist, formatDuration(track.duration_seconds)]
              .filter(Boolean)
              .join(' · ')

            const activeRun =
              track.latest_run && isActiveRunStatus(track.latest_run.status) ? track.latest_run : null
            // Only show the progress bar once work has actually started (not while queued)
            const showProgressBar = !!activeRun && activeRun.status !== 'queued' && activeRun.progress > 0
            return (
              <div
                key={track.id}
                role="listitem"
                className={`song-row ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
              >
                <label
                  className="song-row-check"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(track.id)}
                    aria-label={`Select ${track.title}`}
                  />
                </label>
                <button
                  type="button"
                  className="song-row-open"
                  onClick={() => onOpenTrack(track)}
                >
                  <span className="song-row-art" aria-hidden data-stage={stage.key}>
                    {track.thumbnail_url ? <img src={track.thumbnail_url} alt="" loading="lazy" /> : initials}
                    {stage.key !== 'needs-split' ? (
                      <span className="song-row-art-dot" aria-hidden />
                    ) : null}
                  </span>
                  <span className="song-row-copy">
                    <span className="song-row-title">{track.title}</span>
                    <span className="song-row-sub">{meta}</span>
                  </span>
                  <span className="song-row-wave-cell" aria-hidden={!showProgressBar}>
                    {showProgressBar ? <RowProgressBar run={activeRun!} /> : <TrackWaveThumb track={track} />}
                  </span>
                </button>
                <div className="song-row-meta">
                  {stage.key === 'needs-split' ? (
                    <button
                      type="button"
                      className="song-row-split-action"
                      onClick={() => onSplitTrack(track.id)}
                      aria-label={`Split ${track.title}`}
                    >
                      Split
                    </button>
                  ) : status.text ? (
                    <span className={`song-row-status ${status.tone ? `is-${status.tone}` : ''} ${status.preferred ? 'is-preferred' : ''}`}>
                      {status.preferred ? (
                        <span className="song-row-status-star" aria-label="Preferred version" title="Preferred version">★</span>
                      ) : null}
                      {status.text}
                      {status.count ? (
                        <span className="song-row-status-count" aria-label={`${status.count} versions`}>
                          · {status.count}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : tracks.length > 0 ? (
        <div className="library-empty">
          <strong>No songs match</strong>
          {view.filter !== 'all' ? (
            <>
              <p>No songs match this filter.</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onViewChange({ ...view, filter: 'all' })}
              >
                Clear filter
              </button>
            </>
          ) : (
            <>
              <p>No results for "{view.search}".</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onViewChange({ ...view, search: '' })}
              >
                Clear search
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="library-empty library-empty-onboard">
          <strong>Start by adding a song</strong>
          <p>Drop audio files anywhere, paste a YouTube URL, or browse your computer.</p>
          <button type="button" className="button-primary" onClick={onAddSongs}>
            Add songs
          </button>
        </div>
      )}

      {selectedCount > 0 ? (
        <div className="batch-bar" role="toolbar" aria-label="Batch actions">
          <span className="batch-bar-count" aria-live="polite">
            {selectedCount} selected
          </span>
          <div className="batch-bar-spacer" />
          {!deleteArmed ? (
            <>
              {!allSelected ? (
                <button type="button" className="button-link" onClick={toggleAll}>
                  Select all
                </button>
              ) : null}
              <button type="button" className="button-link" onClick={clearSelection}>
                Clear
              </button>
              {splitEligible.length > 0 ? (
                <button type="button" className="button-primary" onClick={handleSplit}>
                  Split {splitEligible.length}
                </button>
              ) : null}
              {exportEligible.length > 0 ? (
                <button type="button" className="button-secondary" onClick={handleExport}>
                  Export {exportEligible.length}
                </button>
              ) : null}
              <button type="button" className="button-danger" onClick={handleDelete}>
                Delete {selectedCount}
              </button>
            </>
          ) : (
            <>
              <span className="batch-bar-delete-prompt">Permanently delete {selectedCount} song{selectedCount === 1 ? '' : 's'}?</span>
              <button type="button" className="button-danger" onClick={handleDelete}>
                Delete
              </button>
              <button type="button" className="button-link" onClick={() => setDeleteArmed(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
